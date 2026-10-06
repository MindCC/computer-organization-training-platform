import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { createUser, getUserByUsername, migrate, openDatabase } from './db.js';
import { hashPassword } from './auth.js';

test('feedback submissions persist and only the authenticated administrator can read them', async () => {
  const db = openDatabase(':memory:');
  migrate(db);
  for (const role of ['student', 'teacher']) createUser(db, { username: role, displayName: role, role, passwordHash: await hashPassword('Test123!') });
  const server = createApp({ db, serveStatic: false }).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, payload, cookie) {
    const response = await fetch(base + route, { method: payload ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    const guest = await request('/api/feedback', { content: '希望讲演支持倍速播放', category: 'suggestion', contact: '试用者', page: 'AI讲演' });
    assert.equal(guest.status, 201);
    assert.deepEqual(Object.keys(guest.body).sort(), ['id', 'ok']);
    assert.equal((await request('/api/admin/feedback')).status, 401);
    assert.equal((await request('/api/feedback', { content: '   ' })).status, 400);
    assert.equal((await request('/api/feedback', { content: 'a'.repeat(5001) })).status, 400);
    assert.equal((await request('/api/feedback', { content: '建议', category: 'invalid' })).status, 400);
    for (const role of ['student', 'teacher']) {
      const login = await request('/api/auth/login', { username: role, password: 'Test123!', role });
      assert.equal(login.status, 200);
      assert.equal((await request('/api/admin/feedback', null, login.cookie)).status, 403);
      assert.equal((await request('/api/feedback', { content: `${role}的建议`, role: 'admin' }, login.cookie)).status, 201);
    }
    assert.equal((await request('/api/auth/login', { username: 'admin', password: 'wrong', role: 'admin' })).status, 401);
    const login = await request('/api/auth/login', { username: 'admin', password: 'admin123', role: 'teacher' });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'admin');
    assert.equal('password_hash' in login.body.user, false);
    const list = await request('/api/admin/feedback?limit=2', null, login.cookie);
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 3);
    assert.equal(list.body.items.length, 2);
    const older = await request('/api/admin/feedback?limit=2&offset=2', null, login.cookie);
    assert.equal(older.body.items[0].content, '希望讲演支持倍速播放');
    assert.equal(older.body.items[0].username, null);
    assert.equal((await request('/api/teacher/classes', null, login.cookie)).status, 403);
    const persistedHash = getUserByUsername(db, 'admin').password_hash;
    createApp({ db, serveStatic: false });
    assert.equal(getUserByUsername(db, 'admin').password_hash, persistedHash);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM feedback').get().n, 3);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});

test('extending legacy user roles preserves accounts, classroom references and sessions', () => {
  const db = openDatabase(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('teacher', 'student')), password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')), profile_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  try {
    db.exec(`CREATE TABLE classes (id INTEGER PRIMARY KEY, name TEXT NOT NULL, teacher_id INTEGER REFERENCES users(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE sessions (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), token_hash TEXT UNIQUE, expires_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE INDEX custom_user_index ON users(display_name);
      INSERT INTO users (id, username, display_name, role, password_hash) VALUES (42, 'old-teacher', '原教师', 'teacher', 'existing-hash');
      INSERT INTO users (id, username, display_name, role, password_hash) VALUES (99, 'deleted-account', '原账号', 'student', 'existing-hash');
      DELETE FROM users WHERE id = 99;
      INSERT INTO classes (id, name, teacher_id) VALUES (7, '原班级', 42);
      INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (1, 42, 'old-token', '2099-01-01')`);
    migrate(db);
    const admin = createUser(db, { username: 'new-admin', displayName: '管理员', role: 'admin', passwordHash: 'admin-hash' });
    assert.ok(admin.id > 99, 'deleted account IDs must not be reused after migration');
    assert.equal(getUserByUsername(db, 'old-teacher').password_hash, 'existing-hash');
    assert.equal(db.prepare('SELECT teacher_id FROM classes WHERE id = 7').get().teacher_id, 42);
    assert.equal(db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').get('old-token').user_id, 42);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'custom_user_index'").get());
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
});
