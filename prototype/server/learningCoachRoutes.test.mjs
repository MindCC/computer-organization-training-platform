import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase, migrate, createUser, createClass, addStudentToClass } from './db.js';
import { hashPassword } from './auth.js';
import { FULL_ADDER_CIRCUIT } from '../src/circuit/challengeCircuitModel.js';

async function setup() {
  const db = openDatabase(':memory:'); migrate(db);
  const passwordHash = await hashPassword('CoachTest123!'), users = {};
  for (const [username, role] of [['alice', 'student'], ['bob', 'student'], ['teacher', 'teacher'], ['other', 'teacher']]) users[username] = createUser(db, { username, role, displayName: username, passwordHash });
  const classId = createClass(db, users.teacher.id, '诊断试用班').id;
  addStudentToClass(db, classId, users.alice.id); addStudentToClass(db, classId, users.bob.id);
  const otherClass = createClass(db, users.other.id, '另一班').id;
  const app = createApp({ db, serveStatic: false, logger: () => {}, learningCoachOptions: { env: {} } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { cookie, ...opts } = {}) {
    const res = await fetch(url + path, { ...opts, signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...opts.headers } });
    const isJson = res.headers.get('content-type')?.includes('json');
    return { status: res.status, body: isJson ? await res.json() : await res.text(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  const cookies = {};
  for (const username of Object.keys(users)) cookies[username] = (await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password: 'CoachTest123!' }) })).cookie;
  return { db, request, cookies, users, classId, otherClass, close: async () => { await new Promise(r => { server.close(r); server.closeAllConnections(); }); db.close(); } };
}

test('real HTTP diagnostic-to-retest flow persists, rejects forged scores, stale writes and cross-account access', async () => {
  const s = await setup(); try {
    const base = '/api/student/learning-coach', cookie = s.cookies.alice;
    const post = (path, body, who = cookie) => s.request(path, { cookie: who, method: 'POST', body: JSON.stringify(body) });
    assert.equal((await s.request(base)).status, 401);
    assert.equal((await post(base + '/diagnose', { challengeId: 'full-adder', taskId: 0, evidence: { circuitEdges: [] } })).status, 400);
    const result = await post(base + '/diagnose', { challengeId: 'full-adder', classId: s.classId, evidence: { circuitEdges: [], score: 100, passed: true } });
    assert.equal(result.status, 201); let run = result.body.run;
    assert.equal(run.diagnosis.passed, false); assert.equal(run.hints.length, 0); assert.equal(run.plan.source, 'local');
    const path = base + '/runs/' + run.id;
    assert.equal((await s.request(path, { cookie: s.cookies.bob })).status, 404);
    assert.equal((await post(path + '/hint', { revision: run.revision, level: 4 })).status, 400);
    assert.equal((await post(path + '/retest', { revision: run.revision })).status, 400);
    run = (await post(path + '/hint', { revision: run.revision, level: 1 })).body.run;
    const originalHint = run.hints[0].detail;
    assert.equal(run.hints.length, 1);
    assert.equal((await post(path + '/hint', { revision: 1, level: 2 })).status, 409);
    run = (await post(path + '/verify', { revision: run.revision, evidence: { circuitEdges: FULL_ADDER_CIRCUIT.requiredEdges } })).body.run;
    assert.equal(run.repaired, true); assert.equal(run.initialPassed, false);
    assert.equal(run.initialDiagnosis.passed, false, 'original diagnostic evidence survives repair');
    assert.equal(run.diagnosis.passed, true);
    assert.equal(run.hints[0].detail, originalHint, 'hint memory must preserve the earlier evidence');
    run = (await post(path + '/retest', { revision: run.revision })).body.run;
    assert.ok(run.retest.questions.length === 4); assert.ok(!JSON.stringify(run.retest).includes('expected'));
    const wrong = Object.fromEntries(run.retest.questions.map(q => [q.id, [0, 0]]));
    // Force one incorrect answer regardless of the generated input.
    const q = run.retest.questions[0], expected = (q.a + q.b + q.cin) & ((1 << q.width) - 1); wrong[q.id][0] = expected ^ 1;
    run = (await post(path + '/retest/submit', { revision: run.revision, answers: wrong, passed: true, score: 100 })).body.run;
    assert.equal(run.status, 'retest_failed');
    run = (await post(path + '/retest', { revision: run.revision })).body.run;
    run = (await post(path + '/hint', { revision: run.revision, level: 2 })).body.run;
    const answers = Object.fromEntries(run.retest.questions.map(q => [q.id, [(q.a + q.b + q.cin) & ((1 << q.width) - 1), (q.a + q.b + q.cin) >> q.width]]));
    run = (await post(path + '/retest/submit', { revision: run.revision, answers })).body.run;
    assert.equal(run.status, 'retest_passed'); assert.equal(run.retest.usedHint, true);
    assert.equal((await s.request(base, { cookie })).body.latest.id, run.id);
    assert.equal(s.db.prepare('SELECT count(*) AS n FROM challenge_attempts WHERE student_id=?').get(s.users.alice.id).n, 0);
    const summary = (await s.request(`/api/teacher/classes/${s.classId}/learning-coach`, { cookie: s.cookies.teacher })).body;
    assert.equal(summary.passedStudents, 1); assert.equal(summary.students.find(r => r.id === s.users.alice.id).withoutRetestHints, 0);
    const replay = await s.request(`/api/teacher/classes/${s.classId}/learning-coach/students/${s.users.alice.id}`, { cookie: s.cookies.teacher });
    assert.equal(replay.body.runs[0].id, run.id); assert.equal(replay.body.runs[0].events.filter(e => e.kind === 'retest_submitted').length, 2);
    assert.equal((await s.request(`/api/teacher/classes/${s.otherClass}/learning-coach/students/${s.users.alice.id}`, { cookie: s.cookies.other })).status, 404);
    assert.equal((await post(path + '/retest/submit', { revision: run.revision, answers })).status, 409);
  } finally { await s.close(); }
});

test('teacher confirmation, class isolation, published sources, targeted tasks and student completion', async () => {
  const s = await setup(); try {
    const teacherBase = `/api/teacher/classes/${s.classId}/learning-coach`, base = '/api/student/learning-coach';
    const post = (path, body, cookie = s.cookies.teacher) => s.request(path, { cookie, method: 'POST', body: JSON.stringify(body) });
    assert.equal((await s.request(teacherBase, { cookie: s.cookies.other })).status, 404);
    assert.equal((await post(teacherBase + '/tasks', { studentIds: [999], title: '全加器补练' })).status, 404);
    assert.equal((await post(teacherBase + '/sources', { sourceId: 'adder-meaning-v1' })).status, 400);
    assert.equal((await post(teacherBase + '/sources', { sourceId: 'adder-meaning-v1', confirmed: true })).status, 200);
    const tasks = await post(teacherBase + '/tasks', { studentIds: [s.users.alice.id], title: '进位补练' }); assert.equal(tasks.body.created, 1);
    assert.equal((await post(teacherBase + '/tasks', { studentIds: [s.users.alice.id], title: '进位补练' })).body.existing, 1);
    assert.equal((await s.request(base, { cookie: s.cookies.bob })).body.tasks.length, 0);
    const task = (await s.request(base, { cookie: s.cookies.alice })).body.tasks[0];
    assert.equal((await post(base + '/diagnose', { challengeId: 'full-adder', taskId: task.id, evidence: { circuitEdges: [] } }, s.cookies.bob)).status, 404);
    let run = (await post(base + '/diagnose', { challengeId: 'full-adder', taskId: task.id, evidence: { circuitEdges: FULL_ADDER_CIRCUIT.requiredEdges } }, s.cookies.alice)).body.run;
    assert.equal(run.status, 'repaired', 'an initially correct circuit should invite transfer testing');
    assert.equal(run.plan.references.find(r => r.id === 'adder-meaning-v1').review, 'teacher');
    const path = base + '/runs/' + run.id;
    run = (await post(path + '/retest', { revision: run.revision }, s.cookies.alice)).body.run;
    const answers = Object.fromEntries(run.retest.questions.map(q => [q.id, [(q.a + q.b + q.cin) & ((1 << q.width) - 1), (q.a + q.b + q.cin) >> q.width]]));
    run = (await post(path + '/retest/submit', { revision: run.revision, answers }, s.cookies.alice)).body.run;
    assert.equal((await s.request(base, { cookie: s.cookies.alice })).body.tasks[0].completedRunId, run.id);
    const csv = await s.request(teacherBase + '/export.csv', { cookie: s.cookies.teacher }); assert.equal(csv.status, 200); assert.match(csv.body, /alice/);
    const trial = await post('/api/teacher/learning-coach/diagnose', { challengeId: 'full-adder', classId: s.classId, evidence: { circuitEdges: [] } }); assert.equal(trial.body.run.classId, null);
    assert.equal((await s.request(teacherBase, { cookie: s.cookies.teacher })).body.diagnosedStudents, 1);
    // Removed members cannot continue a task in the previous class.
    s.db.prepare('DELETE FROM class_members WHERE class_id=? AND student_id=?').run(s.classId, s.users.alice.id);
    assert.equal((await post(path + '/hint', { revision: run.revision, level: 1 }, s.cookies.alice)).status, 403);
  } finally { await s.close(); }
});
