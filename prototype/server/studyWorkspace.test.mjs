import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, createUser, createClass, addStudentToClass } from './db.js';
import { createStudyWorkspace } from './studyWorkspace.js';

function setup() {
  const db = openDatabase(':memory:'); migrate(db);
  const student = createUser(db, { username: 'planner', displayName: '计划学生', role: 'student', passwordHash: 'unused' });
  const other = createUser(db, { username: 'other', displayName: '另一学生', role: 'student', passwordHash: 'unused' });
  const teacher = createUser(db, { username: 'teacher', displayName: '教师', role: 'teacher', passwordHash: 'unused' });
  let now = Date.parse('2026-10-05T01:00:00Z');
  const service = createStudyWorkspace(db, { now: () => now });
  return { db, service, student, other, teacher, advance: ms => { now += ms; } };
}
const plan = { title: '检查全加器进位', date: '2026-10-05', minutes: 25, target: { kind: 'lab', id: 'full-adder' } };

test('plans use new server evidence, preserve historical grades, and isolate accounts', () => {
  const s = setup(); try {
    s.db.prepare('INSERT INTO challenge_attempts(student_id,challenge_id,passed,score) VALUES(?,?,1,100)').run(s.student.id, 'full-adder');
    let p = s.service.createPlan(s.student, plan);
    assert.equal(p.status, 'pending', 'earlier completed experiments are not new plan evidence');
    assert.throws(() => s.service.updatePlan(s.other, p.id, { ...plan, revision: p.revision }), e => e.status === 404);
    assert.throws(() => s.service.updatePlan(s.student, p.id, { ...plan, date: '2026-02-30', revision: p.revision }), e => e.status === 400);
    p = s.service.updatePlan(s.student, p.id, { ...plan, title: '重新检查进位', revision: p.revision });
    assert.throws(() => s.service.updatePlan(s.student, p.id, { ...plan, revision: 1 }), e => e.status === 409);
    s.db.prepare('INSERT INTO challenge_attempts(student_id,challenge_id,passed,score) VALUES(?,?,1,100)').run(s.student.id, 'full-adder');
    p = s.service.snapshot(s.student).plans[0];
    assert.equal(p.status, 'completed'); assert.equal(p.completionKind, 'evidence');
    assert.match(p.completionNote, /检测通过/);
    assert.equal(s.db.prepare('SELECT count(*) AS n FROM challenge_attempts').get().n, 2);
    assert.equal(s.service.snapshot(s.other).plans.length, 0);
  } finally { s.db.close(); }
});

test('focus clock recovers across readers, caps expiry, excludes pauses/rest, and finish is idempotent', () => {
  const s = setup(); try {
    let timer = s.service.start(s.student, { clientId: 'focus-session-1', minutes: 1, target: plan.target });
    assert.equal(s.service.start(s.student, { clientId: 'focus-session-1', minutes: 1, target: plan.target }).id, timer.id);
    assert.throws(() => s.service.start(s.student, { clientId: 'focus-session-2', minutes: 1 }), e => e.status === 409);
    s.advance(20000); timer = s.service.timerAction(s.student, timer.id, 'pause', { revision: timer.revision });
    assert.equal(timer.elapsedMs, 20000);
    s.advance(120000); assert.equal(s.service.snapshot(s.student).active.elapsedMs, 20000);
    assert.throws(() => s.service.timerAction(s.other, timer.id, 'resume', { revision: timer.revision }), e => e.status === 404);
    timer = s.service.timerAction(s.student, timer.id, 'resume', { revision: timer.revision });
    s.advance(90000); timer = s.service.snapshot(s.student).active;
    assert.equal(timer.status, 'review'); assert.equal(timer.elapsedMs, 60000);
    timer = s.service.timerAction(s.student, timer.id, 'finish', { revision: timer.revision, outcome: '验证了输入进位', question: '两位加法还需练习', elapsedMs: 999999999 });
    assert.equal(timer.status, 'completed'); assert.equal(timer.elapsedMs, 60000);
    assert.equal(s.service.timerAction(s.student, timer.id, 'finish', { revision: 1 }).id, timer.id);
    let rest = s.service.start(s.student, { clientId: 'break-session-1', kind: 'break', minutes: 5 });
    s.advance(5 * 60000); assert.equal(s.service.snapshot(s.student).active, null);
    const data = s.service.snapshot(s.student); assert.equal(data.week.focusMs, 60000); assert.equal(data.week.sessions, 1);
    assert.equal(data.history.filter(t => t.kind === 'focus').length, 1);
    assert.equal(data.history.find(t => t.id === timer.id).question, '两位加法还需练习');
    assert.ok(rest.id);
  } finally { s.db.close(); }
});

test('teacher assignments and remedial plans require membership and use genuine completion evidence', () => {
  const s = setup(); try {
    const cls = createClass(s.db, s.teacher.id, '计划班'); addStudentToClass(s.db, cls.id, s.student.id);
    const task = Number(s.db.prepare('INSERT INTO learning_coach_tasks(teacher_id,class_id,student_id,title) VALUES(?,?,?,?)').run(s.teacher.id, cls.id, s.student.id, '进位补练').lastInsertRowid);
    assert.ok(s.service.snapshot(s.student).suggestions.some(t => t.target.kind === 'coach'));
    assert.throws(() => s.service.createPlan(s.other, { ...plan, target: { kind: 'coach', id: task } }), e => e.status === 404);
    assert.throws(() => s.service.createPlan(s.teacher, { ...plan, target: { kind: 'coach', id: task } }), e => e.status === 404);
    const p = s.service.createPlan(s.student, { ...plan, target: { kind: 'coach', id: task } });
    let timer = s.service.start(s.student, { clientId: 'plan-focus-1', planId: p.id, minutes: 25 });
    s.advance(10000); s.service.timerAction(s.student, timer.id, 'finish', { revision: timer.revision, outcome: '仍需修正' });
    assert.equal(s.service.snapshot(s.student).plans[0].status, 'pending', 'timer completion does not complete a teacher task');
    const manual = s.service.completePlan(s.student, p.id, { revision: p.revision });
    assert.equal(manual.completionKind, 'self');
    assert.equal(s.db.prepare('SELECT completed_run_id FROM learning_coach_tasks WHERE id=?').get(task).completed_run_id, null);
    assert.equal(s.service.snapshot(s.teacher).history.length, 0);
  } finally { s.db.close(); }
});

test('plans sync genuine task completion, and losing membership blocks new task access', () => {
  const s = setup(); try {
    const cls = createClass(s.db, s.teacher.id, '证据班'); addStudentToClass(s.db, cls.id, s.student.id);
    const task = Number(s.db.prepare('INSERT INTO learning_coach_tasks(teacher_id,class_id,student_id,title) VALUES(?,?,?,?)').run(s.teacher.id,cls.id,s.student.id,'进位复测').lastInsertRowid);
    const p = s.service.createPlan(s.student,{...plan,target:{kind:'coach',id:task}});
    const run = Number(s.db.prepare("INSERT INTO learning_coach_runs(owner_id,initial_passed,diagnosis_json,initial_json,plan_json,status) VALUES(?,1,'{}','{}','{}','completed')").run(s.student.id).lastInsertRowid);
    s.db.prepare('UPDATE learning_coach_tasks SET completed_run_id=? WHERE id=?').run(run,task);
    assert.equal(s.service.snapshot(s.student).plans.find(x=>x.id===p.id).completionKind,'evidence');
    const assignment = Number(s.db.prepare("INSERT INTO assignments(class_id,teacher_id,title,status) VALUES(?,?,'课堂作业','published')").run(cls.id,s.teacher.id).lastInsertRowid);
    const homework = s.service.createPlan(s.student,{...plan,target:{kind:'assignment',id:assignment}});
    s.db.prepare("INSERT INTO student_submissions(assignment_id,student_id,status) VALUES(?,?,'submitted')").run(assignment,s.student.id);
    assert.match(s.service.snapshot(s.student).plans.find(x=>x.id===homework.id).completionNote,/不代表全部答对/);
    s.db.prepare('DELETE FROM class_members WHERE class_id=? AND student_id=?').run(cls.id,s.student.id);
    assert.throws(()=>s.service.createPlan(s.student,{...plan,target:{kind:'assignment',id:assignment}}),e=>e.status===404);
    assert.equal(s.service.snapshot(s.student).suggestions.some(x=>x.target.kind==='assignment'),false);
  } finally {s.db.close();}
});

test('week boundary uses Beijing Monday; cancelled sessions and rest do not count', () => {
  const s = setup(); try {
    s.advance(-9*3600000-120000); // Sunday 23:58 Beijing.
    let timer = s.service.start(s.student,{clientId:'sunday-clock-1',minutes:1});
    s.advance(60000); s.service.timerAction(s.student,timer.id,'finish',{revision:timer.revision});
    assert.equal(s.service.snapshot(s.student).week.sessions,1);
    s.advance(120000); assert.equal(s.service.snapshot(s.student).week.sessions,0);
    assert.equal(s.service.snapshot(s.student).history.length,1,'history remains available across weeks');
    assert.throws(()=>s.service.start(s.student,{clientId:'invalid-clock-1',minutes:0}),e=>e.status===400);
    timer = s.service.start(s.student,{clientId:'monday-clock-1',minutes:1}); s.advance(5000);
    s.service.timerAction(s.student,timer.id,'cancel',{revision:timer.revision});
    assert.equal(s.service.snapshot(s.student).week.focusMs,0);
    const p = s.service.createPlan(s.student,{...plan,target:{kind:'custom'}});
    const done=s.service.completePlan(s.student,p.id,{revision:p.revision});
    s.service.archivePlan(s.student,p.id,{revision:done.revision});
    assert.equal(s.service.snapshot(s.student).week.completedPlans,1,'archiving retains completion history');
  } finally {s.db.close();}
});
