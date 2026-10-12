import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';
import { createClass, createUser, getUserByUsername, migrate, openDatabase, recordStudentAttempt } from './db.js';
import { isDemoAccount } from './demoAccounts.js';
import { createClassroomSessionService } from './classroomSessionService.js';
import { createClassroomSessionRepository } from './classroomSessionRepository.js';

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
    const classId = classes.body.classes.find(row => row.isOwner === 1).id;
    assert.equal((await f.request(`/api/teacher/classes/${classId}/overview`, undefined, teacherJar, 'GET')).status, 200);
    assert.equal((await f.request('/api/student/progress', undefined, studentJar, 'GET')).status, 200);
    assert.equal((await f.request('/api/auth/me', undefined, studentJar, 'GET')).status, 200);

    // 演示教师是只读身份：写操作全部被服务器拒绝，并给出明确的只读口径
    const writes = [
      await f.request('/api/classes', { name: '演示新班' }, teacherJar),
      await f.request(`/api/teacher/classes/${classId}/assignments`, { title: '演示作业' }, teacherJar),
      await f.request('/api/teacher/task-library', { templateKey: 'task-chain', durationMinutes: 30, passScore: 80, taskChain: { title: 'x', stages: [{ id: 'a', type: 'custom', title: 't', instructions: '', submissionMode: 'confirm' }] } }, teacherJar),
      await f.request('/api/auth/change-password', { currentPassword: 'x', nextPassword: 'NewPass123!' }, teacherJar),
      await f.request('/api/auth/settings', { displayName: '改名' }, teacherJar),
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

test('演示学生可操作（能接受课堂任务、提交练习），演示教师仍然只读', async () => {
  const f = await fixture();
  try {
    const teacherJar = {}, studentJar = {};
    assert.equal((await f.request('/api/auth/demo-login', { role: 'teacher' }, teacherJar)).status, 200);
    assert.equal((await f.request('/api/auth/demo-login', { role: 'student' }, studentJar)).status, 200);

    // 演示学生不再带只读闸门依据的标记；演示教师仍受闸门保护
    assert.equal(isDemoAccount(getUserByUsername(f.db, 'demo-student')), false, '演示学生不应再被当作只读演示账号');
    assert.equal(isDemoAccount(getUserByUsername(f.db, 'demo-teacher')), true, '演示教师必须仍是只读身份');

    // 演示班的课堂由服务层直接开启（演示教师只读，开不了课）
    const demoClass = getUserByUsername(f.db, 'demo-teacher')
      ? f.db.prepare("SELECT id FROM classes WHERE teacher_id = (SELECT id FROM users WHERE username = 'demo-teacher') AND name = '计算机组成原理1班'").get()
      : null;
    assert.ok(demoClass, '演示班应存在');
    const sessions = createClassroomSessionService({ db: f.db, repository: createClassroomSessionRepository(f.db) });
    const session = sessions.createDraft({
      teacherId: getUserByUsername(f.db, 'demo-teacher').id, classId: demoClass.id,
      config: { templateKey: 'task-chain', durationMinutes: 45, passScore: 80, taskChain: { title: '演示课堂', stages: [{ id: 's1', type: 'ai', title: '问小芯', chapterId: 'ch2' }] } },
    });
    sessions.start({ teacherId: getUserByUsername(f.db, 'demo-teacher').id, sessionId: session.id });

    const current = await f.request('/api/student/classroom/current', undefined, studentJar, 'GET');
    assert.equal(current.status, 200, '演示学生应能查询当前课堂');
    assert.equal(current.body?.session?.id, session.id);
    const enter = await f.request(`/api/student/classroom/${session.id}/enter`, {}, studentJar);
    assert.notEqual(enter.status, 403, `演示学生应能接受任务，实际 ${enter.status} ${JSON.stringify(enter.body)}`);
    assert.equal(enter.status, 200, JSON.stringify(enter.body));

    // 练习提交也不再被只读闸门拦（判分结果由业务规则决定，这里只要求不是只读拒绝）
    const attempt = await f.request('/api/student/attempts', { challengeId: 'machine-number', passed: true, score: 100, clientSubmissionId: 'demo-writable-001' }, studentJar);
    assert.notEqual(attempt.body?.error?.code, 'DEMO_READ_ONLY', '演示学生的练习提交不应再被只读闸门拒绝');
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
    const classId = (await f.request('/api/teacher/classes', undefined, teacherJar, 'GET')).body.classes.find(row => row.isOwner === 1).id;
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

test('任务库条目随真实班级一并划归正式教师，否则正式账号在课堂任务里看不到已发布的任务链', async () => {
  const db = openDatabase(':memory:'); migrate(db);
  try {
    const demoTeacher = createUser(db, { username: 'demo-teacher', displayName: '演示教师', role: 'teacher', passwordHash: 'x', profile: { demoAccount: true } });
    const formal = createUser(db, { username: 'teacher', displayName: '任课教师', role: 'teacher', passwordHash: 'x' });
    const roster = createClass(db, demoTeacher.id, '26计算机科学与技术(专升本)9');
    const demoClass = createClass(db, demoTeacher.id, '计算机组成原理1班');
    const { createTaskLibrary } = await import('./taskLibrary.js');
    const { createClassroomSessionService } = await import('./classroomSessionService.js');
    const { createClassroomSessionRepository } = await import('./classroomSessionRepository.js');
    const sessions = createClassroomSessionService({ db, repository: createClassroomSessionRepository(db) });
    const library = createTaskLibrary({ db, sessionService: sessions });
    const taskConfig = { templateKey: 'task-chain', durationMinutes: 45, passScore: 80,
      knowledgePointIds: [], taskChain: { title: '补码运算', stages: [{ id: 's1', type: 'ai', title: '课前诊断', chapterId: 'ch2' }] } };
    // 演示账号先在真实班级发布一次，再在演示班发布一次（后者必须留在演示账号名下）
    const rosterTask = library.create(demoTeacher.id, taskConfig);
    library.publish(demoTeacher.id, rosterTask.id, { classId: roster.id, clientSubmissionId: 'roster-pub-01', revision: rosterTask.revision });
    const demoTask = library.create(demoTeacher.id, taskConfig);
    library.publish(demoTeacher.id, demoTask.id, { classId: demoClass.id, clientSubmissionId: 'demo-pub-01', revision: demoTask.revision });

    migrate(db);

    const formalTasks = library.list(formal.id).map((task) => task.id);
    assert.deepEqual(formalTasks, [rosterTask.id], '正式账号应看到随班级划归的任务链');
    assert.deepEqual(library.list(demoTeacher.id).map((task) => task.id), [demoTask.id], '演示班的任务仍留在演示账号名下');
    assert.equal(db.prepare('SELECT teacher_id FROM task_library_publications WHERE task_id = ?').get(rosterTask.id).teacher_id, formal.id);
    assert.equal(db.prepare('SELECT teacher_id FROM task_library_publications WHERE task_id = ?').get(demoTask.id).teacher_id, demoTeacher.id);
    // 幂等：再跑一次不会重复迁移或报错
    migrate(db);
    assert.deepEqual(library.list(formal.id).map((task) => task.id), [rosterTask.id]);
  } finally { db.close(); }
});
