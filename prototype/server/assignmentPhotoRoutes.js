import { Router, json } from 'express';
import { assignmentPhotoCapabilities, recognizeAssignmentPhotos, createAssignmentPhotoService } from './assignmentPhoto.js';

export function createAssignmentPhotoRouter({ db, assignments, bank, requireRole, options = {} }) {
  const router = Router(), service = createAssignmentPhotoService({ db, assignments, bank });
  const pending = new Set(), requests = new Map();
  router.use('/teacher/assignment-photos', requireRole('teacher'), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/teacher/assignment-photos/capabilities', (_req, res) => res.json(assignmentPhotoCapabilities(options.env)));
  router.post('/teacher/assignment-photos/recognize', json({ limit: '15mb' }), async (req, res, next) => {
    const id = req.user.id, now = Date.now();
    for (const [key, times] of requests) if (times.every(time => now - time >= 60000)) requests.delete(key);
    const times = (requests.get(id) ?? []).filter(time => now - time < 60000);
    if (pending.has(id) || times.length >= 6) return res.status(429).json({ error: '正在识别或操作过于频繁，请稍后重试' });
    pending.add(id); requests.set(id, [...times, now]);
    try { res.json(await recognizeAssignmentPhotos(req.body, options)); } catch (error) { next(error); } finally { pending.delete(id); }
  });
  router.post('/teacher/assignment-photos/save', json({ limit: '2mb' }), (req, res, next) => {
    try { res.json(service.save(req.user.id, req.body)); } catch (error) { next(error); }
  });
  return router;
}
