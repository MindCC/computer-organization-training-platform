import test from "node:test";
import assert from "node:assert/strict";
import { createCourseWorkbenchRepository } from "./courseWorkbenchRepository.js";
import { createClass, createUser, migrate, openDatabase } from "./db.js";

const draftPayload = {
  title: "计算机组成导学",
  summary: "认识部件协作。",
  learningObjectives: ["识别 CPU"],
  guideChallengeId: "computer-components",
  guideScript: [{ id: "cpu", title: "CPU", instruction: "查看 CPU", action: { type: "highlightPart", partId: "cpu" }, completion: "acknowledge" }],
  assignmentOutline: { title: "观察记录", description: "记录观察。" },
  projectOutline: { title: "主机方案", description: "说明协作。", milestones: [{ id: "proposal", title: "方案", description: "提交方案" }] },
};

test("repository persists a published course, team and idempotent student submission", () => {
  const db = openDatabase(":memory:");
  migrate(db);
  const teacher = createUser(db, { username: "course-teacher", displayName: "教师", role: "teacher", passwordHash: "x" });
  const student = createUser(db, { username: "course-student", displayName: "学生", role: "student", passwordHash: "x" });
  const classroom = createClass(db, teacher.id, "课程班");
  db.prepare("INSERT INTO class_members (class_id, student_id) VALUES (?, ?)").run(classroom.id, student.id);
  const repo = createCourseWorkbenchRepository(db);

  const draft = repo.createDraft({ teacherId: teacher.id, classId: classroom.id, payload: draftPayload });
  const project = repo.publishDraft(draft.id);
  const team = repo.createTeam({ projectId: project.id, name: "第一组", members: [{ studentId: student.id, role: "实验" }] });
  const first = repo.upsertSubmission({ projectId: project.id, milestoneId: "proposal", studentId: student.id, reflection: "初稿", evidenceUrl: "https://example.edu/a", clientSubmissionId: "submission-1" });
  const retry = repo.upsertSubmission({ projectId: project.id, milestoneId: "proposal", studentId: student.id, reflection: "不同内容", evidenceUrl: "https://example.edu/b", clientSubmissionId: "submission-1" });

  assert.equal(project.course_draft_id, draft.id);
  assert.equal(team.members[0].role, "实验");
  assert.equal(first.id, retry.id);
  assert.equal(retry.reflection, "初稿");
  assert.equal(repo.getStudentProject(project.id, student.id).team.name, "第一组");
  db.close();
});
