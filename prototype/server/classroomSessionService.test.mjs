import test from "node:test";
import assert from "node:assert/strict";
import { createClass, createUser, migrate, openDatabase, addStudentToClass } from "./db.js";
import { createClassroomSessionRepository } from "./classroomSessionRepository.js";
import { createClassroomSessionService, ALLOWED_TRANSITIONS, computeActiveSeconds, calculateRewards, calculateBadges } from "./classroomSessionService.js";

function makeContext() {
  const db = openDatabase(":memory:");
  migrate(db);
  const repository = createClassroomSessionRepository(db);
  let nowValue = Date.now();
  const service = createClassroomSessionService({ db, now: () => nowValue, repository });
  return { db, repository, service, advanceMs: (ms) => { nowValue += ms; } };
}

test("ALLOWED_TRANSITIONS enforces only approved state changes", () => {
  assert.deepEqual([...ALLOWED_TRANSITIONS.draft], ["live"]);
  assert.deepEqual([...ALLOWED_TRANSITIONS.live], ["paused", "ended"]);
  assert.deepEqual([...ALLOWED_TRANSITIONS.paused], ["live", "ended"]);
  assert.deepEqual([...ALLOWED_TRANSITIONS.ended], []);
});

test("calculateRewards handles boundary conditions", () => {
  assert.deepEqual(calculateRewards({ stageScores: [], firstAttemptPasses: [], stageAttempts: [], streak: 0, passScore: 80 }), { xp: 0, stars: 0, average: 0 });
  const res = calculateRewards({
    stageScores: [100, 100, 100, 100],
    firstAttemptPasses: [true, true, true, true],
    stageAttempts: [1, 1, 1, 1],
    streak: 4,
    passScore: 80,
  });
  assert.equal(res.xp, 400 + 80 + 60, "xp = base 400 + firstAttempt 80 + streak 60");
  assert.equal(res.stars, 3);
  assert.equal(res.average, 100);
  const justBelow = calculateRewards({
    stageScores: [100, 100, 100, 100],
    firstAttemptPasses: [true, true, true, true],
    stageAttempts: [1, 1, 1, 3],
    streak: 0,
    passScore: 80,
  });
  assert.equal(justBelow.stars, 2, "third star lost because one stage > 2 attempts");
  const fail = calculateRewards({ stageScores: [50, 50, 50, 50], firstAttemptPasses: [false, false, false, false], stageAttempts: [5, 5, 5, 5], streak: 0, passScore: 80 });
  assert.equal(fail.stars, 0);
});

test("calculateBadges returns correct badges by stage completion", () => {
  assert.deepEqual(calculateBadges(["components"]), ["部件识别者"]);
  assert.deepEqual(calculateBadges(["instruction-data", "data-flow"]), ["数据流侦探"]);
  assert.deepEqual(calculateBadges(["components", "instruction-data", "data-flow"]), ["部件识别者", "数据流侦探"]);
  assert.deepEqual(calculateBadges(["program-flow"]), []);
});

test("createDraft rejects invalid config", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t1", displayName: "T1", role: "teacher", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacher.id, "测试班");
  assert.throws(() => ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 9, passScore: 80 } }), /10.*180/);
  assert.throws(() => ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 59 } }), /60.*100/);
  ctx.db.close();
});

test("createDraft and full lifecycle creates a live session", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t2", displayName: "T2", role: "teacher", passwordHash: "pw" });
  const student = createUser(ctx.db, { username: "s2", displayName: "S2", role: "student", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacher.id, "生命周期班");
  addStudentToClass(ctx.db, classRow.id, student.id);
  const session = ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80, allowMakeup: false } });
  assert.equal(session.status, "draft");
  const live = ctx.service.start({ teacherId: teacher.id, sessionId: session.id });
  assert.equal(live.status, "live");
  assert.ok(live.active_started_at);
  ctx.advanceMs(60_000);
  const paused = ctx.service.pause({ teacherId: teacher.id, sessionId: session.id });
  assert.equal(paused.status, "paused");
  assert.ok(paused.accumulated_active_seconds > 0);
  const resumed = ctx.service.resume({ teacherId: teacher.id, sessionId: session.id });
  assert.equal(resumed.status, "live");
  const ended = ctx.service.end({ teacherId: teacher.id, sessionId: session.id });
  assert.equal(ended.session.status, "ended");
  ctx.db.close();
});

test("invalid transitions are rejected", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t3", displayName: "T3", role: "teacher", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacher.id, "无效转换班");
  const session = ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 } });
  assert.throws(() => ctx.service.pause({ teacherId: teacher.id, sessionId: session.id }), /不允许的操作/);
  ctx.service.start({ teacherId: teacher.id, sessionId: session.id });
  assert.throws(() => ctx.service.start({ teacherId: teacher.id, sessionId: session.id }), /不允许的操作/);
  ctx.service.end({ teacherId: teacher.id, sessionId: session.id });
  assert.throws(() => ctx.service.pause({ teacherId: teacher.id, sessionId: session.id }), /课堂已结束/);
  ctx.db.close();
});

test("teacher ownership is enforced", () => {
  const ctx = makeContext();
  const teacherA = createUser(ctx.db, { username: "ta", displayName: "TA", role: "teacher", passwordHash: "pw" });
  const teacherB = createUser(ctx.db, { username: "tb", displayName: "TB", role: "teacher", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacherA.id, "A班");
  const session = ctx.service.createDraft({ teacherId: teacherA.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 } });
  assert.throws(() => ctx.service.start({ teacherId: teacherB.id, sessionId: session.id }), /课堂场次不存在/);
  ctx.db.close();
});

test("student enters and discovers current session", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t5", displayName: "T5", role: "teacher", passwordHash: "pw" });
  const student = createUser(ctx.db, { username: "s5", displayName: "S5", role: "student", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacher.id, "学生发现班");
  addStudentToClass(ctx.db, classRow.id, student.id);
  const session = ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 } });
  assert.equal(ctx.service.getStudentCurrent({ studentId: student.id }).session, null, "no session visible before start");
  ctx.service.start({ teacherId: teacher.id, sessionId: session.id });
  const current = ctx.service.getStudentCurrent({ studentId: student.id });
  assert.ok(current.session);
  assert.ok(current.mission);
  const entered = ctx.service.enterStudent({ studentId: student.id, sessionId: session.id });
  assert.equal(entered.studentState.status, "in_progress");
  ctx.db.close();
});

test("duplicate clientSubmissionId is idempotent", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t6", displayName: "T6", role: "teacher", passwordHash: "pw" });
  const student = createUser(ctx.db, { username: "s6", displayName: "S6", role: "student", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacher.id, "幂等班");
  addStudentToClass(ctx.db, classRow.id, student.id);
  const session = ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 } });
  ctx.service.start({ teacherId: teacher.id, sessionId: session.id });
  ctx.service.enterStudent({ studentId: student.id, sessionId: session.id });
  const submitId = "dup-id-12345";
  const payload = { clientSubmissionId: submitId, challengeId: "computer-components", result: { completed: true, elapsedMinutes: 3 } };
  const first = ctx.service.submitAttempt({ studentId: student.id, payload });
  assert.ok(first.summary?.xp !== undefined, "first submission returns xp");
  const firstXp = first.summary.xp;
  const second = ctx.service.submitAttempt({ studentId: student.id, payload });
  if (second.duplicateResult) {
    assert.equal(second.duplicateResult.passed, true, "duplicate returns same pass status");
  } else {
    assert.equal(second.summary?.xp, firstXp, "XP unchanged on duplicate");
  }
  ctx.db.close();
});

test("paused session rejects submission", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t7", displayName: "T7", role: "teacher", passwordHash: "pw" });
  const student = createUser(ctx.db, { username: "s7", displayName: "S7", role: "student", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacher.id, "暂停班");
  addStudentToClass(ctx.db, classRow.id, student.id);
  const session = ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 } });
  ctx.service.start({ teacherId: teacher.id, sessionId: session.id });
  ctx.service.enterStudent({ studentId: student.id, sessionId: session.id });
  ctx.service.pause({ teacherId: teacher.id, sessionId: session.id });
  assert.throws(() => ctx.service.submitAttempt({
    studentId: student.id,
    payload: { clientSubmissionId: "paused-sub", challengeId: "computer-components", result: { completed: true } },
  }), /课堂任务已暂停/);
  ctx.db.close();
});

test("report throws before freeze and returns report after end", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t8", displayName: "T8", role: "teacher", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacher.id, "报告班");
  const session = ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 } });
  ctx.service.start({ teacherId: teacher.id, sessionId: session.id });
  assert.throws(() => ctx.service.getReport({ teacherId: teacher.id, sessionId: session.id }), /课堂报告尚未生成/);
  ctx.service.end({ teacherId: teacher.id, sessionId: session.id });
  const report = ctx.service.getReport({ teacherId: teacher.id, sessionId: session.id });
  assert.ok(report);
  ctx.db.close();
});

test("automatic expiry ends the session after duration exceeded", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t9", displayName: "T9", role: "teacher", passwordHash: "pw" });
  const student = createUser(ctx.db, { username: "s9", displayName: "S9", role: "student", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacher.id, "超时班");
  addStudentToClass(ctx.db, classRow.id, student.id);
  const session = ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 10, passScore: 80 } });
  ctx.service.start({ teacherId: teacher.id, sessionId: session.id });
  // Advance past the 10-minute duration
  ctx.advanceMs(11 * 60 * 1000);
  const current = ctx.service.getStudentCurrent({ studentId: student.id });
  assert.equal(current.session, null, "expired session is no longer current");
  const overview = ctx.service.getTeacherOverview({ teacherId: teacher.id, sessionId: session.id });
  assert.equal(overview.session.status, "ended");
  ctx.db.close();
});

test("cross-class active session conflict detection", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t10", displayName: "T10", role: "teacher", passwordHash: "pw" });
  const student = createUser(ctx.db, { username: "s10", displayName: "S10", role: "student", passwordHash: "pw" });
  const classA = createClass(ctx.db, teacher.id, "A班");
  const classB = createClass(ctx.db, teacher.id, "B班");
  addStudentToClass(ctx.db, classA.id, student.id);
  addStudentToClass(ctx.db, classB.id, student.id);
  const sessionA = ctx.service.createDraft({ teacherId: teacher.id, classId: classA.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 } });
  ctx.service.start({ teacherId: teacher.id, sessionId: sessionA.id });
  const sessionB = ctx.service.createDraft({ teacherId: teacher.id, classId: classB.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 } });
  assert.throws(() => ctx.service.start({ teacherId: teacher.id, sessionId: sessionB.id }), /有学生在其他活动课堂中/);
  ctx.db.close();
});

test("enterStudent rejects non-class-member", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t11", displayName: "T11", role: "teacher", passwordHash: "pw" });
  const student = createUser(ctx.db, { username: "s11", displayName: "S11", role: "student", passwordHash: "pw" });
  const outsider = createUser(ctx.db, { username: "outsider", displayName: "Outsider", role: "student", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacher.id, "成员检查班");
  addStudentToClass(ctx.db, classRow.id, student.id);
  const session = ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 } });
  ctx.service.start({ teacherId: teacher.id, sessionId: session.id });
  assert.throws(() => ctx.service.enterStudent({ studentId: outsider.id, sessionId: session.id }), /不在该班级/);
  ctx.db.close();
});

test("submitAttempt rejects wrong challengeId for current stage", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t12", displayName: "T12", role: "teacher", passwordHash: "pw" });
  const student = createUser(ctx.db, { username: "s12", displayName: "S12", role: "student", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacher.id, "阶段检查班");
  addStudentToClass(ctx.db, classRow.id, student.id);
  const session = ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 } });
  ctx.service.start({ teacherId: teacher.id, sessionId: session.id });
  ctx.service.enterStudent({ studentId: student.id, sessionId: session.id });
  // Submit wrong challenge for stage 0 (should be "computer-components")
  assert.throws(() => ctx.service.submitAttempt({
    studentId: student.id,
    payload: { clientSubmissionId: "wrong-stage", challengeId: "program-flow", result: { completed: true } },
  }), /关卡与当前课堂阶段不匹配/);
  ctx.db.close();
});

test("submitAttempt tracks per-stage attempts and first-attempt-pass accurately", () => {
  const ctx = makeContext();
  const teacher = createUser(ctx.db, { username: "t13", displayName: "T13", role: "teacher", passwordHash: "pw" });
  const student = createUser(ctx.db, { username: "s13", displayName: "S13", role: "student", passwordHash: "pw" });
  const classRow = createClass(ctx.db, teacher.id, "追踪班");
  addStudentToClass(ctx.db, classRow.id, student.id);
  const session = ctx.service.createDraft({ teacherId: teacher.id, classId: classRow.id, config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 } });
  ctx.service.start({ teacherId: teacher.id, sessionId: session.id });
  ctx.service.enterStudent({ studentId: student.id, sessionId: session.id });
  // Stage 0 (participation): pass first attempt — advances to stageIndex=1
  ctx.service.submitAttempt({
    studentId: student.id,
    payload: { clientSubmissionId: "track-0", challengeId: "computer-components", result: { completed: true, elapsedMinutes: 3 } },
  });
  // Stage 1 (circuit): fail first attempt (valid edges format, but incomplete connections)
  const failCircuit = { edges: [{ from: { nodeId: "a", portId: "out" }, to: { nodeId: "b", portId: "in" } }], score: 0, passed: false, errors: [], elapsedMinutes: 1 };
  ctx.service.submitAttempt({
    studentId: student.id,
    payload: { clientSubmissionId: "track-1", challengeId: "program-flow", result: failCircuit },
  });
  // Stage 1 (circuit): fail again
  ctx.service.submitAttempt({
    studentId: student.id,
    payload: { clientSubmissionId: "track-2", challengeId: "program-flow", result: failCircuit },
  });
  // Stage 1 (circuit): pass third attempt
  const r3 = ctx.service.submitAttempt({
    studentId: student.id,
    payload: { clientSubmissionId: "track-3", challengeId: "program-flow", result: { edges: [{ from: { nodeId: "a", portId: "out" }, to: { nodeId: "b", portId: "in" } }], score: 100, passed: true, errors: [], elapsedMinutes: 2 } },
  });
  const state = r3.studentState;
  const parsed = JSON.parse(state.result_json);
  assert.equal(parsed.stageAttempts[0], 1, "stage 0: 1 attempt");
  assert.equal(parsed.firstAttemptPasses[0], true, "stage 0: first-attempt pass");
  assert.equal(parsed.stageAttempts[1], 3, "stage 1: 3 attempts (2 fail, 1 pass)");
  assert.equal(parsed.firstAttemptPasses[1], false, "stage 1: not first-attempt pass");
  ctx.db.close();
});
