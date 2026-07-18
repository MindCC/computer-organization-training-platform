import { Router } from "express";
import { buildClassroomHeatmap, buildStudentReplay } from "./classroomAnalytics.js";
import { getClassroomMission } from "../src/shared/classroomMissionDefinitions.js";

export function createClassroomSessionRouter({ service, requireRole }) {
  const router = Router();

  router.post("/teacher/classes/:classId/sessions", requireRole("teacher"), (req, res, next) => {
    try {
      const session = service.createDraft({
        teacherId: req.user.id,
        classId: Number(req.params.classId),
        config: req.body,
      });
      res.status(201).json({ session });
    } catch (error) {
      next(error);
    }
  });

  for (const action of ["start", "pause", "resume", "end"]) {
    router.post(`/teacher/sessions/:id/${action}`, requireRole("teacher"), (req, res, next) => {
      try {
        const result = service[action]({ teacherId: req.user.id, sessionId: Number(req.params.id) });
        res.json(action === "end" ? result : { session: result });
      } catch (error) {
        next(error);
      }
    });
  }

  router.get("/teacher/sessions/:id/overview", requireRole("teacher"), (req, res, next) => {
    try {
      res.json(service.getTeacherOverview({ teacherId: req.user.id, sessionId: Number(req.params.id) }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/teacher/sessions/:id/report", requireRole("teacher"), (req, res, next) => {
    try {
      res.json({ report: service.getReport({ teacherId: req.user.id, sessionId: Number(req.params.id) }) });
    } catch (error) { next(error); }
  });

  router.get("/teacher/sessions/:id/analytics", requireRole("teacher"), (req, res, next) => {
    try {
      const overview = service.getTeacherOverview({ teacherId: req.user.id, sessionId: Number(req.params.id) });
      const s = overview.session;
      const m = getClassroomMission(s.template_key, s.template_version);
      res.json(buildClassroomHeatmap({ session: s, students: overview.students, mission: m }));
    } catch (error) { next(error); }
  });

  router.get("/teacher/sessions/:sessionId/students/:studentId/replay", requireRole("teacher"), (req, res, next) => {
    try {
      const rows = service.db.prepare("SELECT * FROM challenge_attempts WHERE student_id = ? AND session_id = ? ORDER BY id ASC")
        .all(Number(req.params.studentId), Number(req.params.sessionId));
      res.json(buildStudentReplay(Number(req.params.sessionId), rows));
    } catch (error) { next(error); }
  });

  router.get("/student/classroom/current", requireRole("student"), (req, res, next) => {
    try {
      res.json(service.getStudentCurrent({ studentId: req.user.id }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/student/classroom/:sessionId/enter", requireRole("student"), (req, res, next) => {
    try {
      res.json(service.enterStudent({ studentId: req.user.id, sessionId: Number(req.params.sessionId) }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
