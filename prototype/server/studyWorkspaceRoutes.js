import { Router } from 'express';
import { createStudyWorkspace } from './studyWorkspace.js';

export function createStudyWorkspaceRouter({ db, requireRole, options = {} }) {
  const router = Router(), service = createStudyWorkspace(db, options);
  const route = fn => (req, res, next) => { res.set('Cache-Control','no-store'); req.body ??= {}; try { const result = fn(req); res.json(result); } catch (error) { if (error.status) res.status(error.status).json({ error: error.message }); else next(error); } };
  for (const role of ['student','teacher']) {
    const base = `/${role}/study-workspace`;
    router.use(base, requireRole(role));
    router.get(base, route(req => service.snapshot(req.user)));
    router.post(base + '/plans', route(req => ({ plan: service.createPlan(req.user, req.body) })));
    router.patch(base + '/plans/:id', route(req => ({ plan: service.updatePlan(req.user, Number(req.params.id), req.body) })));
    router.post(base + '/plans/:id/complete', route(req => ({ plan: service.completePlan(req.user, Number(req.params.id), req.body) })));
    router.post(base + '/plans/:id/archive', route(req => ({ plan: service.archivePlan(req.user, Number(req.params.id), req.body) })));
    router.post(base + '/timer', route(req => ({ timer: service.start(req.user, req.body) })));
    router.post(base + '/timer/:id/:action', route(req => ({ timer: service.timerAction(req.user, Number(req.params.id), req.params.action, req.body) })));
  }
  return router;
}
