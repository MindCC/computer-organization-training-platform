import test from "node:test";
import assert from "node:assert/strict";
import { buildCompletionOverview } from "./completionOverview.js";

test("completed label shows x/y counts", () => {
  const view = buildCompletionOverview({ completed: 3, totalChallenges: 10, totalStudyMinutes: 90 });
  assert.equal(view.completedLabel, "3 / 10 关");
});

test("remaining lessons estimated from average per-challenge time, rounded up", () => {
  // 3 关共 90 分钟 → 平均 30 分钟/关；剩 7 关 → 210 分钟 → ceil(210/45)=5
  const view = buildCompletionOverview({ completed: 3, totalChallenges: 10, totalStudyMinutes: 90 });
  assert.equal(view.remainingLessons, 5);
  assert.equal(view.remainingLabel, "约 5 课时");
});

test("no estimate when nothing completed yet", () => {
  const view = buildCompletionOverview({ completed: 0, totalChallenges: 10, totalStudyMinutes: 0 });
  assert.equal(view.remainingLessons, null);
  assert.equal(view.remainingLabel, "暂无估算");
});

test("no estimate when all challenges completed", () => {
  const view = buildCompletionOverview({ completed: 10, totalChallenges: 10, totalStudyMinutes: 300 });
  assert.equal(view.remainingLessons, null);
  assert.equal(view.remainingLabel, "暂无估算");
});

test("no estimate when no study time recorded", () => {
  const view = buildCompletionOverview({ completed: 2, totalChallenges: 10, totalStudyMinutes: 0 });
  assert.equal(view.remainingLessons, null);
});

test("at least 1 lesson when remaining minutes round below 1", () => {
  // 9 关完成，剩 1 关，平均 1 分钟 → 1 分钟/45 课时 → ceil(0.02)=1
  const view = buildCompletionOverview({ completed: 9, totalChallenges: 10, totalStudyMinutes: 9 });
  assert.equal(view.remainingLessons, 1);
});
