import { COURSE_CHAPTERS, chapterIdOf } from "./courseChapters.js";
import { LEARNING_ITEMS } from "./platformLogic.js";

/**
 * 学习记录「蓝色大屏」的纯视图模型：
 * - 学习树：树干 → 八个章节树枝 → 每个实验一个树杈，完成即点亮；
 * - 统计图：完成分布（饼图）、各章平均分/完成率（折线）、各章点亮进度（柱状）。
 * 全部函数无副作用，方便单测与服务端复算口径对齐。
 */

function statusOf(record) {
  return record?.status ?? "not-started";
}

function shortChapterTitle(title) {
  return String(title ?? "").replace(/^第.+章\s*/, "");
}

/** 学习树结构模型：root → chapters[] → items[]（lit = 已完成点亮）。 */
export function buildLearningTreeModel(progress = {}, items = LEARNING_ITEMS, chapters = COURSE_CHAPTERS) {
  const chapterModels = chapters.map((chapter) => {
    const leaves = (items ?? [])
      .filter((item) => chapterIdOf(item) === chapter.id)
      .map((item) => {
        const record = progress?.[item.id] ?? {};
        const status = statusOf(record);
        return {
          id: item.id,
          title: item.title ?? item.id,
          estimatedMinutes: item.estimatedMinutes ?? null,
          status,
          bestScore: Number(record.bestScore ?? 0),
          lit: status === "completed",
        };
      });
    const litCount = leaves.filter((leaf) => leaf.lit).length;
    return {
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      shortTitle: shortChapterTitle(chapter.title),
      items: leaves,
      litCount,
      total: leaves.length,
      allLit: leaves.length > 0 && litCount === leaves.length,
    };
  });

  const allLeaves = chapterModels.flatMap((chapter) => chapter.items);
  return {
    root: {
      id: "root",
      label: "组成原理学习树",
      lit: allLeaves.filter((leaf) => leaf.lit).length,
      total: allLeaves.length,
    },
    chapters: chapterModels,
    totals: {
      lit: allLeaves.filter((leaf) => leaf.lit).length,
      inProgress: allLeaves.filter((leaf) => leaf.status === "in-progress").length,
      pending: allLeaves.filter((leaf) => leaf.status !== "completed" && leaf.status !== "in-progress").length,
      total: allLeaves.length,
    },
  };
}

/** 完成状态分布（饼图）：已完成 / 进行中 / 未开始。 */
export function buildStatusDistribution(progress = {}, items = LEARNING_ITEMS) {
  const counts = { completed: 0, "in-progress": 0, pending: 0 };
  for (const item of items ?? []) {
    const status = statusOf(progress?.[item.id]);
    if (status === "completed") counts.completed += 1;
    else if (status === "in-progress") counts["in-progress"] += 1;
    else counts.pending += 1;
  }
  return [
    { key: "completed", label: "已完成", count: counts.completed },
    { key: "in-progress", label: "进行中", count: counts["in-progress"] },
    { key: "pending", label: "未点亮", count: counts.pending },
  ];
}

/** 各章学习曲线（折线图）：平均得分与完成率，按章号排序。 */
export function buildChapterScoreSeries(progress = {}, items = LEARNING_ITEMS, chapters = COURSE_CHAPTERS) {
  return (chapters ?? []).map((chapter) => {
    const chapterItems = (items ?? []).filter((item) => chapterIdOf(item) === chapter.id);
    const records = chapterItems.map((item) => progress?.[item.id] ?? {});
    const lit = records.filter((record) => statusOf(record) === "completed").length;
    const total = chapterItems.length;
    const avgScore = total > 0
      ? Math.round(records.reduce((sum, record) => sum + Number(record.bestScore ?? 0), 0) / total)
      : 0;
    const studyMinutes = records.reduce((sum, record) => sum + Number(record.timeSpentMinutes ?? 0), 0);
    return {
      chapterId: chapter.id,
      number: chapter.number,
      label: `第${chapter.number}章`,
      shortTitle: shortChapterTitle(chapter.title),
      avgScore,
      completionRate: total > 0 ? Math.round((lit / total) * 100) : 0,
      studyMinutes,
      lit,
      total,
    };
  });
}

/** 大屏顶部 KPI：与树杈点亮口径一致。 */
export function buildScreenKpis(summary = {}, progress = {}, items = LEARNING_ITEMS) {
  const totals = buildStatusDistribution(progress, items).reduce(
    (acc, entry) => ({ ...acc, [entry.key]: entry.count }),
    { completed: 0, "in-progress": 0, pending: 0 },
  );
  return {
    completionRate: Number(summary.completionRate ?? 0),
    averageScore: Number(summary.averageScore ?? 0),
    totalStudyMinutes: Number(summary.totalStudyMinutes ?? 0),
    totalAttempts: Number(summary.totalAttempts ?? 0),
    lit: totals.completed,
    inProgress: totals["in-progress"],
    total: totals.completed + totals["in-progress"] + totals.pending,
    weakSpot: summary.weakSpot ?? "暂无高频错误",
  };
}
