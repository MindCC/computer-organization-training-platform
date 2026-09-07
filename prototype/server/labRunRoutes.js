import { Router } from "express";

export function createLabRunRouter({ service, requireRole, audit }) {
  const router = Router();
  const student = requireRole("student");
  const teacher = requireRole("teacher");
  const send = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  router.post("/student/lab-runs", student, send((req, res) => {
    const run = service.createRun({ studentId: req.user.id, courseVersionId: Number(req.body?.courseVersionId), stepId: req.body?.stepId });
    audit(req, "lab_run_created", { targetType: "lab_run", targetId: run.id, metadata: { courseVersionId: run.courseVersionId, stepId: run.stepId } });
    res.status(201).json({ run });
  }));
  router.get("/student/lab-runs/:id", student, send((req, res) => res.json({ run: service.getRun({ studentId: req.user.id, runId: Number(req.params.id) }) })));
  router.post("/student/lab-runs/:id/events", student, send((req, res) => {
    const run = service.appendEvents({ studentId: req.user.id, runId: Number(req.params.id), payload: req.body });
    audit(req, "lab_run_events_saved", { targetType: "lab_run", targetId: run.id, metadata: { revision: run.state.revision, duplicate: run.duplicate } });
    res.json({ run });
  }));
  router.get("/teacher/classes/:classId/lab-runs", teacher, send((req, res) => {
    res.json({ runs: service.listTeacherRuns({ teacherId: req.user.id, classId: Number(req.params.classId) }) });
  }));
  return router;
}
