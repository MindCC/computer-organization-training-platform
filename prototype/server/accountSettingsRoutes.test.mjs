import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from './app.js';
import { hashPassword, verifyPassword } from './auth.js';
import { addStudentToClass, createClass, createUser, getUserById, getUserByUsername, migrate, openDatabase, recordStudentAttempt } from './db.js';
import { isDemoLoginEnabled } from './demoAccounts.js';
import { PNG_AVATAR, JPEG_AVATAR, WEBP_AVATAR, WIDE_PNG_AVATAR } from '../scripts/lib/avatarFixtures.mjs';

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
    const adminStudent = await f.request('/api/auth/login', { username: 'admin', password: 'admin123', role: 'student' });
    assert.equal(adminStudent.status, 403);
    assert.equal(adminStudent.cookie, null);
    assert.match(adminStudent.body.error, /教师入口/);
    const adminJar = {};
    const adminTeacher = await f.request('/api/auth/login', { username: 'admin', password: 'admin123', role: 'teacher' }, adminJar);
    assert.equal(adminTeacher.status, 200);
    assert.equal(adminTeacher.body.user.role, 'admin');
    assert.equal((await f.request('/api/auth/me', undefined, adminJar, 'GET')).body.user.role, 'admin');
  } finally { await f.close(); }
});

test('只读演示教师看得到正式教师的班级但不是属主，且拿不到管理凭据', async () => {
  const f = await fixture();
  try {
    const teacherJar = {}, studentJar = {};
    const t = await f.request('/api/auth/demo-login', { role: 'teacher' }, teacherJar);
    const s = await f.request('/api/auth/demo-login', { role: 'student' }, studentJar);
    assert.equal(t.status, 200); assert.equal(s.status, 200);
    assert.equal(t.body.user.role, 'teacher'); assert.equal(s.body.user.role, 'student');
    assert.notEqual(t.body.user.id, f.teacher.id); assert.notEqual(s.body.user.id, f.student.id);
    for (const result of [t, s]) { assert.equal(result.body.user.password, undefined); assert.equal(result.body.user.password_hash, undefined); assert.equal(result.body.user.profile.initialPassword, undefined); }
    // 2026-10-07：演示教师改为只读，并改为查看正式教师名下的同一份班级数据。
    assert.equal(t.body.user.profile.readOnly, true, '演示教师必须是只读账号');
    const classes = (await f.request('/api/teacher/classes', undefined, teacherJar, 'GET')).body.classes;
    const own = classes.find((row) => row.isOwner === 1);
    const granted = classes.find((row) => row.id === f.formalClass.id);
    assert.ok(own, '演示自己名下的演示班仍然保留');
    assert.ok(granted, '正式教师的班级对只读账号可见（数据同步，不复制）');
    assert.equal(granted.isOwner, 0, '只读账号不是该班属主');
    const overview = await f.request(`/api/teacher/classes/${own.id}/overview`, undefined, teacherJar, 'GET');
    assert.equal(overview.status, 200); assert.equal(overview.body.students[0].id, s.body.user.id);
    assert.equal((await f.request(`/api/teacher/classes/${f.formalClass.id}/overview`, undefined, teacherJar, 'GET')).status, 200, '只读账号可以查看该班学情');
    assert.equal((await f.request('/api/classes', { name: '只读不该建班' }, teacherJar)).status, 403, '只读账号不能建班');
  } finally { await f.close(); }
});

test('演示教师只读：不能布置作业；正式教师发布后演示学生能看到', async () => {
  const f = await fixture();
  try {
    const teacherJar = {}, studentJar = {};
    const teacherLogin = await f.request('/api/auth/demo-login', { role: 'teacher' }, teacherJar);
    const studentLogin = await f.request('/api/auth/demo-login', { role: 'student' }, studentJar);
    assert.equal(teacherLogin.status, 200);
    assert.equal(studentLogin.status, 200);
    const classes = await f.request('/api/teacher/classes', undefined, teacherJar, 'GET');
    const own = classes.body.classes.find((row) => row.isOwner === 1);
    assert.ok(own, '演示账号应能看到自己名下的演示班');
    const overview = await f.request(`/api/teacher/classes/${own.id}/overview`, undefined, teacherJar, 'GET');
    assert.deepEqual(overview.body.students.map((student) => student.id), [studentLogin.body.user.id]);
    // 只读：任何写操作都被全局闸门拒绝
    assert.equal((await f.request(`/api/teacher/classes/${own.id}/assignments`, { title: '只读不该发布', description: 'x' }, teacherJar)).status, 403);
    assert.equal((await f.request(`/api/teacher/classes/${own.id}/import-students`, { csv: '学号,姓名,初始密码\nreadonly-x,不该导入,Test-123456' }, teacherJar)).status, 403);
    // 正式教师照常发布作业（数据与权限不受只读演示账号影响）
    const formalJar = await f.login('teacher-formal', 'teacher');
    addStudentToClass(f.db, f.formalClass.id, f.student.id);
    const draft = await f.request(`/api/teacher/classes/${f.formalClass.id}/assignments`, { title: '正式作业', description: '班级关联检查' }, formalJar);
    assert.equal(draft.status, 201);
    const assignmentId = draft.body.assignment.id;
    await f.request(`/api/teacher/assignments/${assignmentId}/questions`, {
      type: 'choice', stem: 'CPU 是什么？', options: ['处理器', '硬盘'], answer: '处理器', score: 10,
    }, formalJar);
    assert.equal((await f.request(`/api/teacher/assignments/${assignmentId}/publish`, {}, formalJar)).status, 200);
    const formalStudent = await f.login('student-formal', 'student');
    assert.deepEqual((await f.request('/api/student/assignments', undefined, formalStudent, 'GET')).body.assignments.map((assignment) => assignment.id), [assignmentId]);
    assert.deepEqual((await f.request('/api/student/assignments', undefined, studentJar, 'GET')).body.assignments, [], '演示学生不属于正式班级，看不到该作业');
  } finally { await f.close(); }
});

test('legacy seeded classmates are removed from the one-click demo class roster', async () => {
  const f = await fixture();
  try {
    const teacherJar = {};
    await f.request('/api/auth/demo-login', { role: 'teacher' }, teacherJar);
    const classId = (await f.request('/api/teacher/classes', undefined, teacherJar, 'GET')).body.classes.find(row => row.isOwner === 1).id;
    const oldStudent = createUser(f.db, { username: 'demo2026002', displayName: '演示学生2', role: 'student', passwordHash: f.passwordHash, profile: { seeded: true } });
    addStudentToClass(f.db, classId, oldStudent.id);
    await f.request('/api/auth/demo-login', { role: 'student' });
    const overview = await f.request(`/api/teacher/classes/${classId}/overview`, undefined, teacherJar, 'GET');
    assert.equal(overview.body.students.length, 1);
    assert.notEqual(overview.body.students[0].id, oldStudent.id);
    assert.ok(getUserById(f.db, oldStudent.id));
  } finally { await f.close(); }
});

test('demo login renames the shared class and keeps provisioned classmates', async () => {
  const f = await fixture();
  try {
    const teacherJar = {};
    const first = await f.request('/api/auth/demo-login', { role: 'teacher' }, teacherJar);
    assert.equal(first.status, 200);
    const original = (await f.request('/api/teacher/classes', undefined, teacherJar, 'GET')).body.classes.find((row) => row.isOwner === 1);
    assert.ok(original, '演示账号名下的演示班应可见');
    f.db.prepare('UPDATE classes SET name = ? WHERE id = ?').run('芯游记 · 演示教学班', original.id);
    const classmate = createUser(f.db, { username: '2026001', displayName: '学生01', role: 'student', passwordHash: f.passwordHash });
    addStudentToClass(f.db, original.id, classmate.id);

    const second = await f.request('/api/auth/demo-login', { role: 'student' });
    assert.equal(second.status, 200);
    const classes = (await f.request('/api/teacher/classes', undefined, teacherJar, 'GET')).body.classes;
    const owned = classes.filter((row) => row.isOwner === 1);
    assert.equal(owned.length, 1, '只读账号名下只保留演示班');
    assert.equal(owned[0].id, original.id);
    assert.equal(owned[0].name, '计算机组成原理1班');
    const overview = await f.request(`/api/teacher/classes/${original.id}/overview`, undefined, teacherJar, 'GET');
    assert.deepEqual(new Set(overview.body.students.map(student => student.id)), new Set([classmate.id, second.body.user.id]));
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
    const classId = classes.body.classes.find(row => row.isOwner === 1).id;
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
    assert.equal(teacher.profile_json.includes('"readOnly":true'), true, '演示教师持久化为只读');
    // 演示账号名不可被其它身份的账号占用
    f.db.prepare('UPDATE users SET role = ? WHERE id = ?').run('student', teacher.id);
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

test('avatar saves through settings, resets to default, and survives a wrong-password rejection unchanged', async () => {
  const f = await fixture();
  try {
    const jar = await f.login('student-formal');
    // 预设头像：保存后 profile.avatar 持久化并随 /api/auth/me 返回
    const preset = await f.request('/api/auth/settings', { displayName: '正式学生', mode: '强引导模式', avatar: 'preset:chip-teal' }, jar, 'PUT');
    assert.equal(preset.status, 200); assert.equal(preset.body.user.profile.avatar, 'preset:chip-teal');
    assert.equal((await f.request('/api/auth/me', undefined, jar, 'GET')).body.user.profile.avatar, 'preset:chip-teal');
    assert.equal(JSON.parse(getUserById(f.db, f.student.id).profile_json).avatar, 'preset:chip-teal');
    // 自定义头像：合法的 WebP data URL 可保存
    const customAvatar = WEBP_AVATAR;
    const custom = await f.request('/api/auth/settings', { displayName: '正式学生', avatar: customAvatar }, jar, 'PUT');
    assert.equal(custom.status, 200); assert.equal(custom.body.user.profile.avatar, customAvatar);
    // 不携带 avatar 字段的保存保持原头像不变
    const untouched = await f.request('/api/auth/settings', { displayName: '再次更新' }, jar, 'PUT');
    assert.equal(untouched.status, 200); assert.equal(untouched.body.user.profile.avatar, customAvatar);
    // 非法头像：未知预设、伪造协议、超长 data URL 全部 400
    assert.equal((await f.request('/api/auth/settings', { displayName: '正式学生', avatar: 'preset:chip-unknown' }, jar, 'PUT')).status, 400);
    assert.equal((await f.request('/api/auth/settings', { displayName: '正式学生', avatar: 'https://evil.example/x.png' }, jar, 'PUT')).status, 400);
    assert.equal((await f.request('/api/auth/settings', { displayName: '正式学生', avatar: `data:image/webp;base64,${'A'.repeat(120_001)}` }, jar, 'PUT')).status, 400);
    assert.equal((await f.request('/api/auth/settings', { displayName: '正式学生', avatar: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }, jar, 'PUT')).status, 400);
    // 密码错误时整单不保存，头像也不变
    const rejected = await f.request('/api/auth/settings', { displayName: '正式学生', avatar: 'preset:chip-blue', currentPassword: 'incorrect', nextPassword: `New-${crypto.randomBytes(12).toString('hex')}` }, jar, 'PUT');
    assert.equal(rejected.status, 400);
    assert.equal(JSON.parse(getUserById(f.db, f.student.id).profile_json).avatar, customAvatar);
    // null 恢复默认头像
    const reset = await f.request('/api/auth/settings', { displayName: '正式学生', avatar: null }, jar, 'PUT');
    assert.equal(reset.status, 200); assert.equal(reset.body.user.profile.avatar, null);
  } finally { await f.close(); }
});

test('avatar API fully decodes raster images and rejects corrupt, disguised and oversized dimensions atomically', async () => {
  const f = await fixture();
  try {
    const jar = await f.login('student-formal');
    for (const avatar of [PNG_AVATAR, JPEG_AVATAR, WEBP_AVATAR]) {
      const result = await f.request('/api/auth/settings', { displayName: '真实图片测试', avatar }, jar, 'PUT');
      assert.equal(result.status, 200);
      assert.equal(result.body.user.profile.avatar, avatar);
    }
    const corruptPng = 'data:image/png;base64,' + Buffer.from(PNG_AVATAR.split(',')[1], 'base64').subarray(0, 40).toString('base64');
    for (const avatar of ['data:image/webp;base64,' + Buffer.from('not an image').toString('base64'), PNG_AVATAR.replace('image/png', 'image/webp'), corruptPng, WIDE_PNG_AVATAR, 'data:image/png;base64,====']) {
      const result = await f.request('/api/auth/settings', { displayName: '不应保存的姓名', avatar }, jar, 'PUT');
      assert.equal(result.status, 400);
      const saved = getUserById(f.db, f.student.id);
      assert.equal(saved.display_name, '真实图片测试');
      assert.equal(JSON.parse(saved.profile_json).avatar, WEBP_AVATAR);
    }
  } finally { await f.close(); }
});

test('teacher accounts can also set an avatar', async () => {
  const f = await fixture();
  try {
    const teacherJar = await f.login('teacher-formal');
    const result = await f.request('/api/auth/settings', { displayName: '正式教师', avatar: 'preset:chip-violet' }, teacherJar, 'PUT');
    assert.equal(result.status, 200); assert.equal(result.body.user.profile.avatar, 'preset:chip-violet');
  } finally { await f.close(); }
});

test('demo accounts are read-only: publishing is rejected, existing class homework stays visible', async () => {
  const f = await fixture();
  try {
    const teacherJar = {}, studentJar = {};
    const teacherLogin = await f.request('/api/auth/demo-login', { role: 'teacher' }, teacherJar);
    const studentLogin = await f.request('/api/auth/demo-login', { role: 'student' }, studentJar);
    assert.equal(teacherLogin.status, 200);
    assert.equal(studentLogin.status, 200);
    const classes = await f.request('/api/teacher/classes', undefined, teacherJar, 'GET');
    const classId = classes.body.classes.find(row => row.isOwner === 1).id;
    const overview = await f.request(`/api/teacher/classes/${classId}/overview`, undefined, teacherJar, 'GET');
    assert.deepEqual(overview.body.students.map((student) => student.id), [studentLogin.body.user.id]);
    // 只读：演示教师不能新建作业、不能提交任何修改
    const draft = await f.request(`/api/teacher/classes/${classId}/assignments`, { title: '演示作业', description: '班级关联检查' }, teacherJar);
    assert.equal(draft.status, 403);
    assert.equal(draft.body.error.code, 'DEMO_READ_ONLY');
    // 已有的班级作业（只读生效前的数据）师生双方仍然可以看到
    const demoTeacherId = getUserByUsername(f.db, 'demo-teacher').id;
    const inserted = f.db.prepare("INSERT INTO assignments (class_id, teacher_id, title, description, status, question_count) VALUES (?, ?, '演示作业', '班级关联检查', 'published', 0)").run(classId, demoTeacherId);
    const assignmentId = Number(inserted.lastInsertRowid);
    const visible = await f.request('/api/student/assignments', undefined, studentJar, 'GET');
    assert.deepEqual(visible.body.assignments.map((assignment) => assignment.id), [assignmentId]);
    assert.equal((await f.request(`/api/student/assignments/${assignmentId}`, undefined, studentJar, 'GET')).status, 200);
    const formalStudent = await f.login('student-formal', 'student');
    assert.deepEqual((await f.request('/api/student/assignments', undefined, formalStudent, 'GET')).body.assignments, []);
  } finally { await f.close(); }
});
