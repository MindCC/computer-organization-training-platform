import { Router } from "express";

export function createCourseWorkbenchRouter({ service, requireRole, audit }) {
  const router = Router();
  const teacher = requireRole("teacher");
  const student = requireRole("student");
  const send = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

  router.post("/teacher/classes/:classId/course-drafts", teacher, send((req, res) => {
    const draft = service.createDraft({ teacherId: req.user.id, classId: Number(req.params.classId), payload: req.body });
    audit(req, "course_draft_created", { targetType: "course_draft", targetId: draft.id, metadata: { classId: draft.class_id } });
    res.status(201).json({ draft });
  }));
  router.post("/teacher/classes/:classId/course-drafts/generate", teacher, send(async (req, res) => {
    const result = await service.generateDraft({ teacherId: req.user.id, classId: Number(req.params.classId), payload: req.body });
    audit(req, "course_draft_generated", { targetType: "course_draft", targetId: result.draft.id, metadata: { source: result.source } });
    res.status(201).json(result);
  }));
  router.get("/teacher/classes/:classId/course-drafts", teacher, send((req, res) => res.json({ drafts: service.listTeacherDrafts({ teacherId: req.user.id, classId: Number(req.params.classId) }) })));
  router.get("/teacher/course-drafts/:id", teacher, send((req, res) => res.json({ draft: service.getTeacherDraft({ teacherId: req.user.id, draftId: Number(req.params.id) }) })));
  router.put("/teacher/course-drafts/:id", teacher, send((req, res) => {
    const draft = service.updateDraft({ teacherId: req.user.id, draftId: Number(req.params.id), payload: req.body });
    audit(req, "course_draft_updated", { targetType: "course_draft", targetId: draft.id }); res.json({ draft });
  }));
  router.post("/teacher/course-drafts/:id/publish", teacher, send((req, res) => {
    const project = service.publishDraft({ teacherId: req.user.id, draftId: Number(req.params.id) });
    audit(req, "course_draft_published", { targetType: "course_draft", targetId: req.params.id, metadata: { projectId: project.id } }); res.json({ project });
  }));
  router.post("/teacher/course-drafts/:id/project/teams", teacher, send((req, res) => {
    const team = service.createTeam({ teacherId: req.user.id, draftId: Number(req.params.id), ...req.body });
    audit(req, "project_team_created", { targetType: "project_team", targetId: team.id }); res.status(201).json({ team });
  }));
  router.put("/teacher/project-teams/:id/members", teacher, send((req, res) => {
    const team = service.replaceTeamMembers({ teacherId: req.user.id, teamId: Number(req.params.id), members: req.body?.members });
    audit(req, "project_team_members_replaced", { targetType: "project_team", targetId: team.id }); res.json({ team });
  }));
  router.post("/teacher/project-submissions/:id/review", teacher, send((req, res) => {
    const submission = service.reviewSubmission({ teacherId: req.user.id, submissionId: Number(req.params.id), feedback: req.body?.feedback });
    audit(req, "project_submission_reviewed", { targetType: "project_submission", targetId: submission.id }); res.json({ submission });
  }));
  router.get("/teacher/classes/:classId/project-summary", teacher, send((req, res) => res.json({ summary: service.getTeacherSummary({ teacherId: req.user.id, classId: Number(req.params.classId) }) })));
  router.get("/student/projects", student, send((req, res) => res.json({ projects: service.getStudentProjects({ studentId: req.user.id }) })));
  router.get("/student/projects/:id", student, send((req, res) => res.json({ project: service.getStudentProject({ studentId: req.user.id, projectId: Number(req.params.id) }) })));
  router.post("/student/projects/:projectId/milestones/:milestoneId/submission", student, send((req, res) => {
    const submission = service.submitMilestone({ studentId: req.user.id, projectId: Number(req.params.projectId), milestoneId: req.params.milestoneId, ...req.body });
    audit(req, "project_submission_saved", { targetType: "project_submission", targetId: submission.id, metadata: { status: submission.status } }); res.json({ submission });
  }));
  return router;
}
