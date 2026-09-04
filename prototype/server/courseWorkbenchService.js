import { teacherOwnsClass } from "./db.js";
import { createFallbackCourseDraft, normalizeCourseDraftPayload, normalizeEvidenceUrl } from "./courseWorkbench.js";

const ROLES = new Set(["协调", "实验", "记录", "汇报"]);

export function createCourseWorkbenchService({ db, repository, generateSuggestion = null }) {
  return {
    createDraft, updateDraft, listTeacherDrafts, getTeacherDraft, publishDraft,
    createTeam, replaceTeamMembers, getStudentProjects, getStudentProject,
    submitMilestone, reviewSubmission, getTeacherSummary, generateDraft,
  };

  function notFound(message = "资源不存在") { return Object.assign(new Error(message), { status: 404 }); }
  function bad(message) { return Object.assign(new Error(message), { status: 400 }); }
  function ownClass(teacherId, classId) { if (!teacherOwnsClass(db, teacherId, classId)) throw notFound("班级不存在"); }
  function getOwnedDraft(teacherId, draftId) {
    const draft = repository.getDraft(draftId);
    if (!draft || draft.teacher_id !== teacherId || !teacherOwnsClass(db, teacherId, draft.class_id)) throw notFound("课程草稿不存在");
    return draft;
  }
  function getOwnedProject(teacherId, projectId) {
    const project = repository.getProject(projectId);
    if (!project) throw notFound("项目不存在");
    getOwnedDraft(teacherId, project.course_draft_id);
    return project;
  }

  function createDraft({ teacherId, classId, payload }) {
    ownClass(teacherId, classId);
    return repository.createDraft({ teacherId, classId, payload: normalizeCourseDraftPayload(payload) });
  }
  async function generateDraft({ teacherId, classId, payload }) {
    ownClass(teacherId, classId);
    const result = generateSuggestion ? await generateSuggestion(payload) : { source: "fallback", draft: createFallbackCourseDraft(payload) };
    return { source: result.source ?? "fallback", draft: createDraft({ teacherId, classId, payload: result.draft ?? result }) };
  }
  function updateDraft({ teacherId, draftId, payload }) {
    const draft = getOwnedDraft(teacherId, draftId);
    if (draft.status !== "draft") throw bad("已发布课程不能修改");
    return repository.updateDraft(draftId, normalizeCourseDraftPayload(payload));
  }
  function listTeacherDrafts({ teacherId, classId }) { ownClass(teacherId, classId); return repository.listDraftsByClass(classId); }
  function getTeacherDraft({ teacherId, draftId }) { return getOwnedDraft(teacherId, draftId); }
  function publishDraft({ teacherId, draftId }) {
    const draft = getOwnedDraft(teacherId, draftId);
    if (draft.status !== "draft") throw bad("课程已经发布");
    return repository.publishDraft(draftId);
  }
  function createTeam({ teacherId, draftId, name, members }) {
    const draft = getOwnedDraft(teacherId, draftId);
    if (draft.status !== "published") throw bad("请先发布课程再创建小组");
    const project = db.prepare("SELECT * FROM team_projects WHERE course_draft_id=?").get(draftId);
    return repository.createTeam({ projectId: project.id, name: validateTeamName(name), members: validateMembers(draft.class_id, members, project.id) });
  }
  function replaceTeamMembers({ teacherId, teamId, members }) {
    const team = db.prepare("SELECT * FROM project_teams WHERE id=?").get(teamId);
    if (!team) throw notFound("小组不存在");
    const project = getOwnedProject(teacherId, team.team_project_id);
    return repository.replaceTeamMembers(teamId, validateMembers(project.class_id, members, project.id, teamId));
  }
  function getStudentProjects({ studentId }) { return repository.listStudentProjects(studentId); }
  function getStudentProject({ studentId, projectId }) {
    const project = repository.getStudentProject(projectId, studentId);
    if (!project) throw notFound("项目不存在");
    return project;
  }
  function submitMilestone({ studentId, projectId, milestoneId, reflection, evidenceUrl, clientSubmissionId }) {
    const project = getStudentProject({ studentId, projectId });
    if (!project.milestones.some((item) => item.id === milestoneId)) throw bad("里程碑不存在");
    const existing = project.submissions.find((item) => item.milestoneId === milestoneId);
    if (existing?.status === "reviewed") throw bad("已评价的里程碑不能修改");
    const text = String(reflection ?? "").trim();
    if (!text) throw bad("成果反思不能为空");
    if (text.length > 4_000) throw bad("成果反思过长");
    const submissionId = String(clientSubmissionId ?? "").trim();
    if (!submissionId || submissionId.length > 128) throw bad("提交标识无效");
    return repository.upsertSubmission({ projectId, milestoneId, studentId, reflection: text, evidenceUrl: normalizeEvidenceUrl(evidenceUrl), clientSubmissionId: submissionId });
  }
  function reviewSubmission({ teacherId, submissionId, feedback }) {
    const submission = repository.getSubmission(submissionId);
    if (!submission) throw notFound("提交不存在");
    getOwnedProject(teacherId, submission.teamProjectId);
    if (submission.status !== "submitted") throw bad("只能评价已提交成果");
    const text = String(feedback ?? "").trim();
    if (!text || text.length > 2_000) throw bad("评价内容无效");
    return repository.reviewSubmission(submissionId, text);
  }
  function getTeacherSummary({ teacherId, classId }) { ownClass(teacherId, classId); return repository.getProjectSummary(classId); }

  function validateTeamName(value) { const name = String(value ?? "").trim(); if (!name || name.length > 80) throw bad("小组名称无效"); return name; }
  function validateMembers(classId, members, projectId, replacingTeamId = null) {
    if (!Array.isArray(members) || members.length === 0 || members.length > 12) throw bad("小组成员无效");
    const seen = new Set();
    return members.map((member) => {
      const studentId = Number(member?.studentId);
      if (!Number.isInteger(studentId) || seen.has(studentId)) throw bad("小组成员重复或无效");
      seen.add(studentId);
      const inClass = db.prepare("SELECT 1 FROM class_members WHERE class_id=? AND student_id=?").get(classId, studentId);
      const inOtherTeam = db.prepare(`SELECT 1 FROM project_team_members ptm JOIN project_teams pt ON pt.id=ptm.team_id WHERE pt.team_project_id=? AND ptm.student_id=? AND (? IS NULL OR pt.id != ?)`)
        .get(projectId, studentId, replacingTeamId, replacingTeamId);
      if (!inClass || inOtherTeam) throw bad("学生不属于班级或已在其他小组");
      const role = String(member?.role ?? "").trim();
      if (!ROLES.has(role)) throw bad("小组角色无效");
      return { studentId, role };
    });
  }
}
