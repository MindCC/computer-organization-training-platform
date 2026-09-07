import { Router } from "express";
export function createCpuPracticeRouter({ service, requireRole, audit }) {
  const router = Router(); const student = requireRole("student"); const send = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  router.get("/student/cpu-practice", student, send((req, res) => res.json({ run: service.getRun({ studentId: req.user.id }) })));
  router.post("/student/cpu-practice/events", student, send((req, res) => { const run = service.appendEvents({ studentId: req.user.id, payload: req.body }); audit(req, "cpu_practice_events_saved", { targetType: "cpu_practice_run", targetId: run.id, metadata: { revision: run.state.revision, duplicate: run.duplicate } }); res.json({ run }); }));
  return router;
}
