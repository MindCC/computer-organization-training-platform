import test from "node:test";
import assert from "node:assert/strict";
import { adaptHardwareGameSummary } from "./shared/api/teacherOverviewAdapter.js";

test("teacher hardware summary converts bottleneck objects into renderable labels", () => {
  const summary = adaptHardwareGameSummary({
    completedCases: 2,
    averageScore: 84,
    frequentBottlenecks: [
      { type: "存储速度不足", count: 3 },
      { type: "预算超限", count: 1 },
    ],
    typicalBuilds: [{ caseId: "game-office-pc", score: 96, parts: {} }],
  });

  assert.deepEqual(summary.frequentBottlenecks, [
    {
      key: "存储速度不足:3",
      type: "存储速度不足",
      count: 3,
      label: "存储速度不足 · 3 次",
    },
    {
      key: "预算超限:1",
      type: "预算超限",
      count: 1,
      label: "预算超限 · 1 次",
    },
  ]);
});

test("teacher hardware summary rejects malformed values without throwing", () => {
  const summary = adaptHardwareGameSummary({
    completedCases: -4,
    averageScore: 180,
    frequentBottlenecks: [null, {}, { type: "预算超限", count: "2" }],
    typicalBuilds: [null, { caseId: "game-office-pc", score: 90 }, "invalid"],
  });

  assert.equal(summary.completedCases, 0);
  assert.equal(summary.averageScore, 100);
  assert.equal(summary.frequentBottlenecks.length, 1);
  assert.equal(summary.frequentBottlenecks[0].label, "预算超限 · 2 次");
  assert.deepEqual(summary.typicalBuilds, [{ caseId: "game-office-pc", score: 90 }]);
});
