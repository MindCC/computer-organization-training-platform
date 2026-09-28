import { LEARNING_ITEMS } from "./platformLogic.js";
import { COURSE_CHAPTERS, buildChapterChallengeIds, displayScoreOf, isParticipationChallenge, scoreLabelOf } from "./courseChapters.js";

/**
 * 课程路线的单一分组方式：严格按教材八章划分。
 *
 * 章节清单与顺序来自 courseChapters.js 的 COURSE_CHAPTERS；
 * 每章包含哪些实验由实验自身的 chapterId 派生（buildChapterChallengeIds），
 * 不再维护一份与章节映射可能互相矛盾的手工分组。
 */
const CHAPTER_ROUTE_DESCRIPTIONS = {
  ch1: "建立整机概念：五大部件、程序运行流程与整机配置入门。",
  ch2: "理解计算机中数的表示：符号位、原码、反码与补码。",
  ch3: "从数据流与基础逻辑门出发，逐级搭建加法器与 ALU。",
  ch4: "观察地址与数据两条访存路径，理解主存读写与存储配置。",
  ch5: "区分指令与数据，理解 CPU 如何按阶段解释内存内容。",
  ch6: "贯通取指、译码、执行与写回，看清 CPU 内部数据通路。",
  ch7: "分清地址总线、数据总线与控制总线的分工与协作。",
  ch8: "理解外设经 I/O 接口与 CPU、主存之间的数据传送过程。",
};

const challengeIdsByChapter = buildChapterChallengeIds(LEARNING_ITEMS);

export const COURSE_ROUTE_GROUPS = COURSE_CHAPTERS.map((chapter) => ({
  id: chapter.id,
  number: chapter.number,
  title: chapter.title,
  shortTitle: chapter.title.replace(/^第.+章\s*/, ""),
  description: CHAPTER_ROUTE_DESCRIPTIONS[chapter.id] ?? "",
  challengeIds: [...(challengeIdsByChapter.get(chapter.id) ?? [])],
}));

const LEARNING_ITEM_MAP = new Map(LEARNING_ITEMS.map((item) => [item.id, item]));

export function buildCourseRouteGroups(challenges = [], progress = {}) {
  const challengeMap = new Map((challenges ?? []).map((challenge) => [challenge.id, challenge]));

  return COURSE_ROUTE_GROUPS.map((group) => ({
    id: group.id,
    number: group.number,
    title: group.title,
    shortTitle: group.shortTitle,
    description: group.description,
    items: group.challengeIds.map((id, sequence) => (
      buildRouteItem(id, challengeMap.get(id), progress[id], group.description, sequence)
    )),
  }));
}

export function formatEstimatedMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "待评估";
  return `${Math.round(minutes)} 分钟`;
}
export function findNextRecommendedChallenge(challenges = [], progress = {}) {
  const challengeMap = new Map((challenges ?? []).map((challenge) => [challenge.id, challenge]));
  const orderedIds = COURSE_ROUTE_GROUPS.flatMap((group) => group.challengeIds);

  for (const id of orderedIds) {
    if ((progress[id]?.status ?? "not-started") === "in-progress") {
      return buildRecommendation(id, challengeMap.get(id) ?? LEARNING_ITEM_MAP.get(id));
    }
  }

  for (const id of orderedIds) {
    if ((progress[id]?.status ?? "not-started") !== "completed") {
      return buildRecommendation(id, challengeMap.get(id) ?? LEARNING_ITEM_MAP.get(id));
    }
  }

  return null;
}

function buildRouteItem(id, challenge, record = {}, fallbackDescription, sequence) {
  const fallback = LEARNING_ITEM_MAP.get(id) ?? {};
  const item = challenge ?? fallback;
  const status = record.status ?? "not-started";
  const estimatedMinutes = challenge?.estimatedMinutes ?? fallback.estimatedMinutes ?? 8;
  // 参与型关卡（引导探索）没有掌握度分数，未开始的关卡也还没有成绩：
  // 两者都不能显示成「0 分」，否则学生看到的是「通过却是 0 分」。
  const scoreLabel = scoreLabelOf(item, record);

  return {
    id,
    title: challenge?.title ?? fallback.title ?? id,
    description: challenge?.objective ?? fallbackDescription ?? fallback.shortTitle ?? "",
    status,
    statusLabel: routeStatusLabel(status),
    bestScore: record.bestScore ?? 0,
    scoreLabel: scoreLabel === "—" ? "未测评" : scoreLabel,
    scored: displayScoreOf(item, record) !== null,
    participation: isParticipationChallenge(item),
    attempts: record.attempts ?? 0,
    estimatedMinutes,
    estimatedLabel: formatEstimatedMinutes(estimatedMinutes),
    sequence,
  };
}

function routeStatusLabel(status) {
  return {
    completed: "已完成",
    "in-progress": "进行中",
    locked: "未解锁",
    "not-started": "未开始",
    unlocked: "未开始",
  }[status] ?? "未开始";
}

function buildRecommendation(id, challenge = {}) {
  return {
    id,
    title: challenge.title ?? "未命名任务",
    description: challenge.objective ?? challenge.shortTitle ?? "",
    principle:
      challenge.principle
      ?? challenge.objective
      ?? "完成任务后查看原理复盘。",
    estimatedMinutes: Number(challenge.estimatedMinutes) > 0
      ? Number(challenge.estimatedMinutes)
      : null,
  };
}
