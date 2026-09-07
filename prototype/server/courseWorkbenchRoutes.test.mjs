import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword } from "./auth.js";
import { createApp } from "./app.js";
import { createUser, migrate, openDatabase } from "./db.js";

const payload = {
  title: "CPU 与内存",
  summary: "认识部件协作。",
  learningObjectives: ["识别 CPU"],
  guideChallengeId: "computer-components",
  guideScript: [{ id: "cpu", title: "CPU", instruction: "查看 CPU", action: { type: "highlightPart", partId: "cpu" }, completion: "acknowledge" }],
  assignmentOutline: { title: "观察记录", description: "记录观察。" },
  projectOutline: { title: "主机方案", description: "说明协作。", milestones: [{ id: "proposal", title: "方案", description: "提交方案" }] },
};

async function makeServer() {
  const db = openDatabase(":memory:");
  migrate(db);
  createUser(db, { username: "course-teacher", displayName: "教师", role: "teacher", passwordHash: await hashPassword("Teacher123!") });
  const app = createApp({ db, serveStatic: false, assistantOptions: { env: {} }, courseAssistantOptions: { env: {} } });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return { db, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function request(baseUrl, path, options = {}, jar = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (jar.cookie) headers.cookie = jar.cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) jar.cookie = setCookie.split(";")[0];
  return { response, body: await response.json() };
}

test("teacher publishes a course, assigns a team, then reviews the student's milestone", async () => {
  const { server, baseUrl } = await makeServer();
  const teacherJar = {}, studentJar = {};
  try {
    await request(baseUrl, "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "course-teacher", password: "Teacher123!" }) }, teacherJar);
    let result = await request(baseUrl, "/api/classes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "课程班" }) }, teacherJar);
    const classId = result.body.class.id;
    await request(baseUrl, `/api/teacher/classes/${classId}/import-students`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: "course-student,学生,Student123!" }) }, teacherJar);
    await request(baseUrl, "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "course-student", password: "Student123!" }) }, studentJar);

    result = await request(baseUrl, `/api/teacher/classes/${classId}/course-drafts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }, teacherJar);
    assert.equal(result.response.status, 201);
    const draftId = result.body.draft.id;
    result = await request(baseUrl, `/api/teacher/course-drafts/${draftId}/publish`, { method: "POST" }, teacherJar);
    assert.equal(result.response.status, 200);
    const projectId = result.body.project.id;
    const courseVersionId = result.body.project.courseVersion.id;
    result = await request(baseUrl, `/api/teacher/course-drafts/${draftId}/project/teams`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "第一组", members: [{ studentId: 2, role: "实验" }] }) }, teacherJar);
    assert.equal(result.response.status, 201);

    result = await request(baseUrl, "/api/student/projects", {}, studentJar);
    assert.equal(result.body.projects[0].team.name, "第一组");
    result = await request(baseUrl, `/api/student/projects/${projectId}/milestones/proposal/submission`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reflection: "完成初稿", evidenceUrl: "https://example.edu/work", clientSubmissionId: "milestone-1" }) }, studentJar);
    assert.equal(result.response.status, 200);
    const submissionId = result.body.submission.id;
    result = await request(baseUrl, `/api/teacher/project-submissions/${submissionId}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feedback: "结构完整" }) }, teacherJar);
    assert.equal(result.body.submission.status, "reviewed");
    result = await request(baseUrl, `/api/teacher/classes/${classId}/project-summary`, {}, teacherJar);
    assert.equal(result.body.summary.reviewed, 1);
    assert.equal(result.body.submissions[0].studentDisplayName, "学生");
    assert.equal(result.body.submissions[0].milestoneTitle, "方案");
    result = await request(baseUrl, "/api/student/lab-runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseVersionId, stepId: "guide-cpu" }) }, studentJar);
    assert.equal(result.response.status, 201);
    const runId = result.body.run.id;
    result = await request(baseUrl, `/api/student/lab-runs/${runId}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseRevision: 0, batchId: "route-batch-1", events: [{ eventId: "route-event-1", type: "cpu.executeInstruction", payload: {} }] }) }, studentJar);
    assert.equal(result.body.run.state.revision, 1);
    result = await request(baseUrl, `/api/student/lab-runs/${runId}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseRevision: 0, batchId: "route-batch-1", events: [{ eventId: "route-event-1", type: "cpu.executeInstruction", payload: {} }] }) }, studentJar);
    assert.equal(result.body.run.duplicate, true);
    result = await request(baseUrl, `/api/teacher/classes/${classId}/lab-runs`, {}, teacherJar);
    assert.equal(result.body.runs[0].studentDisplayName, "学生");
    assert.equal(result.body.runs[0].eventCount, 1);
    result = await request(baseUrl, "/api/student/cpu-practice", {}, studentJar);
    assert.equal(result.response.status, 200);
    result = await request(baseUrl, "/api/student/cpu-practice/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseRevision: 0, batchId: "practice-route-1", events: [{ eventId: "practice-event-1", type: "cpu.stepMicro", payload: { machine: { pc: 1 } } }] }) }, studentJar);
    assert.equal(result.body.run.state.revision, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("route identities cannot be overridden by request bodies", async () => {
  const { db, server, baseUrl } = await makeServer();
  const teacherOneJar = {}, teacherTwoJar = {}, studentOneJar = {};
  try {
    const teacherTwo = createUser(db, { username: "other-teacher", displayName: "另一位教师", role: "teacher", passwordHash: await hashPassword("Teacher123!") });
    const studentOne = createUser(db, { username: "other-student", displayName: "旁观学生", role: "student", passwordHash: await hashPassword("Student123!") });
    await request(baseUrl, "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "course-teacher", password: "Teacher123!" }) }, teacherOneJar);
    await request(baseUrl, "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "other-teacher", password: "Teacher123!" }) }, teacherTwoJar);
    let result = await request(baseUrl, "/api/classes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "另一教师班级" }) }, teacherTwoJar);
    const classId = result.body.class.id;
    await request(baseUrl, `/api/teacher/classes/${classId}/import-students`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: "target-student,目标学生,Student123!" }) }, teacherTwoJar);
    const targetStudent = db.prepare("SELECT id FROM users WHERE username=?").get("target-student");
    result = await request(baseUrl, `/api/teacher/classes/${classId}/course-drafts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }, teacherTwoJar);
    const draftId = result.body.draft.id;
    result = await request(baseUrl, `/api/teacher/course-drafts/${draftId}/publish`, { method: "POST" }, teacherTwoJar);
    const projectId = result.body.project.id;
    await request(baseUrl, `/api/teacher/course-drafts/${draftId}/project/teams`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "目标组", members: [{ studentId: targetStudent.id, role: "实验" }] }) }, teacherTwoJar);

    result = await request(baseUrl, `/api/teacher/course-drafts/${draftId}/project/teams`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ teacherId: teacherTwo.id, name: "越权组", members: [{ studentId: targetStudent.id, role: "记录" }] }) }, teacherOneJar);
    assert.equal(result.response.status, 404);
    result = await request(baseUrl, `/api/teacher/classes/${classId}/lab-runs`, {}, teacherOneJar);
    assert.equal(result.response.status, 404);

    await request(baseUrl, "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "other-student", password: "Student123!" }) }, studentOneJar);
    result = await request(baseUrl, `/api/student/projects/${projectId}/milestones/proposal/submission`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentId: targetStudent.id, projectId, milestoneId: "proposal", reflection: "越权提交", clientSubmissionId: `spoof-${studentOne.id}` }) }, studentOneJar);
    assert.equal(result.response.status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
