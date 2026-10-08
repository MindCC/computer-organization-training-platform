import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';
import { createClass, createUser, getUserByUsername, migrate, openDatabase, recordStudentAttempt } from './db.js';
import { isDemoAccount } from './demoAccounts.js';

async function fixture(options = {}) {
  const db = openDatabase(':memory:'); migrate(db);
  const password = `Test-${crypto.randomBytes(12).toString('hex')}`;
  const passwordHash = await hashPassword(password);
  const teacher = createUser(db, { username: 'teacher', displayName: '任课教师', role: 'teacher', passwordHash });
  const formalClass = createClass(db, teacher.id, '正式教学班');
  const app = createApp({ db, serveStatic: false, demoLoginEnabled: true, ...options });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, body, jar = {}, method = 'POST') {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(jar.cookie ? { cookie: jar.cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.headers.get('set-cookie')) jar.cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, body: await response.json() };
  }
  return { db, teacher, formalClass, password, request, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

test('isDemoAccount reads both raw rows and sanitized users', () => {
  assert.equal(isDemoAccount(null), false);
  assert.equal(isDemoAccount({}), false);
  assert.equal(isDemoAccount({ profile_json: '{"demoAccount":true}' }), true);
  assert.equal(isDemoAccount({ profile: { demoAccount: true } }), true);
  assert.equal(isDemoAccount({ profile: { seeded: true } }), false);
  assert.equal(isDemoAccount({ profile_json: 'not-json' }), false);
});

test('demo accounts are read-only: browsing allowed, every write rejected and audited', async () => {
  const f = await fixture();
  try {
    const teacherJar = {}, studentJar = {};
    assert.equal((await f.request('/api/auth/demo-login', { role: 'teacher' }, teacherJar)).status, 200);
    assert.equal((await f.request('/api/auth/demo-login', { role: 'student' }, studentJar)).status, 200);

    // 读取放行：班级、概览、学生进度都可以看
    const classes = await f.request('/api/teacher/classes', undefined, teacherJar, 'GET');
    assert.equal(classes.status, 200);
    const classId = classes.body.classes[0].id;
    assert.equal((await f.request(`/api/teacher/classes/${classId}/overview`, undefined, teacherJar, 'GET')).status, 200);
    assert.equal((await f.request('/api/student/progress', undefined, studentJar, 'GET')).status, 200);
    assert.equal((await f.request('/api/auth/me', undefined, studentJar, 'GET')).status, 200);

    // 写操作全部被服务器拒绝，并给出明确的只读口径
    const writes = [
      await f.request('/api/classes', { name: '演示新班' }, teacherJar),
      await f.request(`/api/teacher/classes/${classId}/assignments`, { title: '演示作业' }, teacherJar),
      await f.request('/api/teacher/task-library', { templateKey: 'task-chain', durationMinutes: 30, passScore: 80, taskChain: { title: 'x', stages: [{ id: 'a', type: 'custom', title: 't', instructions: '', submissionMode: 'confirm' }] } }, teacherJar),
      await f.request('/api/auth/change-password', { currentPassword: 'x', nextPassword: 'NewPass123!' }, teacherJar),
      await f.request('/api/auth/settings', { displayName: '改名' }, teacherJar),
      await f.request('/api/student/attempts', { challengeId: 'machine-number', passed: true, score: 100, clientSubmissionId: 'demo-readonly-001' }, studentJar),
      await f.request('/api/student/notes', { title: 't', content: 'c', tag: 'x' }, studentJar),
      await f.request('/api/feedback', { message: '试用反馈' }, studentJar),
    ];
    for (const result of writes) {
      assert.equal(result.status, 403, JSON.stringify(result.body));
      assert.equal(result.body.error.code, 'DEMO_READ_ONLY');
      assert.match(result.body.error.message, /只读/);
    }

    // 被拒绝的写操作进入审计日志
    const blocked = f.db.prepare("SELECT * FROM audit_logs WHERE action = 'demo_readonly_blocked'").all();
    assert.ok(blocked.length >= writes.length, `expected >= ${writes.length} audit rows, got ${blocked.length}`);
    assert.ok(blocked.every(row => row.actor_user_id !== null));

    // 退出登录仍然可用
    assert.equal((await f.request('/api/auth/logout', {}, studentJar)).status, 200);
  } finally { await f.close(); }
});

test('formal accounts are unaffected by the demo read-only guard', async () => {
  const f = await fixture();
  try {
    const jar = {};
    assert.equal((await f.request('/api/auth/login', { username: 'teacher', password: f.password, role: 'teacher' }, jar)).status, 200);
    const created = await f.request('/api/classes', { name: '正式新班' }, jar);
    assert.equal(created.status, 201);
    const renamed = await f.request('/api/auth/settings', { displayName: '正式教师甲' }, jar, 'PUT');
    assert.notEqual(renamed.status, 403);
  } finally { await f.close(); }
});

test('existing demo-class data stays readable; only writes are blocked', async () => {
  const f = await fixture();
  try {
    const teacherJar = {}, studentJar = {};
    await f.request('/api/auth/demo-login', { role: 'teacher' }, teacherJar);
    const studentLogin = await f.request('/api/auth/demo-login', { role: 'student' }, studentJar);
    const classId = (await f.request('/api/teacher/classes', undefined, teacherJar, 'GET')).body.classes[0].id;
    // 直接落库一份作业与学生实验记录（模拟只读生效前已有的演示数据）
    const studentId = studentLogin.body.user.id;
    recordStudentAttempt(f.db, studentId, 'machine-number', { passed: true, score: 92, errors: [] });
    const demoTeacherId = getUserByUsername(f.db, 'demo-teacher').id;
    f.db.prepare("INSERT INTO assignments (class_id, teacher_id, title, description, status, question_count) VALUES (?, ?, ?, '', 'published', 0)").run(classId, demoTeacherId, '只读可见作业');
    const assignments = await f.request('/api/student/assignments', undefined, studentJar, 'GET');
    assert.ok(assignments.body.assignments.some(item => item.title === '只读可见作业'));
    const progress = await f.request('/api/student/progress', undefined, studentJar, 'GET');
    assert.equal(progress.status, 200);
  } finally { await f.close(); }
});

test('migration reassigns only the roster-imported real class to the formal teacher, idempotently', () => {
  const db = openDatabase(':memory:'); migrate(db);
  try {
    const demoTeacher = createUser(db, { username: 'demo-teacher', displayName: '演示教师', role: 'teacher', passwordHash: 'x', profile: { demoAccount: true } });
    const formal = createUser(db, { username: 'teacher', displayName: '任课教师', role: 'teacher', passwordHash: 'x' });
    const roster = createClass(db, demoTeacher.id, '26计算机科学与技术(专升本)9');
    const demoClass = createClass(db, demoTeacher.id, '计算机组成原理1班');
    const other = createClass(db, formal.id, '26计算机科学与技术(专升本)9');
    migrate(db);
    assert.equal(db.prepare('SELECT teacher_id FROM classes WHERE id = ?').get(roster.id).teacher_id, formal.id);
    assert.equal(db.prepare('SELECT teacher_id FROM classes WHERE id = ?').get(demoClass.id).teacher_id, demoTeacher.id, '演示班保持演示师生同班');
    assert.equal(db.prepare('SELECT teacher_id FROM classes WHERE id = ?').get(other.id).teacher_id, formal.id);
    migrate(db);
    assert.equal(db.prepare('SELECT teacher_id FROM classes WHERE id = ?').get(roster.id).teacher_id, formal.id);
  } finally { db.close(); }
});
