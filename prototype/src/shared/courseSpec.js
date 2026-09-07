const MAX_STEPS = 24;
const STEP_KINDS = new Set(["explain", "observe", "prediction", "experiment", "reflection"]);
const WORKSPACES = new Set(["guide", "circuit", "cpu", "assembly"]);

const ACTIONS = {
  "showHint": { workspace: null, fields: { text: "text" } },
  "highlightPart": { workspace: "guide", fields: { partId: "text" } },
  "setXray": { workspace: "guide", fields: { enabled: "boolean" } },
  "circuit.loadTemplate": { workspace: "circuit", fields: { templateId: "text" } },
  "circuit.focusPort": { workspace: "circuit", fields: { portId: "text" } },
  "cpu.loadPreset": { workspace: "cpu", fields: { presetId: "text" } },
  "cpu.focus": { workspace: "cpu", fields: { target: "text" } },
  "assembly.loadWorkOrder": { workspace: "assembly", fields: { workOrderId: "text" } },
  "assembly.focusSocket": { workspace: "assembly", fields: { socketId: "text" } },
};

export function normalizeCourseSpec(value) {
  const input = object(value, "课程协议");
  const schemaVersion = positiveInteger(input.schemaVersion, "协议版本");
  if (schemaVersion !== 1) throw invalid("不支持的课程协议版本");
  const courseKey = identifier(input.courseKey, "课程标识");
  const revision = positiveInteger(input.revision, "课程版本");
  const title = text(input.title, "课程标题", 120);
  const objectives = textList(input.objectives, "学习目标", 8, 240);
  if (!objectOrEmpty(input.requirements, "课程要求")) throw invalid("课程要求格式无效");
  const requirements = normalizeRequirements(input.requirements ?? {});
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > MAX_STEPS) throw invalid("课程步骤需要包含 1 到 24 项");
  const seen = new Set();
  const steps = input.steps.map((step, index) => {
    const item = object(step, `第 ${index + 1} 个课程步骤`);
    const id = identifier(item.id, "步骤标识");
    if (seen.has(id)) throw invalid("课程步骤标识重复");
    seen.add(id);
    const kind = text(item.kind, "步骤类型", 40);
    if (!STEP_KINDS.has(kind)) throw invalid("步骤类型不受支持");
    const workspace = text(item.workspace, "工作区", 40);
    if (!WORKSPACES.has(workspace)) throw invalid("工作区不受支持");
    const entryActions = Array.isArray(item.entryActions) ? item.entryActions : [];
    if (entryActions.length > 4) throw invalid("步骤动作不能超过 4 项");
    return {
      id, kind, workspace,
      instruction: text(item.instruction, "步骤说明", 1000),
      entryActions: entryActions.map((action) => normalizeAction(action, workspace)),
      checkpointKey: identifier(item.checkpointKey, "检查点标识"),
    };
  });
  return { schemaVersion, courseKey, revision, title, objectives, requirements, steps };
}

export function createLegacyCourseSpec(draft) {
  const steps = (draft?.guideScript ?? []).map((step, index) => ({
    id: `guide-${safeIdentifier(step.id, index + 1)}`,
    kind: step.completion === "challengeComplete" ? "experiment" : "observe",
    workspace: "guide",
    instruction: step.instruction,
    entryActions: step.action?.type && step.action.type !== "none" ? [step.action] : [],
    checkpointKey: `guide-check-${index + 1}`,
  }));
  return normalizeCourseSpec({
    schemaVersion: 1,
    courseKey: `legacy-course-${draft.id}`,
    revision: 1,
    title: draft.title,
    objectives: draft.learningObjectives,
    requirements: {},
    steps,
  });
}

function normalizeRequirements(value) {
  const requirements = objectOrEmpty(value, "课程要求") ? value : {};
  const output = {};
  if (requirements.cpuModel != null) output.cpuModel = text(requirements.cpuModel, "CPU 模型", 80);
  return output;
}

function normalizeAction(value, workspace) {
  const input = object(value, "步骤动作");
  const type = text(input.type, "步骤动作类型", 80);
  const definition = ACTIONS[type];
  if (!definition) throw invalid("步骤动作不受支持");
  if (definition.workspace && definition.workspace !== workspace) throw invalid("步骤动作与工作区不匹配");
  const output = { type };
  for (const [field, typeName] of Object.entries(definition.fields)) {
    if (typeName === "text") output[field] = text(input[field], `动作参数 ${field}`, 240);
    if (typeName === "boolean") {
      if (typeof input[field] !== "boolean") throw invalid(`动作参数 ${field} 必须是布尔值`);
      output[field] = input[field];
    }
  }
  return output;
}

function object(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(`${label}格式无效`); return value; }
function objectOrEmpty(value, label) { return value == null || (typeof value === "object" && !Array.isArray(value)); }
function text(value, label, max) { if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw invalid(`${label}无效`); return value.trim(); }
function identifier(value, label) { const result = text(value, label, 80); if (!/^[a-z][a-z0-9-]*$/i.test(result)) throw invalid(`${label}格式无效`); return result; }
function positiveInteger(value, label) { if (!Number.isInteger(value) || value < 1) throw invalid(`${label}无效`); return value; }
function textList(value, label, maxItems, maxLength) { if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) throw invalid(`${label}无效`); return value.map((item) => text(item, label, maxLength)); }
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function safeIdentifier(value, fallback) { const raw = String(value ?? fallback).trim().replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, ""); return raw || String(fallback); }
