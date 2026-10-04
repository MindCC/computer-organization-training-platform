/**
 * 课程概念图谱与实验学习证据。概念关系独立于关卡提交顺序；
 * 实验完成仅提供相关记录，不决定知识浏览权限或授予掌握状态。
 */
import { CHALLENGES } from "./platformLogic.js";
import { COURSE_CHAPTERS, displayScoreOf, getChapterById, scoreLabelOf } from "./courseChapters.js";
import { getCoursewareChapter } from "./courseware.js";
import { COURSE_KNOWLEDGE_DATA, LEGACY_KNOWLEDGE_ALIASES } from "./courseKnowledgeData.js";

export { LEGACY_KNOWLEDGE_ALIASES } from "./courseKnowledgeData.js";

const RAW_POINTS = new Map(COURSE_KNOWLEDGE_DATA.map((point) => [point.id, point]));
const EXPERIMENTS = new Map(CHALLENGES.map((challenge) => [challenge.id, challenge]));
const depths = new Map();
function conceptDepth(id, path = new Set()) {
  if (depths.has(id)) return depths.get(id);
  if (path.has(id)) return 0; // validateKnowledgePoints reports cycles.
  const point = RAW_POINTS.get(id);
  if (!point) return 0;
  const nextPath = new Set(path).add(id);
  const depth = point.deps.length ? 1 + Math.max(...point.deps.map((dep) => conceptDepth(dep, nextPath))) : 0;
  depths.set(id, depth);
  return depth;
}

export const KNOWLEDGE_POINTS = Object.freeze(COURSE_KNOWLEDGE_DATA.map((point) => Object.freeze({
  ...point, depth: conceptDepth(point.id),
  aliases: Object.freeze(Object.entries(LEGACY_KNOWLEDGE_ALIASES).filter(([, id]) => id === point.id).map(([alias]) => alias)),
  // Legacy callers may request one entry point; the authoritative mapping is challengeIds.
  challengeId: point.challengeIds[0] ?? null,
})));

const KP_MAP = new Map(KNOWLEDGE_POINTS.map((point) => [point.id, point]));

/** Historical marker creation remains stable for stored question/record references. */
export function kpIdOf(challengeId) { return `kp-${challengeId}`; }

/** Only registered historical markers have a single experiment meaning. */
export function challengeIdOfKp(kpId) {
  return typeof kpId === "string" && Object.hasOwn(LEGACY_KNOWLEDGE_ALIASES, kpId) ? kpId.slice(3) : null;
}

export function knowledgePointOf(kpId) {
  if (typeof kpId !== "string") return null;
  return KP_MAP.get(kpId) ?? KP_MAP.get(LEGACY_KNOWLEDGE_ALIASES[kpId]) ?? null;
}

/** All course concepts involved in an experiment, in course order. */
export function knowledgePointsForChallenge(challengeId) {
  return KNOWLEDGE_POINTS.filter((point) => point.challengeIds.includes(challengeId));
}

/** Historical singular API resolves the explicit principal concept, never a synthetic node. */
export function knowledgePointForChallenge(challengeId) {
  return knowledgePointOf(kpIdOf(challengeId));
}

export function knowledgePointsByChapter(chapterId) {
  return KNOWLEDGE_POINTS.filter((point) => point.chapterId === chapterId);
}

export function prerequisitesOf(kpId) {
  return (knowledgePointOf(kpId)?.deps ?? []).map(knowledgePointOf).filter(Boolean);
}

export function dependentsOf(kpId) {
  const canonicalId = knowledgePointOf(kpId)?.id;
  return canonicalId ? KNOWLEDGE_POINTS.filter((point) => point.deps.includes(canonicalId)) : [];
}

export function knowledgeRelationsOf(kpId) {
  return { prerequisites: prerequisitesOf(kpId), dependents: dependentsOf(kpId) };
}

/** Search concept titles, summaries, tags and exact legacy aliases; all query terms must match. */
export function searchKnowledgePoints(query = "", { chapterId } = {}) {
  const terms = String(query ?? "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return KNOWLEDGE_POINTS.filter((point) => {
    if (chapterId && point.chapterId !== chapterId) return false;
    const text = [point.title, point.summary, ...point.tags, ...point.aliases].join(" ").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

/** Core prose stays owned by the courseware; the concept list comes from this course model. */
export function chapterCorePoints(chapterId) {
  const chapter = getCoursewareChapter(chapterId);
  const meta = getChapterById(chapterId);
  return {
    chapterId, title: meta?.title ?? chapter?.title ?? chapterId,
    keyPoints: chapter?.keyPoints ?? [],
    kpIds: knowledgePointsByChapter(chapterId).map((point) => point.id),
  };
}
export const CHAPTER_CORE_POINTS = Object.freeze(
  Object.fromEntries(COURSE_CHAPTERS.map((chapter) => [chapter.id, chapterCorePoints(chapter.id)])),
);

export const KNOWLEDGE_EVIDENCE_LABELS = Object.freeze({
  evidence: "有实验完成记录",
  practicing: "有实验尝试记录",
  unseen: "暂无实验记录",
  "no-experiment": "暂无对应实验",
});

/**
 * Uses only associated experiment records. Zero-attempt in-progress is an availability
 * flag created by platform progression, so it is not treated as learning evidence.
 * Participation activities have no score; every course concept remains browsable.
 */
export function knowledgeEvidenceOf(kpOrId, progress = {}) {
  const point = knowledgePointOf(typeof kpOrId === "string" ? kpOrId : kpOrId?.id);
  if (!point) return null;
  const experiments = point.challengeIds.map((id) => {
    const challenge = EXPERIMENTS.get(id);
    const record = progress?.[id];
    const attempts = Math.max(0, Number(record?.attempts) || 0);
    const status = record?.status === "completed" ? "evidence" : attempts > 0 ? "practicing" : "unseen";
    return {
      id, challengeId: id, title: challenge?.title ?? id, chapterId: challenge?.chapterId ?? null,
      grading: challenge?.grading === "participation" ? "participation" : "graded",
      status, statusLabel: status === "evidence" ? "已完成实验" : KNOWLEDGE_EVIDENCE_LABELS[status],
      attempts, score: displayScoreOf(challenge, record), scoreLabel: scoreLabelOf(challenge, record),
      canEnter: true,
    };
  });
  const completedCount = experiments.filter((experiment) => experiment.status === "evidence").length;
  const startedCount = experiments.filter((experiment) => experiment.status !== "unseen").length;
  const totalExperiments = experiments.length;
  const status = !totalExperiments ? "no-experiment" : completedCount ? "evidence" : startedCount ? "practicing" : "unseen";
  const descriptions = {
    evidence: "已记录相关实验完成情况；实验覆盖范围有限，可结合课件与习题继续学习。",
    practicing: "记录了相关实验尝试；以下记录作为本概念的学习证据，可继续练习。",
    unseen: "关联实验尚无提交记录，可浏览概念并自由练习。",
    "no-experiment": "课程概念可直接浏览；当前实验尚未覆盖，可结合课件与习题学习。",
  };
  return {
    status, label: status === "evidence" ? `实验完成记录 ${completedCount}/${totalExperiments}` : KNOWLEDGE_EVIDENCE_LABELS[status],
    description: descriptions[status], challengeIds: point.challengeIds, experiments,
    completedCount, startedCount, totalExperiments,
    completedChallengeIds: experiments.filter((experiment) => experiment.status === "evidence").map((experiment) => experiment.id),
    canBrowse: true,
  };
}

/** Backwards-compatible status accessor now describes evidence and never returns locked. */
export function kpStatusOf(kp, progress = {}) {
  return knowledgeEvidenceOf(kp, progress)?.status ?? "unseen";
}

/**
 * Pure concept layout. Actual occupied depth layers run from foundation to advanced.
 * The UI uses centered 176×76 cards; 210×110 center spacing leaves room for edges.
 * Requested dimensions are minimum viewport sizes: crowded graphs expand the canvas.
 */
export function layoutKnowledgeGraph({ width = 1040, height = 720, chapterId, query = "" } = {}) {
  width = Number.isFinite(width) && width > 0 ? width : 1040;
  height = Number.isFinite(height) && height > 0 ? height : 720;
  const points = searchKnowledgePoints(query, { chapterId });
  const layersByDepth = new Map();
  for (const point of points) {
    if (!layersByDepth.has(point.depth)) layersByDepth.set(point.depth, []);
    layersByDepth.get(point.depth).push(point);
  }
  const layers = [...layersByDepth].sort(([left], [right]) => left - right);
  const maxDepth = Math.max(1, ...points.map((point) => point.depth));
  const columnSpacing = 210, rowSpacing = 110;
  const horizontalInset = 176 / 2 + 44, verticalInset = 76 / 2 + 32;
  if (layers.length > 0) {
    const widestLayer = Math.max(...layers.map(([, members]) => members.length));
    width = Math.max(width, horizontalInset * 2 + (widestLayer - 1) * columnSpacing);
    height = Math.max(height, verticalInset * 2 + (layers.length - 1) * rowSpacing);
  }
  const nodes = [];
  layers.forEach(([depth, members], layerIndex) => {
    const y = height / 2 + (layerIndex - (layers.length - 1) / 2) * rowSpacing;
    members.forEach((point, index) => nodes.push({
      id: point.id, chapterId: point.chapterId, challengeIds: point.challengeIds,
      challengeId: point.challengeId, depth, layerIndex,
      x: width / 2 + (index - (members.length - 1) / 2) * columnSpacing, y,
    }));
  });
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const edges = points.flatMap((point) => point.deps.filter((dep) => positions.has(dep)).map((dep) => ({
    from: dep, to: point.id, kind: "prerequisite",
    x1: positions.get(dep).x, y1: positions.get(dep).y,
    x2: positions.get(point.id).x, y2: positions.get(point.id).y,
  })));
  return { width, height, maxDepth, nodes, edges };
}

/** Validates authored concepts, teaching dependencies, experiment mappings and historical aliases. */
export function validateKnowledgePoints() {
  const errors = [], ids = new Set(), validChapters = new Set(COURSE_CHAPTERS.map((chapter) => chapter.id));
  for (const point of KNOWLEDGE_POINTS) {
    if (ids.has(point.id)) errors.push(`${point.id} 重复`);
    ids.add(point.id);
    if (!point.title || !point.summary) errors.push(`${point.id} 缺少标题或摘要`);
    if (!validChapters.has(point.chapterId)) errors.push(`${point.id} 章节非法 ${point.chapterId}`);
    if (new Set(point.deps).size !== point.deps.length) errors.push(`${point.id} 前置关系重复`);
    if (new Set(point.challengeIds).size !== point.challengeIds.length) errors.push(`${point.id} 实验映射重复`);
    for (const dep of point.deps) if (!KP_MAP.has(dep)) errors.push(`${point.id} 前置概念不存在 ${dep}`);
    for (const id of point.challengeIds) if (!EXPERIMENTS.has(id)) errors.push(`${point.id} 实验不存在 ${id}`);
  }
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`教学依赖存在环 ${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of KP_MAP.get(id)?.deps ?? []) visit(dep);
    visiting.delete(id); visited.add(id);
  }
  for (const point of KNOWLEDGE_POINTS) visit(point.id);
  for (const [alias, id] of Object.entries(LEGACY_KNOWLEDGE_ALIASES)) {
    const point = KP_MAP.get(id), challengeId = alias.slice(3);
    if (!alias.startsWith("kp-") || !EXPERIMENTS.has(challengeId)) errors.push(`旧标记无效 ${alias}`);
    if (!point?.challengeIds.includes(challengeId)) errors.push(`旧标记映射不一致 ${alias} → ${id}`);
  }
  return errors;
}
