import { Router } from "express";
export function createCpuPracticeRouter({ service, requireRole, audit }) {
  const router = Router(); const send = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  for(const role of ['student','teacher']) {
    const authorize=requireRole(role),base=`/${role}/cpu-practice`;
    router.get(base, authorize, send((req, res) => {res.set('Cache-Control','no-store');res.json({ run: service.getRun({ studentId: req.user.id }) });}));
    router.post(base+'/events', authorize, send((req, res) => { const run = service.appendEvents({ studentId: req.user.id, payload: req.body }); audit(req, "cpu_practice_events_saved", { targetType: "cpu_practice_run", targetId: run.id, metadata: { revision: run.state.revision, duplicate: run.duplicate } }); res.json({ run }); }));
  }
  return router;
}
