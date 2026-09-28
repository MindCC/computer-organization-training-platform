import { CHALLENGES, LEARNING_ITEMS } from "./platformLogic.js";

/**
 * 章节 ↔ 实验的单一来源。
 *
 * 教材章节顺序与标题放在这里；每个实验属于哪一章写在实验自己的 `chapterId` 上
 * （`platformLogic.js` 的关卡、`hardwareGame.js` 的配置挑战）。
 * 这样章节视图、教师看板和学习路线不会再各写一份映射而互相矛盾。
 */
export const COURSE_CHAPTERS = Object.freeze([
  { id: "ch1", number: 1, title: "第一章 绪论" },
  { id: "ch2", number: 2, title: "第二章 计算机中数的表示" },
  { id: "ch3", number: 3, title: "第三章 运算单元设计" },
  { id: "ch4", number: 4, title: "第四章 存储器系统" },
  { id: "ch5", number: 5, title: "第五章 指令系统" },
  { id: "ch6", number: 6, title: "第六章 CPU的结构与设计" },
  { id: "ch7", number: 7, title: "第七章 系统总线" },
  { id: "ch8", number: 8, title: "第八章 输入输出系统" },
]);

const CHAPTER_IDS = new Set(COURSE_CHAPTERS.map((chapter) => chapter.id));

export function isValidChapterId(chapterId) {
  return CHAPTER_IDS.has(chapterId);
}

/** 单个实验（电路关卡或硬件配置挑战）所属章节，未标注时返回 null。 */
export function chapterIdOf(item) {
  return item?.chapterId ?? null;
}

/**
 * 按章节聚合实验 id。
 * @param {Array} items 默认使用 LEARNING_ITEMS（电路关卡 + 硬件配置挑战）
 * @returns {Map<string, string[]>} chapterId → 实验 id 列表（保持 LEARNING_ITEMS 顺序）
 */
export function buildChapterChallengeIds(items = LEARNING_ITEMS) {
  const grouped = new Map(COURSE_CHAPTERS.map((chapter) => [chapter.id, []]));
  for (const item of items ?? []) {
    const chapterId = chapterIdOf(item);
    if (!chapterId) continue;
    if (!grouped.has(chapterId)) grouped.set(chapterId, []);
    grouped.get(chapterId).push(item.id);
  }
  return grouped;
}

export function getChapterById(chapterId) {
  return COURSE_CHAPTERS.find((chapter) => chapter.id === chapterId) ?? null;
}

/** 某章节下的实验 id 列表；章节不存在时返回空数组。 */
export function getChallengesByChapterId(chapterId) {
  return buildChapterChallengeIds().get(chapterId) ?? [];
}

/** 没有归入任何教材章节的实验 id（用于回归：避免出现"已注册却无处可查"的实验）。 */
export function findUnassignedChallenges(items = LEARNING_ITEMS) {
  return (items ?? []).filter((item) => !isValidChapterId(chapterIdOf(item))).map((item) => item.id);
}

/** 只返回电路关卡（不含硬件配置挑战）的章节归组，供章节视图使用。 */
export function buildCircuitChapterChallengeIds() {
  return buildChapterChallengeIds(CHALLENGES);
}

/**
 * 实验的判分类型：
 * - `graded`：有结构化判定证据，服务端可按同一模型复算，可进入成绩统计；
 * - `participation`：只有完成/参与信号（连线顺序、步骤确认），**不代表掌握度分数**。
 *
 * 历史上「认识计算机五大部件」这类参与型活动会被当作满分测评记录，
 * 所以展示层与成绩统计必须先看这个字段。
 */
export const GRADING_KINDS = Object.freeze(["graded", "participation"]);

export function gradingKindOf(item) {
  return item?.grading === "participation" ? "participation" : "graded";
}

export function isGradedChallenge(item) {
  return gradingKindOf(item) === "graded";
}

export function isParticipationChallenge(item) {
  return gradingKindOf(item) === "participation";
}

/** 按判分类型筛选实验，用于成绩统计与"参与型不冒充测评分数"的回归。 */
export function selectChallengesByGrading(kind, items = LEARNING_ITEMS) {
  return (items ?? []).filter((item) => gradingKindOf(item) === kind);
}

/** 参与型/评分型数量概览，便于在文档与看板里对齐口径。 */
export function summarizeGradingKinds(items = LEARNING_ITEMS) {
  const participation = selectChallengesByGrading("participation", items).map((item) => item.id);
  const graded = selectChallengesByGrading("graded", items).map((item) => item.id);
  return { participation, graded, total: participation.length + graded.length };
}

/**
 * 该实验「有没有掌握度分数」。
 *
 * - 参与型关卡（如「认识计算机五大部件」的引导装配）服务端只会记 `passed: true, score: 0`，
 *   这个 0 是「不计分」而不是「考了 0 分」，所以返回 null；
 * - 评分型关卡没开始时也没有分数可显示，同样返回 null。
 *
 * 展示层必须用它来渲染分数，避免把 0 分当成不及格挂在学生头上。
 */
export function displayScoreOf(item, record) {
  if (isParticipationChallenge(item)) return null;
  const attempts = Number(record?.attempts ?? 0);
  if (attempts <= 0) return null;
  const score = Number(record?.bestScore);
  return Number.isFinite(score) ? score : null;
}

/** 分数文案：参与型 → 「参与型」，未开始 → 「—」，其余 → 「xx 分」。 */
export function scoreLabelOf(item, record) {
  const score = displayScoreOf(item, record);
  if (score !== null) return `${score} 分`;
  return isParticipationChallenge(item) ? "参与型" : "—";
}

/** 参与型关卡的完整说明，用于悬停提示。 */
export const PARTICIPATION_SCORE_NOTE = "参与型探索实验：完成即通过，不计分、不计入平均分";

/**
 * 已完成评分型关卡的平均分。
 * 参与型关卡不进分子，未完成的关卡不进分母——否则「还没做」和「不计分」都会被当成 0 分。
 */
export function averageGradedScore(items = LEARNING_ITEMS, progress = {}) {
  const completed = (items ?? []).filter((item) => isGradedChallenge(item) && progress?.[item.id]?.status === "completed");
  if (completed.length === 0) return 0;
  const total = completed.reduce((sum, item) => sum + Number(progress[item.id]?.bestScore ?? 0), 0);
  return Math.round(total / completed.length);
}
