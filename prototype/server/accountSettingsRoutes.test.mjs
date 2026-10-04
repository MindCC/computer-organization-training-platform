import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from './app.js';
import { hashPassword, verifyPassword } from './auth.js';
import { createClass, createUser, getUserById, getUserByUsername, migrate, openDatabase, recordStudentAttempt } from './db.js';
import { isDemoLoginEnabled } from './demoAccounts.js';

async function fixture(options = {}) {
  const db = openDatabase(':memory:'); migrate(db);
  const password = `Test-${crypto.randomBytes(12).toString('hex')}`;
  const passwordHash = await hashPassword(password);
  const teacher = createUser(db, { username: 'teacher-formal', displayName: '正式教师', role: 'teacher', passwordHash });
  const student = createUser(db, { username: 'student-formal', displayName: '正式学生', role: 'student', passwordHash, profile: { mode: '强引导模式', mustChangePassword: true } });
  const formalClass = createClass(db, teacher.id, '正式教学班');
  const app = createApp({ db, serveStatic: false, demoLoginEnabled: true, ...options });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, body, jar = {}, method = 'POST') {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(jar.cookie ? { cookie: jar.cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.headers.get('set-cookie')) jar.cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  const login = async (username, role) => { const jar = {}; const response = await request('/api/auth/login', { username, password, ...(role ? { role } : {}) }, jar); assert.equal(response.status, 200); return jar; };
  return { db, teacher, student, formalClass, password, passwordHash, request, login, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

test('selected login identity is enforced without creating a wrong-role session', async () => {
  const f = await fixture();
  try {
    for (const [username, role] of [['teacher-formal', 'student'], ['student-formal', 'teacher']]) {
      const result = await f.request('/api/auth/login', { username, password: f.password, role });
      assert.equal(result.status, 403); assert.equal(result.cookie, null); assert.match(result.body.error, /对应登录入口/);
    }
    const teacherJar = await f.login('teacher-formal', 'teacher');
    assert.equal((await f.request('/api/auth/me', undefined, teacherJar, 'GET')).body.user.role, 'teacher');
  } finally { await f.close(); }
});

test('two demo identities use isolated demo ownership and never expose a management credential', async () => {
  const f = await fixture();
  try {
    const teacherJar = {}, studentJar = {};
    const t = await f.request('/api/auth/demo-login', { role: 'teacher' }, teacherJar);
    const s = await f.request('/api/auth/demo-login', { role: 'student' }, studentJar);
    assert.equal(t.status, 200); assert.equal(s.status, 200);
    assert.equal(t.body.user.role, 'teacher'); assert.equal(s.body.user.role, 'student');
    assert.notEqual(t.body.user.id, f.teacher.id); assert.notEqual(s.body.user.id, f.student.id);
    for (const result of [t, s]) { assert.equal(result.body.user.password, undefined); assert.equal(result.body.user.password_hash, undefined); assert.equal(result.body.user.profile.initialPassword, undefined); }
    const classes = await f.request('/api/teacher/classes', undefined, teacherJar, 'GET');
    assert.equal(classes.body.classes.length, 1); assert.notEqual(classes.body.classes[0].id, f.formalClass.id);
    const overview = await f.request(`/api/teacher/classes/${classes.body.classes[0].id}/overview`, undefined, teacherJar, 'GET');
    assert.equal(overview.status, 200); assert.equal(overview.body.students[0].id, s.body.user.id);
    assert.equal((await f.request(`/api/teacher/classes/${f.formalClass.id}/overview`, undefined, teacherJar, 'GET')).status, 404);
  } finally { await f.close(); }
});

test('production demo default is closed; explicitly disabled demo creates no accounts', async () => {
  assert.equal(isDemoLoginEnabled({}, { NODE_ENV: 'production' }), false);
  assert.equal(isDemoLoginEnabled({}, { NODE_ENV: 'production', ENABLE_DEMO_LOGIN: 'true' }), true);
  const f = await fixture({ demoLoginEnabled: false });
  try { assert.equal((await f.request('/api/auth/demo-login', { role: 'teacher' })).status, 403); assert.equal(getUserByUsername(f.db, 'demo-teacher'), undefined); }
  finally { await f.close(); }
});

test('demo teacher cannot enroll formal students or access whole-system administration', async () => {
  const f = await fixture();
  try {
    const jar = {};
    await f.request('/api/auth/demo-login', { role: 'teacher' }, jar);
    const classes = await f.request('/api/teacher/classes', undefined, jar, 'GET');
    const classId = classes.body.classes[0].id;
    const imported = await f.request(`/api/teacher/classes/${classId}/import-students`, { csv: '学号,姓名,初始密码\nstudent-formal,正式学生,' }, jar);
    assert.equal(imported.status, 403);
    assert.equal(f.db.prepare('SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ?').get(classId, f.student.id), undefined);
    assert.equal((await f.request('/api/teacher/audit-logs', undefined, jar, 'GET')).status, 403);
    assert.equal((await f.request('/api/admin/db-info', undefined, jar, 'GET')).status, 403);
    assert.equal((await f.request('/api/admin/backup', {}, jar)).status, 403);
    assert.equal((await f.request('/api/teacher/sessions', undefined, jar, 'GET')).status, 200);
    const formalJar = await f.login('teacher-formal', 'teacher');
    assert.equal((await f.request('/api/teacher/audit-logs', undefined, formalJar, 'GET')).status, 200);
    assert.equal((await f.request('/api/admin/db-info', undefined, formalJar, 'GET')).status, 200);
  } finally { await f.close(); }
});

test('legacy seeded demo grades are reused; unrelated accounts cannot be impersonated as demos', async () => {
  const f = await fixture();
  try {
    const legacy = createUser(f.db, { username: 'demo2026001', displayName: '演示学生1', role: 'student', passwordHash: f.passwordHash, profile: { seeded: true } });
    recordStudentAttempt(f.db, legacy.id, 'computer-components', { passed: true, score: 0, errors: [], elapsedMinutes: 2 });
    const before = f.db.prepare('SELECT * FROM student_progress WHERE student_id = ?').all(legacy.id);
    const result = await f.request('/api/auth/demo-login', { role: 'student' });
    assert.equal(result.body.user.id, legacy.id);
    assert.deepEqual(f.db.prepare('SELECT * FROM student_progress WHERE student_id = ?').all(legacy.id), before);
    const teacher = getUserByUsername(f.db, 'demo-teacher');
    f.db.prepare('UPDATE users SET profile_json = ? WHERE id = ?').run('{}', teacher.id);
    assert.equal((await f.request('/api/auth/demo-login', { role: 'teacher' })).status, 409);
  } finally { await f.close(); }
});

test('wrong current password leaves both account profile and password unchanged', async () => {
  const f = await fixture();
  try {
    const jar = await f.login('student-formal');
    const original = getUserById(f.db, f.student.id);
    const result = await f.request('/api/auth/settings', { displayName: '更改姓名', mode: '挑战模式', currentPassword: 'incorrect', nextPassword: `New-${crypto.randomBytes(12).toString('hex')}` }, jar, 'PUT');
    assert.equal(result.status, 400); assert.match(result.body.error, /当前密码/);
    assert.deepEqual(getUserById(f.db, f.student.id), original);
  } finally { await f.close(); }
});

test('one save updates profile and optional password, retaining current session and revoking others', async () => {
  const f = await fixture();
  try {
    const jar = await f.login('student-formal'), otherJar = await f.login('student-formal');
    const nextPassword = `Next-${crypto.randomBytes(12).toString('hex')}`;
    const result = await f.request('/api/auth/settings', { displayName: '学生新姓名', mode: '适中提示模式', currentPassword: f.password, nextPassword }, jar, 'PUT');
    assert.equal(result.status, 200); assert.equal(result.body.passwordChanged, true);
    assert.equal(result.body.user.displayName, '学生新姓名'); assert.equal(result.body.user.profile.mode, '适中提示模式'); assert.equal(result.body.user.profile.mustChangePassword, false);
    assert.equal(await verifyPassword(nextPassword, getUserById(f.db, f.student.id).password_hash), true);
    assert.equal((await f.request('/api/auth/me', undefined, jar, 'GET')).status, 200);
    assert.equal((await f.request('/api/auth/me', undefined, otherJar, 'GET')).status, 401);
    const profileOnly = await f.request('/api/auth/settings', { displayName: '再次更新', mode: '挑战模式' }, jar, 'PUT');
    assert.equal(profileOnly.status, 200); assert.equal(profileOnly.body.passwordChanged, false);
    assert.equal(await verifyPassword(nextPassword, getUserById(f.db, f.student.id).password_hash), true);
  } finally { await f.close(); }
});

test('settings support teacher profile and reject unauthenticated or invalid saves', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/api/auth/settings', { displayName: '匿名' }, {}, 'PUT')).status, 401);
    const studentJar = await f.login('student-formal');
    assert.equal((await f.request('/api/auth/settings', { displayName: '学生', mode: 'invalid' }, studentJar, 'PUT')).status, 400);
    const teacherJar = await f.login('teacher-formal');
    const result = await f.request('/api/auth/settings', { displayName: '教师新姓名' }, teacherJar, 'PUT');
    assert.equal(result.status, 200); assert.equal(result.body.user.displayName, '教师新姓名'); assert.equal(result.body.user.role, 'teacher');
  } finally { await f.close(); }
});
