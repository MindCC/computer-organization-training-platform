import { Router } from "express";

export function createAssignmentRouter({ service, requireRole }) {
  const router = Router();

  // Teacher: create assignment
  router.post("/teacher/classes/:classId/assignments", requireRole("teacher"), (req, res, next) => {
    try {
      const { title, description, dueAt } = req.body ?? {};
      const a = service.createAssignment({ teacherId: req.user.id, classId: Number(req.params.classId), title, description, dueAt });
      res.status(201).json({ assignment: a });
    } catch (e) { next(e); }
  });

  // Teacher: add question to draft
  router.post("/teacher/assignments/:id/questions", requireRole("teacher"), (req, res, next) => {
    try {
      const { type, stem, options, answer, score, explanation, sortOrder } = req.body ?? {};
      const q = service.addQuestion({ teacherId: req.user.id, assignmentId: Number(req.params.id), type, stem, options, answer, score, explanation, sortOrder });
      res.status(201).json({ question: q });
    } catch (e) { next(e); }
  });

  // Teacher: publish
  router.post("/teacher/assignments/:id/publish", requireRole("teacher"), (req, res, next) => {
    try {
      res.json({ assignment: service.publishAssignment({ teacherId: req.user.id, assignmentId: Number(req.params.id) }) });
    } catch (e) { next(e); }
  });

  // Teacher: list assignments for class
  router.get("/teacher/classes/:classId/assignments", requireRole("teacher"), (req, res, next) => {
    try {
      res.json({ assignments: service.getTeacherAssignments({ teacherId: req.user.id, classId: Number(req.params.classId) }) });
    } catch (e) { next(e); }
  });

  // Teacher: assignment detail (with answers)
  router.get("/teacher/assignments/:id", requireRole("teacher"), (req, res, next) => {
    try {
      res.json(service.getTeacherAssignmentDetail({ teacherId: req.user.id, assignmentId: Number(req.params.id) }));
    } catch (e) { next(e); }
  });

  // Teacher: list submissions for an assignment
  router.get("/teacher/assignments/:id/submissions", requireRole("teacher"), (req, res, next) => {
    try {
      const submissions = service.listTeacherSubmissions({
        teacherId: req.user.id,
        assignmentId: Number(req.params.id),
      });
      res.json({ submissions });
    } catch (e) { next(e); }
  });

  // Teacher: grade a submission (manual override for short_answer)
  router.post("/teacher/submissions/:id/grade", requireRole("teacher"), (req, res, next) => {
    try {
      const { questionScores, feedback } = req.body ?? {};
      res.json({ submission: service.gradeSubmission({ teacherId: req.user.id, submissionId: Number(req.params.id), questionScores, feedback }) });
    } catch (e) { next(e); }
  });

  // Teacher: class assignment analytics
  router.get("/teacher/classes/:classId/assignment-analytics", requireRole("teacher"), (req, res, next) => {
    try {
      res.json({ analytics: service.getClassAnalytics({ teacherId: req.user.id, classId: Number(req.params.classId) }) });
    } catch (e) { next(e); }
  });

  // Teacher: per-student analytics
  router.get("/teacher/students/:studentId/assignment-analytics", requireRole("teacher"), (req, res, next) => {
    try {
      res.json({ analytics: service.getStudentAnalytics({ teacherId: req.user.id, studentId: Number(req.params.studentId), classId: req.query.classId ? Number(req.query.classId) : null }) });
    } catch (e) { next(e); }
  });

  // Student: get published assignments for my classes
  router.get("/student/assignments", requireRole("student"), (req, res, next) => {
    try {
      res.json({ assignments: service.getStudentAssignments({ studentId: req.user.id }) });
    } catch (e) { next(e); }
  });

  // Student: get assignment detail (without answers)
  router.get("/student/assignments/:id", requireRole("student"), (req, res, next) => {
    try {
      res.json(service.getStudentAssignmentDetail({
        studentId: req.user.id,
        assignmentId: Number(req.params.id),
      }));
    } catch (e) { next(e); }
  });

  // Student: save draft
  router.post("/student/assignments/:id/draft", requireRole("student"), (req, res, next) => {
    try {
      res.json({ submission: service.saveDraft({ studentId: req.user.id, assignmentId: Number(req.params.id), answers: req.body.answers }) });
    } catch (e) { next(e); }
  });

  // Student: submit
  router.post("/student/assignments/:id/submit", requireRole("student"), (req, res, next) => {
    try {
      const result = service.submitStudentAnswers({ studentId: req.user.id, assignmentId: Number(req.params.id), answers: req.body.answers });
      res.json(result);
    } catch (e) { next(e); }
  });

  // Student: my submissions
  router.get("/student/submissions", requireRole("student"), (req, res, next) => {
    try {
      res.json({ submissions: service.getStudentSubmissions({ studentId: req.user.id }) });
    } catch (e) { next(e); }
  });

  return router;
}
