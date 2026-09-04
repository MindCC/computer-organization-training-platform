import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword } from "./auth.js";
import { createApp } from "./app.js";
import { createUser, migrate, openDatabase } from "./db.js";

async function makeServer() {
  const db = openDatabase(":memory:");
  migrate(db);
  createUser(db, { username: "teacher", displayName: "教师", role: "teacher", passwordHash: await hashPassword("Teacher123!") });
  const app = createApp({ db, serveStatic: false, assistantOptions: { env: {} } });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  return { db, server, baseUrl: `http://127.0.0.1:${port}` };
}

async function request(baseUrl, path, options = {}, jar = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (jar.cookie) headers.cookie = jar.cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) jar.cookie = setCookie.split(";")[0];
  const ct = response.headers.get("content-type") ?? "";
  const body = ct.includes("json") ? await response.json() : await response.text();
  return { response, body };
}

test("assignment full flow: create, add questions, publish, student submit, auto-grade, analytics", async () => {
  const { db, server, baseUrl } = await makeServer();
  const tJar = {}, sJar = {};
  try {
    // Login
    await request(baseUrl, "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "teacher", password: "Teacher123!" }) }, tJar);
    // Create class
    let r = await request(baseUrl, "/api/classes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "作业班" }) }, tJar);
    const classId = r.body.class.id;
    // Import student
    await request(baseUrl, `/api/teacher/classes/${classId}/import-students`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: "hw001,张三,Student123!" }) }, tJar);
    await request(baseUrl, "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "hw001", password: "Student123!" }) }, sJar);

    // Create assignment
    r = await request(baseUrl, `/api/teacher/classes/${classId}/assignments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "第一章测验", description: "计算机组成基础" }) }, tJar);
    assert.equal(r.response.status, 201);
    const aId = r.body.assignment.id;

    // Add questions
    await request(baseUrl, `/api/teacher/assignments/${aId}/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "choice", stem: "CPU 的中文名称是？", options: ["中央处理器", "内存", "硬盘", "显卡"], answer: "中央处理器", score: 20, sortOrder: 0 }) }, tJar);
    await request(baseUrl, `/api/teacher/assignments/${aId}/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "truefalse", stem: "RAM 是只读存储器", options: [], answer: "false", score: 10, sortOrder: 1 }) }, tJar);
    await request(baseUrl, `/api/teacher/assignments/${aId}/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "fill", stem: "冯·诺依曼结构中，程序和数据都存放在____中。", options: [], answer: "存储器", score: 20, sortOrder: 2 }) }, tJar);

    // Publish
    r = await request(baseUrl, `/api/teacher/assignments/${aId}/publish`, { method: "POST" }, tJar);
    assert.equal(r.response.status, 200);
    assert.equal(r.body.assignment.status, "published");

    // Student gets assignments
    r = await request(baseUrl, "/api/student/assignments", {}, sJar);
    assert.equal(r.body.assignments.length, 1);

    // Student submits answers
    r = await request(baseUrl, `/api/student/assignments/${aId}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: [
      { questionId: 1, value: "中央处理器" },
      { questionId: 2, value: "false" },
      { questionId: 3, value: "存储器" },
    ]})}, sJar);
    assert.equal(r.response.status, 200);
    assert.equal(r.body.autoScore, 50); // 20+10+20 = 50

    // Teacher analytics
    r = await request(baseUrl, `/api/teacher/classes/${classId}/assignment-analytics`, {}, tJar);
    assert.equal(r.body.analytics.length, 1);
    assert.equal(r.body.analytics[0].averageScore, 50);

    // Student submissions
    r = await request(baseUrl, "/api/student/submissions", {}, sJar);
    assert.equal(r.body.submissions.length, 1);
    assert.equal(r.body.submissions[0].status, "graded");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("assignment validation: reject publish without questions, reject modify after publish", async () => {
  const { server, baseUrl } = await makeServer();
  const tJar = {};
  try {
    await request(baseUrl, "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "teacher", password: "Teacher123!" }) }, tJar);
    let r = await request(baseUrl, "/api/classes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "验证班" }) }, tJar);
    const classId = r.body.class.id;
    r = await request(baseUrl, `/api/teacher/classes/${classId}/assignments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "空作业" }) }, tJar);
    const aId = r.body.assignment.id;

    r = await request(baseUrl, `/api/teacher/assignments/${aId}/publish`, { method: "POST" }, tJar);
    assert.equal(r.response.status, 400);

    await request(baseUrl, `/api/teacher/assignments/${aId}/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "truefalse", stem: "测试", options: [], answer: "true", score: 10 }) }, tJar);
    r = await request(baseUrl, `/api/teacher/assignments/${aId}/publish`, { method: "POST" }, tJar);
    assert.equal(r.response.status, 200);

    r = await request(baseUrl, `/api/teacher/assignments/${aId}/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "truefalse", stem: "新增", options: [], answer: "false", score: 10 }) }, tJar);
    assert.equal(r.response.status, 400);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test("assignment resources enforce teacher ownership and student membership", async () => {
  const { db, server, baseUrl } = await makeServer();
  const teacherAJar = {};
  const teacherBJar = {};
  const studentAJar = {};
  const sharedStudentJar = {};

  async function login(username, password, jar) {
    const result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }, jar);
    assert.equal(result.response.status, 200);
  }

  async function createClass(jar, name) {
    const result = await request(baseUrl, "/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }, jar);
    assert.equal(result.response.status, 201);
    return result.body.class.id;
  }

  async function publishAssignment(jar, classId, title) {
    let result = await request(baseUrl, `/api/teacher/classes/${classId}/assignments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }, jar);
    const assignmentId = result.body.assignment.id;
    result = await request(baseUrl, `/api/teacher/assignments/${assignmentId}/questions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "truefalse", stem: "Authorized?", answer: "true", score: 10 }),
    }, jar);
    const questionId = result.body.question.id;
    result = await request(baseUrl, `/api/teacher/assignments/${assignmentId}/publish`, {
      method: "POST",
    }, jar);
    assert.equal(result.response.status, 200);
    return { assignmentId, questionId };
  }

  try {
    createUser(db, {
      username: "teacher-b",
      displayName: "Teacher B",
      role: "teacher",
      passwordHash: await hashPassword("TeacherB123!"),
    });
    await login("teacher", "Teacher123!", teacherAJar);
    await login("teacher-b", "TeacherB123!", teacherBJar);

    const classA = await createClass(teacherAJar, "Class A");
    const classB = await createClass(teacherBJar, "Class B");
    let result = await request(baseUrl, `/api/teacher/classes/${classA}/import-students`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: "student-a,Student A,StudentA123!\nshared,Shared Student,Shared123!" }),
    }, teacherAJar);
    assert.equal(result.response.status, 200);
    result = await request(baseUrl, `/api/teacher/classes/${classB}/import-students`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: "student-b,Student B,StudentB123!\nshared,Shared Student,Shared123!" }),
    }, teacherBJar);
    assert.equal(result.response.status, 200);

    await login("student-a", "StudentA123!", studentAJar);
    await login("shared", "Shared123!", sharedStudentJar);
    const sharedStudentId = db.prepare("SELECT id FROM users WHERE username = ?").get("shared").id;

    const assignmentA = await publishAssignment(teacherAJar, classA, "Assignment A");
    const assignmentB = await publishAssignment(teacherBJar, classB, "Assignment B");

    for (const assignment of [assignmentA, assignmentB]) {
      result = await request(baseUrl, `/api/student/assignments/${assignment.assignmentId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: [{ questionId: assignment.questionId, value: "true" }] }),
      }, sharedStudentJar);
      assert.equal(result.response.status, 200);
    }

    result = await request(baseUrl, `/api/teacher/assignments/${assignmentA.assignmentId}`, {}, teacherAJar);
    assert.equal(result.response.status, 200);
    assert.equal(typeof result.body.questions[0].answer_json, "string");
    result = await request(baseUrl, `/api/student/assignments/${assignmentA.assignmentId}`, {}, studentAJar);
    assert.equal(result.response.status, 200);
    assert.equal(Object.hasOwn(result.body.questions[0], "answer_json"), false);

    assert.equal((await request(baseUrl, `/api/teacher/assignments/${assignmentB.assignmentId}`, {}, teacherAJar)).response.status, 404);
    assert.equal((await request(baseUrl, `/api/teacher/assignments/${assignmentB.assignmentId}/submissions`, {}, teacherAJar)).response.status, 404);
    assert.equal((await request(baseUrl, `/api/student/assignments/${assignmentB.assignmentId}`, {}, studentAJar)).response.status, 404);
    assert.equal((await request(baseUrl, `/api/student/assignments/${assignmentB.assignmentId}/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: [] }),
    }, studentAJar)).response.status, 404);
    assert.equal((await request(baseUrl, `/api/student/assignments/${assignmentB.assignmentId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: [] }),
    }, studentAJar)).response.status, 404);

    result = await request(baseUrl, `/api/teacher/students/${sharedStudentId}/assignment-analytics`, {}, teacherAJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.analytics.totalAssignments, 1);
    assert.deepEqual(
      result.body.analytics.submissions.map((submission) => submission.assignmentId),
      [assignmentA.assignmentId],
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

test("assignment routes ignore forged teacher identity and return a safe student question DTO", async () => {
  const { db, server, baseUrl } = await makeServer();
  const ownerJar = {};
  const attackerJar = {};
  const studentJar = {};
  try {
    const attacker = createUser(db, {
      username: "assignment-attacker", displayName: "Attacker", role: "teacher",
      passwordHash: await hashPassword("Attacker123!"),
    });
    await request(baseUrl, "/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "Teacher123!" }),
    }, ownerJar);
    await request(baseUrl, "/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "assignment-attacker", password: "Attacker123!" }),
    }, attackerJar);
    let result = await request(baseUrl, "/api/classes", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "DTO 班" }),
    }, ownerJar);
    const classId = result.body.class.id;
    await request(baseUrl, `/api/teacher/classes/${classId}/import-students`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: "dto-student,DTO Student,Student123!" }),
    }, ownerJar);
    await request(baseUrl, "/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "dto-student", password: "Student123!" }),
    }, studentJar);
    result = await request(baseUrl, `/api/teacher/classes/${classId}/assignments`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "DTO 作业" }),
    }, ownerJar);
    const assignmentId = result.body.assignment.id;
    const ownerId = db.prepare("SELECT id FROM users WHERE username = 'teacher'").get().id;
    result = await request(baseUrl, `/api/teacher/assignments/${assignmentId}/questions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ teacherId: ownerId, type: "choice", stem: "越权题", options: ["A", "B"], answer: "A", score: 10 }),
    }, attackerJar);
    assert.equal(result.response.status, 404);
    assert.equal(attacker.id > 0, true);

    result = await request(baseUrl, `/api/teacher/assignments/${assignmentId}/questions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "choice", stem: "安全题", options: ["A", "B"], answer: "A", explanation: "答案是 A", score: 10 }),
    }, ownerJar);
    assert.equal(result.response.status, 201);
    await request(baseUrl, `/api/teacher/assignments/${assignmentId}/publish`, { method: "POST" }, ownerJar);
    result = await request(baseUrl, `/api/student/assignments/${assignmentId}`, {}, studentJar);
    assert.deepEqual(result.body.questions[0].options, ["A", "B"]);
    assert.equal(Object.hasOwn(result.body.questions[0], "answer_json"), false);
    assert.equal(Object.hasOwn(result.body.questions[0], "explanation"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

test("assignment submission preserves draft answers and leaves manual work pending", async () => {
  const { server, baseUrl } = await makeServer();
  const teacherJar = {};
  const studentJar = {};
  try {
    await request(baseUrl, "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "teacher", password: "Teacher123!" }) }, teacherJar);
    let result = await request(baseUrl, "/api/classes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "状态班" }) }, teacherJar);
    const classId = result.body.class.id;
    await request(baseUrl, `/api/teacher/classes/${classId}/import-students`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: "state-student,State Student,Student123!" }) }, teacherJar);
    await request(baseUrl, "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "state-student", password: "Student123!" }) }, studentJar);
    result = await request(baseUrl, `/api/teacher/classes/${classId}/assignments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "状态作业" }) }, teacherJar);
    const assignmentId = result.body.assignment.id;
    const choice = await request(baseUrl, `/api/teacher/assignments/${assignmentId}/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "choice", stem: "选择", options: ["A", "B"], answer: "A", score: 10 }) }, teacherJar);
    const short = await request(baseUrl, `/api/teacher/assignments/${assignmentId}/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "short_answer", stem: "说明", answer: "参考", score: 20 }) }, teacherJar);
    await request(baseUrl, `/api/teacher/assignments/${assignmentId}/publish`, { method: "POST" }, teacherJar);
    const answers = [{ questionId: choice.body.question.id, value: "A" }, { questionId: short.body.question.id, value: "我的说明" }];
    await request(baseUrl, `/api/student/assignments/${assignmentId}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) }, studentJar);
    result = await request(baseUrl, `/api/student/assignments/${assignmentId}`, {}, studentJar);
    assert.deepEqual(result.body.submission.answers.map((answer) => answer.value), ["A", "我的说明"]);
    result = await request(baseUrl, `/api/student/assignments/${assignmentId}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) }, studentJar);
    assert.equal(result.body.submission.status, "submitted");
    assert.ok(result.body.submission.submitted_at);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
