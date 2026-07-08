import test from "node:test";
import assert from "node:assert/strict";

import { buildStudentMarkdownReport } from "./studentReport.js";

test("buildStudentMarkdownReport includes identity, summary, progress and notes", () => {
  const markdown = buildStudentMarkdownReport({
    user: { username: "2026001", displayName: "李同学" },
    summary: { completionRate: 50, averageScore: 84, totalAttempts: 3, weakSpot: "补码转换" },
    progress: {
      "data-flow": {
        status: "completed",
        attempts: 1,
        bestScore: 100,
        timeSpentMinutes: 8,
        errors: [],
        completedAt: "2026-07-08 10:00:00",
      },
      "machine-number": {
        status: "in-progress",
        attempts: 2,
        bestScore: 68,
        timeSpentMinutes: 18,
        errors: ["补码符号位错误"],
      },
    },
    notes: [
      {
        title: "补码复盘",
        content: "负数补码要先看符号位，再按位取反加一。",
        tag: "机器数",
        challengeId: "machine-number",
        createdAt: "2026-07-08 10:10:00",
      },
    ],
    generatedAt: new Date("2026-07-08T02:30:00.000Z"),
  });

  assert.match(markdown, /# 计算机组成原理实验报告/);
  assert.match(markdown, /姓名：李同学/);
  assert.match(markdown, /学号：2026001/);
  assert.match(markdown, /完成率：50%/);
  assert.match(markdown, /数据流/);
  assert.match(markdown, /machine-number/);
  assert.match(markdown, /补码符号位错误/);
  assert.match(markdown, /补码复盘/);
  assert.match(markdown, /负数补码/);
});
