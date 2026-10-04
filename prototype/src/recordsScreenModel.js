import { COURSE_CHAPTERS, chapterIdOf, displayScoreOf, isGradedChallenge, scoreLabelOf } from "./courseChapters.js";
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
          scoreLabel: scoreLabelOf(item, record),
          scored: displayScoreOf(item, record) !== null,
          participation: !isGradedChallenge(item),
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

/** 各章学习曲线（折线图）：已完成实验的平均得分与完成率，按章号排序。 */
export function buildChapterScoreSeries(progress = {}, items = LEARNING_ITEMS, chapters = COURSE_CHAPTERS) {
  return (chapters ?? []).map((chapter) => {
    const chapterItems = (items ?? []).filter((item) => chapterIdOf(item) === chapter.id);
    const records = chapterItems.map((item) => progress?.[item.id] ?? {});
    const lit = records.filter((record) => statusOf(record) === "completed").length;
    const total = chapterItems.length;
    // 平均分只看「已完成且计分」的实验：参与型关卡不计分，未开始的也没有成绩，
    // 把它们算成 0 分会让折线图变成「做得越多、均分越低」的误导图。
    const scored = chapterItems
      .filter((item) => isGradedChallenge(item) && statusOf(progress?.[item.id]) === "completed")
      .map((item) => Number(progress?.[item.id]?.bestScore ?? 0));
    const avgScore = scored.length > 0 ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length) : 0;
    const studyMinutes = records.reduce((sum, record) => sum + Number(record.timeSpentMinutes ?? 0), 0);
    return {
      chapterId: chapter.id,
      number: chapter.number,
      label: `第${chapter.number}章`,
      shortTitle: shortChapterTitle(chapter.title),
      avgScore,
      scoredCount: scored.length,
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

/**
 * 学习日历模型：把 /api/student/activity 的按天聚合数据整理成月历可直接渲染的结构。
 * 每天一枚「贴纸」：milestone（当天点亮整章）> complete（通过实验）> practice（尝试未通过）> demo（课堂演示）。
 */
export function buildCalendarModel(activity = {}, items = LEARNING_ITEMS, chapters = COURSE_CHAPTERS) {
  const rows = Array.isArray(activity.challenges) ? activity.challenges : [];
  const demos = Array.isArray(activity.demos) ? activity.demos : [];

  const itemById = new Map((items ?? []).map((item) => [item.id, item]));
  const chapterTotals = new Map();
  for (const item of items ?? []) {
    const chapterId = chapterIdOf(item);
    chapterTotals.set(chapterId, (chapterTotals.get(chapterId) ?? 0) + 1);
  }

  const days = new Map();
  const touch = (day) => {
    const key = String(day);
    if (!days.has(key)) {
      days.set(key, { day: key, passedIds: new Set(), entries: [], attempts: 0, minutes: 0, demoBatches: 0, milestones: [], kind: "idle" });
    }
    return days.get(key);
  };

  for (const row of rows) {
    const entry = touch(row.day);
    entry.attempts += Number(row.attempts ?? 0);
    entry.minutes += Number(row.minutes ?? 0);
    const passed = Number(row.passed) === 1;
    entry.entries.push({
      challengeId: row.challengeId,
      attempts: Number(row.attempts ?? 0),
      minutes: Number(row.minutes ?? 0),
      passed,
    });
    if (passed) entry.passedIds.add(row.challengeId);
  }
  for (const row of demos) {
    const entry = touch(row.day);
    entry.demoBatches += Number(row.attempts ?? 0);
    entry.minutes += Number(row.minutes ?? 0);
  }

  // 按时间顺序累计每章通过数，识别「今天点亮了整章」
  const passedPerChapter = new Map();
  const milestoneDone = new Set();
  const orderedDays = [...days.keys()].sort();
  for (const day of orderedDays) {
    const entry = days.get(day);
    for (const challengeId of entry.passedIds) {
      const item = itemById.get(challengeId);
      if (!item) continue;
      const chapterId = chapterIdOf(item);
      if (!passedPerChapter.has(chapterId)) passedPerChapter.set(chapterId, new Set());
      passedPerChapter.get(chapterId).add(challengeId);
    }
    for (const [chapterId, passed] of passedPerChapter) {
      const total = chapterTotals.get(chapterId) ?? 0;
      if (total > 0 && passed.size >= total && !milestoneDone.has(chapterId)) {
        milestoneDone.add(chapterId);
        entry.milestones.push(chapterId);
      }
    }
  }

  // 贴纸类型
  for (const entry of days.values()) {
    if (entry.milestones.length > 0) entry.kind = "milestone";
    else if (entry.passedIds.size > 0) entry.kind = "complete";
    else if (entry.attempts > 0) entry.kind = "practice";
    else if (entry.demoBatches > 0) entry.kind = "demo";
  }

  // 连续学习天数：从最后一个有活动的日子往前数连续自然日
  const dayNumber = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000);
  };
  let streak = 0;
  if (orderedDays.length > 0) {
    streak = 1;
    for (let i = orderedDays.length - 1; i > 0; i--) {
      if (dayNumber(orderedDays[i]) - dayNumber(orderedDays[i - 1]) === 1) streak += 1;
      else break;
    }
  }

  const passedAcrossDays = new Set();
  for (const entry of days.values()) for (const id of entry.passedIds) passedAcrossDays.add(id);

  return {
    days,
    orderedDays,
    totals: {
      activeDays: orderedDays.length,
      lit: passedAcrossDays.size,
      attempts: [...days.values()].reduce((sum, entry) => sum + entry.attempts, 0),
      minutes: [...days.values()].reduce((sum, entry) => sum + entry.minutes, 0),
      milestones: [...days.values()].reduce((sum, entry) => sum + entry.milestones.length, 0),
      streak,
      firstDay: orderedDays[0] ?? null,
      lastDay: orderedDays[orderedDays.length - 1] ?? null,
    },
    chapterTitles: new Map((chapters ?? []).map((chapter) => [chapter.id, chapter.title])),
  };
}
