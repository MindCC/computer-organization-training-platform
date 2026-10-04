import test from "node:test";
import assert from "node:assert/strict";

import {
  FOCUS_PER_CYCLE,
  cycleDots,
  formatClock,
  localDateKey,
  nextPhase,
  phaseDurationMs,
  phaseLabel,
} from "./pomodoroModel.js";

test("阶段时长：专注 25 分、短休 5 分、长休 15 分", () => {
  assert.equal(phaseDurationMs("focus"), 25 * 60_000);
  assert.equal(phaseDurationMs("shortBreak"), 5 * 60_000);
  assert.equal(phaseDurationMs("longBreak"), 15 * 60_000);
});

test("未知阶段退回专注时长与标签", () => {
  assert.equal(phaseDurationMs("nope"), 25 * 60_000);
  assert.equal(phaseLabel("nope"), "专注");
});

test("专注段结束进入短休息，并累加完成数", () => {
  assert.deepEqual(nextPhase("focus", 0), { phase: "shortBreak", completedFocus: 1 });
  assert.deepEqual(nextPhase("focus", 2), { phase: "shortBreak", completedFocus: 3 });
});

test(`第 ${FOCUS_PER_CYCLE} 个专注段结束进入长休息`, () => {
  assert.deepEqual(nextPhase("focus", 3), { phase: "longBreak", completedFocus: 4 });
  assert.deepEqual(nextPhase("focus", 7), { phase: "longBreak", completedFocus: 8 });
});

test("休息段结束回到专注，且不改变完成数", () => {
  assert.deepEqual(nextPhase("shortBreak", 1), { phase: "focus", completedFocus: 1 });
  assert.deepEqual(nextPhase("longBreak", 4), { phase: "focus", completedFocus: 4 });
});

test("nextPhase 不修改入参", () => {
  const state = { phase: "focus", completedFocus: 3 };
  nextPhase(state.phase, state.completedFocus);
  assert.deepEqual(state, { phase: "focus", completedFocus: 3 });
});

test("formatClock 向上取整并补零", () => {
  assert.equal(formatClock(25 * 60_000), "25:00");
  assert.equal(formatClock(59_001), "01:00");
  assert.equal(formatClock(59_000), "00:59");
  assert.equal(formatClock(1), "00:01");
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(-5_000), "00:00");
});

test("localDateKey 输出本地 YYYY-MM-DD", () => {
  assert.equal(localDateKey(new Date(2026, 9, 4)), "2026-10-04");
  assert.equal(localDateKey(new Date(2026, 0, 9)), "2026-01-09");
});

test("cycleDots 反映本轮四段进度", () => {
  assert.deepEqual(cycleDots(0), ["todo", "todo", "todo", "todo"]);
  assert.deepEqual(cycleDots(1), ["done", "todo", "todo", "todo"]);
  assert.deepEqual(cycleDots(3), ["done", "done", "done", "todo"]);
  // 刚完成第 4 段（长休息中）时，本轮四点应全亮
  assert.deepEqual(cycleDots(4), ["done", "done", "done", "done"]);
  assert.deepEqual(cycleDots(5), ["done", "todo", "todo", "todo"]);
});
