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
 * 概念卡片尺寸与文字排版。
 *
 * 卡片是固定宽高的居中矩形；文字按“每行最多 8 个汉字宽”折行，最多 2 行。
 * 20px 字号下一个汉字实际约 18px 宽，所以 8 字（144px）刚好落在 28px 内边距里，
 * 不会再出现文字压到卡片边框或挤出卡片的情况。
 */
export const NODE_FONT_SIZE = 20;
export const NODE_LINE_HEIGHT = 27;
export const NODE_LABEL_MAX_LINES = 2;
export const NODE_BOX = Object.freeze({ width: 220, height: 80, radius: 14, paddingX: 24 });
export const NODE_LABEL_MAX_PIXELS = NODE_BOX.width - NODE_BOX.paddingX * 2;

/**
 * 单字素估算宽度（px），用于折行。
 * 实测：font-size 20px 时一个汉字正好 20px 宽，半角字母/数字约 11.5px，间隔号约 8px。
 * 一律取上界（汉字按整个字号、半角按 0.58 字号），所以折行结果只会比实际更保守。
 */
function glyphWidth(character) {
  if (/[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u.test(character)) return NODE_FONT_SIZE;
  if (character === "·") return NODE_FONT_SIZE * 0.42;
  return NODE_FONT_SIZE * 0.58;
}

/** 可以断行的地方：空白与中英文标点之后（间隔号不断行，避免首行只剩“冯·”）。 */
const BREAK_AFTER = /[\s、，。；;:：/／-]/u;

/**
 * 折行：按字素切分（不会拆开 emoji 或组合字符），逐字素累计估算宽度。
 *
 * 先用整行宽度贪心填行（放不下时退到最后一个可断点），
 * 如果最后一行只剩一两个字，就把最后两行合并后重新均分，
 * 仍然放不下时才丢掉结尾并加省略号。任何一行都不会超过 maxPixels。
 */
export function wrapKnowledgeLabel(title, { maxLines = NODE_LABEL_MAX_LINES, maxPixels = NODE_LABEL_MAX_PIXELS, graphemes = null } = {}) {
  const text = String(title ?? "").trim();
  if (!text) return [""];
  const split = graphemes ?? segmentGraphemes;
  const chars = split(text);
  const widths = chars.map(glyphWidth);
  const lines = [];
  let start = 0;
  while (start < chars.length && lines.length < maxLines) {
    const last = lines.length === maxLines - 1;
    const line = packLabelLine(chars, widths, start, maxPixels, last);
    if (line.end <= start) break; // 单个字素就超宽时的兜底
    lines.push({ start, end: line.end, width: line.width, text: line.text });
    start = line.end;
    if (line.text.endsWith("…")) return lines.map(entry => entry.text);
    if (lines.length >= 2 && line.width < maxPixels * 0.75 && start < chars.length) {
      // 提前换行会让下一行更空，重新按“尽量均分”切一次最后两行。
      const rebalanced = rebalanceLines(lines, chars, widths, maxPixels, split);
      if (rebalanced) return rebalanced.map(entry => entry.text);
    }
  }
  return lines.map(entry => entry.text);
}

/** 填一行：先按宽度贪心，放不下时退到最后一个可断点；最后一行放不下则省略号截断。 */
function packLabelLine(chars, widths, start, maxPixels, last) {
  let width = 0, end = start;
  while (end < chars.length && width + widths[end] <= maxPixels + 1e-9) { width += widths[end]; end += 1; }
  if (end >= chars.length) return { end, width, text: chars.slice(start, end).join("") };
  let cut = end;
  for (let index = start + 1; index <= end; index += 1) if (BREAK_AFTER.test(chars[index - 1])) cut = index;
  end = cut; width = 0;
  for (let index = start; index < end; index += 1) width += widths[index];
  if (last) {
    while (end > start && width + glyphWidth("…") > maxPixels + 1e-9) { end -= 1; width -= widths[end]; }
    return { end, width: width + glyphWidth("…"), text: chars.slice(start, end).join("") + "…" };
  }
  return { end, width, text: chars.slice(start, end).join("") };
}

/** 最后两行按“尽量均分且不超宽”重切；无法改善时返回 null。 */
function rebalanceLines(lines, chars, widths, maxPixels, split) {
  const tail = lines[lines.length - 1], head = lines[lines.length - 2];
  const merged = split(head.text + tail.text);
  let total = 0;
  for (const character of merged) total += glyphWidth(character);
  if (total > maxPixels * 2) return null;
  const target = Math.min(maxPixels, total / 2);
  let width = 0, cut = 1;
  for (let index = 1; index <= merged.length; index += 1) {
    const next = width + glyphWidth(merged[index - 1]);
    if (next > maxPixels + 1e-9) break;
    width = next;
    if (next <= target + 1e-9) cut = index;
  }
  const firstText = merged.slice(0, cut).join(""), secondText = merged.slice(cut).join("");
  if (!firstText || !secondText) return null;
  const firstWidth = [...firstText].reduce((sum, character) => sum + glyphWidth(character), 0);
  const secondWidth = total - firstWidth;
  if (secondWidth >= Math.min(tail.width + head.width, maxPixels)) return null;
  return [
    { ...head, text: firstText, width: firstWidth },
    { ...tail, text: secondText, width: secondWidth },
  ];
}

let graphemeSegmenter = null;
function segmentGraphemes(text) {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    graphemeSegmenter ??= new Intl.Segmenter("zh-Hans", { granularity: "grapheme" });
    return [...graphemeSegmenter.segment(text)].map((entry) => entry.segment);
  }
  return [...text];
}

/**
 * 纯概念布局。实际占用的层从基础概念排到进阶概念，层内按声明顺序居中排列。
 *
 * 返回值同时给出卡片尺寸与连线锚点，画布与卡片渲染都只读这一个模型，
 * 避免几何常量散落在组件、相机与测试里各写一份。
 * 请求的 width/height 是画布最小值：概念多或层数多时画布自动扩大。
 */
export function layoutKnowledgeGraph({ width = 1040, height = 720, chapterId, query = "" } = {}) {
  width = Number.isFinite(width) && width > 0 ? width : 1040;
  height = Number.isFinite(height) && height > 0 ? height : 720;
  const points = searchKnowledgePoints(query, { chapterId });
  const linesById = new Map(points.map((point) => [point.id, wrapKnowledgeLabel(point.shortTitle)]));
  const layersByDepth = new Map();
  for (const point of points) {
    if (!layersByDepth.has(point.depth)) layersByDepth.set(point.depth, []);
    layersByDepth.get(point.depth).push(point);
  }
  const layers = [...layersByDepth].sort(([left], [right]) => left - right);
  const maxDepth = Math.max(1, ...points.map((point) => point.depth));
  const columnSpacing = NODE_BOX.width + 24, rowSpacing = NODE_BOX.height + 48;
  const horizontalInset = NODE_BOX.width / 2 + 40, verticalInset = NODE_BOX.height / 2 + 36;
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
  const edges = points.flatMap((point) => point.deps.filter((dep) => positions.has(dep)).map((dep) => {
    const from = positions.get(dep), to = positions.get(point.id);
    const down = to.y >= from.y;
    return {
      from: dep, to: point.id, kind: "prerequisite",
      // 锚点位于卡片边框中点，箭头不会被卡片蒙住；前端只负责画曲线。
      x1: from.x, y1: from.y + (down ? NODE_BOX.height / 2 : -NODE_BOX.height / 2),
      x2: to.x, y2: to.y - (down ? NODE_BOX.height / 2 : -NODE_BOX.height / 2),
    };
  }));
  return {
    width, height, maxDepth, nodes, edges, linesById,
    boxWidth: NODE_BOX.width, boxHeight: NODE_BOX.height, boxRadius: NODE_BOX.radius,
    fontSize: NODE_FONT_SIZE, lineHeight: NODE_LINE_HEIGHT,
  };
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
