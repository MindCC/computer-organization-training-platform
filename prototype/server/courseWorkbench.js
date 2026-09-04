import { COMPUTER_PARTS } from "../src/components/computerParts.js";

export const COURSE_GUIDE_CHALLENGE_ID = "computer-components";

const MAX_TEXT_LENGTH = 2_000;
const MAX_OBJECTIVES = 8;
const MAX_GUIDE_STEPS = 12;
const MAX_MILESTONES = 8;
const PART_IDS = new Set(COMPUTER_PARTS.map((part) => part.id));
const ACTION_TYPES = new Set(["highlightPart", "setXray", "showHint", "none"]);
const COMPLETION_TYPES = new Set(["acknowledge", "challengeComplete"]);

export function createFallbackCourseDraft(input = {}) {
  const title = String(input.title ?? "计算机组成导学").trim() || "计算机组成导学";
  const summary = String(input.summary ?? "通过三维场景观察计算机部件及其协作关系。").trim();
  const objective = Array.isArray(input.learningObjectives) && String(input.learningObjectives[0] ?? "").trim()
    ? String(input.learningObjectives[0]).trim() : "识别 CPU、内存和总线的职责";
  return {
    title, summary, learningObjectives: [objective], guideChallengeId: COURSE_GUIDE_CHALLENGE_ID,
    guideScript: [
      { id: "cpu-focus", title: "观察 CPU", instruction: "点击 CPU，观察它在主板上的位置和职责。", action: { type: "highlightPart", partId: "cpu" }, completion: "acknowledge" },
      { id: "bus-xray", title: "查看总线", instruction: "打开 X-ray，观察部件之间的数据连接。", action: { type: "setXray", enabled: true }, completion: "acknowledge" },
      { id: "overview-complete", title: "完成概述", instruction: "完成计算机组成概述关卡。", action: { type: "none" }, completion: "challengeComplete" },
    ],
    assignmentOutline: { title: `${title}观察记录`, description: "记录一个部件职责及其与其他部件的关系。" },
    projectOutline: { title: `${title}小组方案`, description: "小组说明一台主机中各部件如何协作完成任务。", milestones: [
      { id: "proposal", title: "方案草稿", description: "完成分工并描述部件职责。" },
      { id: "reflection", title: "协作反思", description: "提交个人贡献和改进建议。" },
    ] },
  };
}

export function normalizeCourseDraftPayload(payload) {
  const input = assertObject(payload, "课程草稿");
  const title = requiredText(input.title, "课程标题", 120);
  const summary = optionalText(input.summary, "课程简介", MAX_TEXT_LENGTH);
  const learningObjectives = normalizeTextList(input.learningObjectives, "学习目标", MAX_OBJECTIVES, 240);
  if (learningObjectives.length === 0) throw invalid("至少填写一个学习目标");

  const guideChallengeId = String(input.guideChallengeId ?? COURSE_GUIDE_CHALLENGE_ID).trim();
  if (guideChallengeId !== COURSE_GUIDE_CHALLENGE_ID) throw invalid("课程引导仅支持 3D 概述关卡");

  const guideScript = normalizeGuideScript(input.guideScript);
  const assignmentOutline = normalizeOutline(input.assignmentOutline, "作业建议", false);
  const projectOutline = normalizeProjectOutline(input.projectOutline);

  return { title, summary, learningObjectives, guideChallengeId, guideScript, assignmentOutline, projectOutline };
}

export function normalizeEvidenceUrl(value) {
  const text = optionalText(value, "成果链接", 1_000);
  if (!text) return "";
  let url;
  try { url = new URL(text); } catch { throw invalid("成果链接必须是 HTTPS 地址"); }
  if (url.protocol !== "https:") throw invalid("成果链接必须是 HTTPS 地址");
  return url.toString();
}

function normalizeGuideScript(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_GUIDE_STEPS) {
    throw invalid("引导脚本需要包含 1 到 12 个步骤");
  }
  const seenIds = new Set();
  return value.map((step, index) => {
    const input = assertObject(step, `第 ${index + 1} 个引导步骤`);
    const id = requiredText(input.id, "引导步骤 ID", 80);
    if (seenIds.has(id)) throw invalid("引导步骤 ID 不能重复");
    seenIds.add(id);
    const completion = requiredText(input.completion, "步骤完成条件", 40);
    if (!COMPLETION_TYPES.has(completion)) throw invalid("步骤完成条件不受支持");
    return {
      id,
      title: requiredText(input.title, "引导步骤标题", 120),
      instruction: requiredText(input.instruction, "引导步骤说明", 500),
      action: normalizeGuideAction(input.action),
      completion,
    };
  });
}

function normalizeGuideAction(value) {
  const input = assertObject(value, "引导动作");
  const type = requiredText(input.type, "引导动作类型", 40);
  if (!ACTION_TYPES.has(type)) throw invalid("引导动作不受支持");
  if (type === "highlightPart") {
    const partId = requiredText(input.partId, "高亮部件", 80);
    if (!PART_IDS.has(partId)) throw invalid("高亮部件不存在");
    return { type, partId };
  }
  if (type === "setXray") {
    if (typeof input.enabled !== "boolean") throw invalid("X-ray 动作必须提供布尔值");
    return { type, enabled: input.enabled };
  }
  if (type === "showHint") return { type, text: requiredText(input.text, "提示内容", 500) };
  return { type };
}

function normalizeOutline(value, label, required) {
  const input = value == null ? {} : assertObject(value, label);
  const title = optionalText(input.title, `${label}标题`, 120);
  const description = optionalText(input.description, `${label}说明`, MAX_TEXT_LENGTH);
  if (required && !title) throw invalid(`${label}标题不能为空`);
  return { title, description };
}

function normalizeProjectOutline(value) {
  const outline = normalizeOutline(value, "项目任务", true);
  const milestones = value?.milestones;
  if (!Array.isArray(milestones) || milestones.length === 0 || milestones.length > MAX_MILESTONES) {
    throw invalid("项目任务至少需要一个里程碑");
  }
  const ids = new Set();
  return {
    ...outline,
    milestones: milestones.map((milestone, index) => {
      const input = assertObject(milestone, `第 ${index + 1} 个里程碑`);
      const id = requiredText(input.id, "里程碑 ID", 80);
      if (ids.has(id)) throw invalid("里程碑 ID 不能重复");
      ids.add(id);
      const dueAt = optionalText(input.dueAt, "里程碑截止时间", 64);
      if (dueAt && Number.isNaN(Date.parse(dueAt))) throw invalid("里程碑截止时间无效");
      return {
        id,
        title: requiredText(input.title, "里程碑标题", 120),
        description: requiredText(input.description, "里程碑说明", MAX_TEXT_LENGTH),
        dueAt: dueAt || null,
      };
    }),
  };
}

function normalizeTextList(value, label, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) throw invalid(`${label}格式无效`);
  return value.map((item) => requiredText(item, label, maxLength));
}

function requiredText(value, label, maxLength) {
  const text = optionalText(value, label, maxLength);
  if (!text) throw invalid(`${label}不能为空`);
  return text;
}

function optionalText(value, label, maxLength) {
  if (value == null) return "";
  if (typeof value !== "string") throw invalid(`${label}必须是文本`);
  const text = value.trim();
  if (text.length > maxLength) throw invalid(`${label}过长`);
  return text;
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(`${label}格式无效`);
  return value;
}

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}
