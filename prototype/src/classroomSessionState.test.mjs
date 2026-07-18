import test from "node:test";
import assert from "node:assert/strict";
import {
  pendingSubmissionKey,
  readPendingSubmission,
  writePendingSubmission,
  clearPendingSubmission,
  buildClassroomViewModel,
  buildTeacherSessionViewModel,
  mergeClassroomSubmission,
} from "./classroomSessionState.js";

test("pendingSubmissionKey isolates by user, session, and stage", () => {
  const key1 = pendingSubmissionKey({ userId: "u1", sessionId: 1, stageId: "components" });
  const key2 = pendingSubmissionKey({ userId: "u2", sessionId: 1, stageId: "components" });
  const key3 = pendingSubmissionKey({ userId: "u1", sessionId: 2, stageId: "components" });
  assert.notEqual(key1, key2);
  assert.notEqual(key1, key3);
  assert.ok(key1.includes("u1"));
  assert.ok(key1.includes("1"));
  assert.ok(key1.includes("components"));
});

test("pending submission read/write/clear round-trip", () => {
  const storage = new Map();
  const mockLs = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  const key = pendingSubmissionKey({ userId: "u1", sessionId: 1, stageId: "components" });
  const payload = { clientSubmissionId: "abc-123", payload: { challengeId: "computer-components", result: { completed: true } } };
  writePendingSubmission(mockLs, key, payload);
  const read = readPendingSubmission(mockLs, key);
  assert.equal(read.clientSubmissionId, "abc-123");
  assert.ok(read.payload);
  clearPendingSubmission(mockLs, key);
  assert.equal(readPendingSubmission(mockLs, key), null);
});

test("pending submission recovers from malformed JSON", () => {
  const storage = new Map();
  const mockLs = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  const key = pendingSubmissionKey({ userId: "u1", sessionId: 1, stageId: "components" });
  storage.set(key, "{bad json");
  assert.equal(readPendingSubmission(mockLs, key), null);
  assert.equal(storage.has(key), false);
});

test("buildClassroomViewModel handles null session", () => {
  const vm = buildClassroomViewModel({ session: null });
  assert.equal(vm.active, false);
});

test("buildClassroomViewModel maps paused and live states", () => {
  const vm = buildClassroomViewModel({
    session: { id: 1, title: "测试课堂", status: "live", template_key: "computer-data-flow", template_version: 1 },
    studentState: { status: "in_progress", current_stage_index: 1, xp: 120, stars: 0, streak: 1 },
    mission: { title: "计算机五大部件与数据流", stages: [{ id: "components" }, { id: "program-flow" }] },
    remainingSeconds: 1800,
  });
  assert.equal(vm.active, true);
  assert.equal(vm.paused, false);
  assert.equal(vm.remainingSeconds, 1800);
  assert.equal(vm.xp, 120);
  assert.equal(vm.currentStage.id, "program-flow");
});

test("buildClassroomViewModel marks paused state", () => {
  const vm = buildClassroomViewModel({
    session: { id: 1, title: "测试课堂", status: "paused" },
    studentState: { status: "in_progress", current_stage_index: 0, xp: 0, stars: 0, streak: 0 },
    remainingSeconds: 900,
  });
  assert.equal(vm.paused, true);
  assert.equal(vm.ended, false);
});

test("buildTeacherSessionViewModel creates stage buckets", () => {
  const vm = buildTeacherSessionViewModel({
    session: { id: 1, title: "测试课堂", status: "live", updated_at: "2026-01-01" },
    students: [
      { student_id: 1, display_name: "A", status: "not_started", current_stage_index: 0, xp: 0 },
      { student_id: 2, display_name: "B", status: "in_progress", current_stage_index: 1, xp: 50 },
      { student_id: 3, display_name: "C", status: "completed", current_stage_index: 4, xp: 400 },
    ],
    updatedAt: "2026-01-02",
  });
  assert.equal(vm.active, true);
  assert.equal(vm.stageBuckets.not_started.length, 1);
  assert.equal(vm.stageBuckets.in_progress.length, 1);
  assert.equal(vm.stageBuckets.completed.length, 1);
  assert.equal(vm.needsHelp.length, 0);
  assert.equal(vm.updatedAt, "2026-01-02");
});

test("buildTeacherSessionViewModel detects needs-help students", () => {
  const vm = buildTeacherSessionViewModel({
    session: { id: 1, title: "帮助测试", status: "live", updated_at: "2026-01-01" },
    students: [
      { student_id: 1, display_name: "陷入困境", status: "in_progress", current_stage_index: 0, xp: 0 },
    ],
  });
  assert.equal(vm.needsHelp.length, 1);
});

test("submission response advances the current classroom stage immediately", () => {
  const mission = { stages: [{ id: "one" }, { id: "two" }] };
  const current = {
    active: true,
    stageIndex: 0,
    currentStage: mission.stages[0],
    mission,
  };
  const next = mergeClassroomSubmission(current, {
    status: "in_progress",
    current_stage_index: 1,
    xp: 120,
    stars: 2,
    streak: 1,
  });
  assert.equal(next.stageIndex, 1);
  assert.equal(next.currentStage.id, "two");
  assert.equal(next.xp, 120);
});

test("completed submission clears the current stage", () => {
  const mission = { stages: [{ id: "one" }] };
  const next = mergeClassroomSubmission({ active: true, mission }, {
    status: "completed",
    current_stage_index: 1,
    xp: 100,
    stars: 1,
    streak: 1,
  });
  assert.equal(next.studentStatus, "completed");
  assert.equal(next.currentStage, null);
});
