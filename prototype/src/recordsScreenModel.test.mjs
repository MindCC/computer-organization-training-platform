import test from "node:test";
import assert from "node:assert/strict";

import { CHALLENGES, LEARNING_ITEMS } from "./platformLogic.js";
import { COURSE_CHAPTERS } from "./courseChapters.js";
import {
  buildChapterScoreSeries,
  buildLearningTreeModel,
  buildScreenKpis,
  buildStatusDistribution,
} from "./recordsScreenModel.js";

function fakeProgress(entries = {}) {
  return entries;
}

test("学习树按八章生长，树杈总数等于全部学习条目", () => {
  const model = buildLearningTreeModel(fakeProgress());

  assert.equal(model.chapters.length, COURSE_CHAPTERS.length);
  assert.equal(model.chapters.reduce((sum, chapter) => sum + chapter.items.length, 0), LEARNING_ITEMS.length);
  assert.equal(model.totals.total, LEARNING_ITEMS.length);
  assert.equal(model.root.total, LEARNING_ITEMS.length);
  // 每个章节都有树枝可长（八章每章至少一个实验的口径与 courseChapters 测试一致）
  assert.equal(model.chapters.every((chapter) => chapter.items.length > 0), true);
});

test("完成的实验点亮树杈，进行中的单独计数", () => {
  const model = buildLearningTreeModel(fakeProgress({
    "computer-components": { status: "completed", bestScore: 100 },
    "and-gate": { status: "completed", bestScore: 90 },
    "or-gate": { status: "in-progress", bestScore: 40 },
  }));

  assert.equal(model.totals.lit, 2);
  assert.equal(model.totals.inProgress, 1);
  assert.equal(model.totals.pending, LEARNING_ITEMS.length - 3);

  const ch1 = model.chapters.find((chapter) => chapter.id === "ch1");
  assert.equal(ch1.litCount, 1);
  const ch3 = model.chapters.find((chapter) => chapter.id === "ch3");
  assert.equal(ch3.litCount, 1);
  const andGate = ch3.items.find((leaf) => leaf.id === "and-gate");
  assert.equal(andGate.lit, true);
  assert.equal(andGate.bestScore, 90);
});

test("完成分布按已完成/进行中/未点亮分桶且总量守恒", () => {
  const distribution = buildStatusDistribution(fakeProgress({
    "and-gate": { status: "completed" },
    "or-gate": { status: "in-progress" },
  }));
  const total = distribution.reduce((sum, entry) => sum + entry.count, 0);

  assert.equal(total, LEARNING_ITEMS.length);
  assert.equal(distribution.find((entry) => entry.key === "completed").count, 1);
  assert.equal(distribution.find((entry) => entry.key === "in-progress").count, 1);
  assert.equal(distribution.find((entry) => entry.key === "pending").count, LEARNING_ITEMS.length - 2);
});

test("章节折线序列给出平均分、完成率与章号顺序", () => {
  const series = buildChapterScoreSeries(fakeProgress({
    "and-gate": { status: "completed", bestScore: 80 },
    "or-gate": { status: "completed", bestScore: 100 },
  }));

  assert.equal(series.length, COURSE_CHAPTERS.length);
  assert.deepEqual(series.map((entry) => entry.number), [1, 2, 3, 4, 5, 6, 7, 8]);

  const ch3Items = LEARNING_ITEMS.filter((item) => item.chapterId === "ch3");
  const ch3 = series.find((entry) => entry.chapterId === "ch3");
  assert.equal(ch3.avgScore, Math.round((80 + 100) / ch3Items.length));
  assert.equal(ch3.completionRate, Math.round((2 / ch3Items.length) * 100));
  assert.equal(ch3.lit, 2);
  assert.equal(ch3.total, ch3Items.length);
});

test("大屏 KPI 与树杈点亮口径一致", () => {
  const kpis = buildScreenKpis(
    { completionRate: 33, averageScore: 88, totalStudyMinutes: 95, totalAttempts: 7, weakSpot: "进位路径缺失" },
    fakeProgress({ "and-gate": { status: "completed" }, "or-gate": { status: "in-progress" } }),
  );

  assert.equal(kpis.lit, 1);
  assert.equal(kpis.inProgress, 1);
  assert.equal(kpis.total, LEARNING_ITEMS.length);
  assert.equal(kpis.completionRate, 33);
  assert.equal(kpis.weakSpot, "进位路径缺失");
});
