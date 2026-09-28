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

test("章节折线序列给出已完成实验平均分、完成率与章号顺序", () => {
  const series = buildChapterScoreSeries(fakeProgress({
    "and-gate": { status: "completed", bestScore: 80 },
    "or-gate": { status: "completed", bestScore: 100 },
  }));

  assert.equal(series.length, COURSE_CHAPTERS.length);
  assert.deepEqual(series.map((entry) => entry.number), [1, 2, 3, 4, 5, 6, 7, 8]);

  const ch3Items = LEARNING_ITEMS.filter((item) => item.chapterId === "ch3");
  const ch3 = series.find((entry) => entry.chapterId === "ch3");
  // 平均分只统计"已完成且计分"的实验：未开始的实验不进分母，否则均分会被未完成拉低。
  assert.equal(ch3.avgScore, 90);
  assert.equal(ch3.scoredCount, 2);
  assert.equal(ch3.completionRate, Math.round((2 / ch3Items.length) * 100));
  assert.equal(ch3.lit, 2);
  assert.equal(ch3.total, ch3Items.length);
});

test("参与型关卡不计分，不会以 0 分拉低章节平均分", () => {
  const base = fakeProgress({
    "and-gate": { status: "completed", bestScore: 90 },
    "or-gate": { status: "completed", bestScore: 90 },
  });
  const withParticipation = fakeProgress({
    ...base,
    // data-flow 是第三章的参与型探索关卡：服务端只记 passed + score 0
    "data-flow": { status: "completed", bestScore: 0, attempts: 1 },
  });

  const before = buildChapterScoreSeries(base).find((entry) => entry.chapterId === "ch3");
  const after = buildChapterScoreSeries(withParticipation).find((entry) => entry.chapterId === "ch3");

  assert.equal(after.avgScore, before.avgScore, "参与型关卡的 0 分不能进入平均分");
  assert.equal(after.avgScore, 90);
  assert.equal(after.scoredCount, 2);
  assert.equal(after.lit, 3, "完成数照常计入完成率");
  assert.equal(after.completionRate > before.completionRate, true);
});

test("树杈分数按判分类型给文案：参与型不显示 0 分", () => {
  const model = buildLearningTreeModel(fakeProgress({
    "computer-components": { status: "completed", bestScore: 0, attempts: 1 },
    "and-gate": { status: "completed", bestScore: 90, attempts: 2 },
    "or-gate": { status: "in-progress" },
  }));

  const ch1 = model.chapters.find((chapter) => chapter.id === "ch1");
  const overview = ch1.items.find((leaf) => leaf.id === "computer-components");
  assert.equal(overview.scoreLabel, "参与型");
  assert.equal(overview.participation, true);
  assert.equal(overview.scored, false);

  const ch3 = model.chapters.find((chapter) => chapter.id === "ch3");
  assert.equal(ch3.items.find((leaf) => leaf.id === "and-gate").scoreLabel, "90 分");
  assert.equal(ch3.items.find((leaf) => leaf.id === "or-gate").scoreLabel, "—", "进行中但尚未提交过的关卡不显示 0 分");
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
