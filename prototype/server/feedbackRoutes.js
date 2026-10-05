import express from 'express';
import { hashPasswordSync } from './auth.js';
import { createUser, getUserByUsername } from './db.js';

export function ensureFeedbackAdmin(db) {
  const existing = getUserByUsername(db, 'admin');
  if (existing) {
    if (existing.role !== 'admin') throw new Error('admin 账号已被其他身份占用，请先检查账号');
    return;
  }
  createUser(db, { username: 'admin', displayName: '管理员', role: 'admin', passwordHash: hashPasswordSync('admin123') });
}

export function createFeedbackRouter({ db, requireRole }) {
  db.exec(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT,
    display_name TEXT,
    category TEXT NOT NULL CHECK (category IN ('suggestion', 'bug', 'other')),
    content TEXT NOT NULL,
    contact TEXT NOT NULL DEFAULT '',
    page TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  const router = express.Router();
  router.post('/feedback', (req, res) => {
    const { content, category = 'suggestion', contact = '', page = '' } = req.body ?? {};
    if (typeof content !== 'string' || !content.trim() || content.length > 5000) return res.status(400).json({ error: '请填写反馈内容，最多 5000 个字' });
    if (!['suggestion', 'bug', 'other'].includes(category)) return res.status(400).json({ error: '请选择有效的反馈类型' });
    if (typeof contact !== 'string' || contact.length > 120 || typeof page !== 'string' || page.length > 200) return res.status(400).json({ error: '联系方式或页面信息过长' });
    const result = db.prepare('INSERT INTO feedback (user_id, username, display_name, category, content, contact, page) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user?.id ?? null, req.user?.username ?? null, req.user?.display_name ?? null, category, content.trim(), contact.trim(), page.trim());
    res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
  });
  router.get('/admin/feedback', requireRole('admin'), (req, res) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const items = db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
    const total = db.prepare('SELECT COUNT(*) AS total FROM feedback').get().total;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items, total, limit, offset });
  });
  return router;
}
