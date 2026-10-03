/**
 * 知识点模型 —— 课后作业「按章练习」与知识星图共用。
 *
 * 粒度：一个课程关卡 = 一个知识点，知识点的依赖关系直接镜像
 * `challengeDependencies.js` 的 CHALLENGE_DEPS，保证星图与关卡解锁链完全一致：
 *   - id = `kp-<challengeId>`，deps 为前置知识点的 kp id；
 *   - depth = dependencyDepth(challengeId)，0 层是最底层基础，层越高越进阶；
 *   - 每个知识点带 chapterId（8 个教材章节）与摘要（复用关卡的 objective/principle）。
 * 每章的「核心知识点」文字复用 courseware 的 keyPoints（单一来源，不另抄一份）。
 */

import { CHALLENGES } from "./platformLogic.js";
import { CHALLENGE_DEPS, dependenciesOf, dependencyDepth, isUnlocked } from "./challengeDependencies.js";
import { COURSE_CHAPTERS, getChapterById } from "./courseChapters.js";
import { getCoursewareChapter } from "./courseware.js";

export function kpIdOf(challengeId) {
  return `kp-${challengeId}`;
}

export function challengeIdOfKp(kpId) {
  return typeof kpId === "string" && kpId.startsWith("kp-") ? kpId.slice(3) : null;
}

function buildKnowledgePoints() {
  return CHALLENGES.map((challenge) => ({
    id: kpIdOf(challenge.id),
    chapterId: challenge.chapterId,
    title: challenge.title,
    shortTitle: challenge.shortTitle ?? challenge.title,
    summary: [challenge.objective, challenge.principle].filter(Boolean).join(" "),
    challengeId: challenge.id,
    depth: dependencyDepth(challenge.id),
    deps: dependenciesOf(challenge.id).map(kpIdOf),
    graded: challenge.grading !== "participation",
  }));
}

export const KNOWLEDGE_POINTS = Object.freeze(buildKnowledgePoints());

const KP_MAP = new Map(KNOWLEDGE_POINTS.map((kp) => [kp.id, kp]));
const KP_BY_CHALLENGE = new Map(KNOWLEDGE_POINTS.map((kp) => [kp.challengeId, kp]));

export function knowledgePointOf(kpId) {
  return KP_MAP.get(kpId) ?? null;
}

export function knowledgePointForChallenge(challengeId) {
  return KP_BY_CHALLENGE.get(challengeId) ?? null;
}

/** 某章下的全部知识点（保持 CHALLENGES 的章节顺序）。 */
export function knowledgePointsByChapter(chapterId) {
  return KNOWLEDGE_POINTS.filter((kp) => kp.chapterId === chapterId);
}

/** 前置知识点（依赖的上游）。 */
export function prerequisitesOf(kpId) {
  const kp = knowledgePointOf(kpId);
  if (!kp) return [];
  return kp.deps.map((dep) => knowledgePointOf(dep)).filter(Boolean);
}

/** 后续知识点（依赖本知识点的下游，由全表反查得到）。 */
export function dependentsOf(kpId) {
  return KNOWLEDGE_POINTS.filter((kp) => kp.deps.includes(kpId));
}

/**
 * 每章的「核心知识点」文字：直接取自 courseware 的 keyPoints，
 * 附带章节标题与该章知识点 id 列表，供练习页章节侧栏展示。
 */
export function chapterCorePoints(chapterId) {
  const chapter = getCoursewareChapter(chapterId);
  const meta = getChapterById(chapterId);
  return {
    chapterId,
    title: meta?.title ?? chapter?.title ?? chapterId,
    keyPoints: chapter?.keyPoints ?? [],
    kpIds: knowledgePointsByChapter(chapterId).map((kp) => kp.id),
  };
}

export const CHAPTER_CORE_POINTS = Object.freeze(
  Object.fromEntries(COURSE_CHAPTERS.map((chapter) => [chapter.id, chapterCorePoints(chapter.id)])),
);

/**
 * 知识点掌握状态（用于星图着色）：
 * - completed：关卡已完成（亮）；
 * - in-progress：关卡进行中（闪烁）；
 * - available：依赖已全部完成、可以开始（常亮蓝）；
 * - locked：前置未完成（暗）。
 */
export function kpStatusOf(kp, progress = {}) {
  if (!kp) return "locked";
  const record = progress?.[kp.challengeId];
  if (record?.status === "completed") return "completed";
  if (record?.status === "in-progress") return "in-progress";
  return isUnlocked(kp.challengeId, progress) ? "available" : "locked";
}

/**
 * 知识星图布局（纯函数，可单测）：
 * 按 depth 分层，0 层在底部（基础），最高层在顶部（进阶）；
 * 同层节点水平居中排开，并做轻微的上下错位，避免连线完全水平重叠。
 */
export function layoutKnowledgeGraph({ width = 1040, height = 720 } = {}) {
  const marginX = 90;
  const marginY = 64;
  const layers = new Map();
  for (const kp of KNOWLEDGE_POINTS) {
    if (!layers.has(kp.depth)) layers.set(kp.depth, []);
    layers.get(kp.depth).push(kp);
  }
  const maxDepth = Math.max(...KNOWLEDGE_POINTS.map((kp) => kp.depth), 1);
  const usableHeight = height - marginY * 2;
  const nodes = [];
  for (const [depth, kps] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
    const baseY = height - marginY - (depth / maxDepth) * usableHeight;
    const spread = Math.min(200, (width - marginX * 2) / Math.max(kps.length, 1));
    kps.forEach((kp, index) => {
      const x = width / 2 + (index - (kps.length - 1) / 2) * spread;
      const jitter = kps.length > 1 ? (index % 2 === 0 ? -12 : 12) : 0;
      nodes.push({ id: kp.id, challengeId: kp.challengeId, depth, x, y: baseY + jitter });
    });
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = [];
  for (const kp of KNOWLEDGE_POINTS) {
    for (const dep of kp.deps) {
      const from = nodeMap.get(dep);
      const to = nodeMap.get(kp.id);
      if (from && to) edges.push({ from: dep, to: kp.id, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    }
  }
  return { width, height, maxDepth, nodes, edges };
}

/** 防御性自检：知识点依赖必须与 CHALLENGE_DEPS 一一对应（单测会断言，这里供调用方排错）。 */
export function validateKnowledgePoints() {
  const errors = [];
  for (const kp of KNOWLEDGE_POINTS) {
    const expected = (CHALLENGE_DEPS[kp.challengeId] ?? []).map(kpIdOf);
    if (JSON.stringify(kp.deps) !== JSON.stringify(expected)) {
      errors.push(`${kp.id} deps ${JSON.stringify(kp.deps)} !== ${JSON.stringify(expected)}`);
    }
  }
  return errors;
}
