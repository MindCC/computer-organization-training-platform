import { CHALLENGES } from "../src/platformLogic.js";
import { readDeepSeekConfig, requestChatCompletion, createAiError } from "./aiClient.js";

const HINT_KEYS = ["conceptReview", "errorAnalysis", "nextStepHints"];
const MAX_ITEMS = 6;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildLabAssistantPayload({ challengeId, connections = [], inputState = {}, feedback = null, realtimeDiagnostics = null }) {
  const challenge = CHALLENGES.find((c) => c.id === challengeId) ?? null;

  return {
    challenge: challenge
      ? { id: challenge.id, title: challenge.title, goal: challenge.goal, objective: challenge.objective }
      : { id: challengeId, title: "未知关卡", goal: "", objective: "" },
    requiredConnections: Array.isArray(challenge?.requiredConnections) ? challenge.requiredConnections : [],
    studentConnections: connections.slice(-30),
    inputState,
    feedback: feedback
      ? {
          passed: Boolean(feedback.passed),
          score: feedback.score ?? null,
          errors: Array.isArray(feedback.errors) ? feedback.errors.slice(0, MAX_ITEMS) : [],
          missing: Array.isArray(feedback.missing) ? feedback.missing.slice(0, MAX_ITEMS) : [],
        }
      : null,
    realtimeDiagnostics: realtimeDiagnostics
      ? {
          status: realtimeDiagnostics.status ?? "unknown",
          summary: realtimeDiagnostics.summary ?? "",
          issues: Array.isArray(realtimeDiagnostics.issues) ? realtimeDiagnostics.issues.slice(0, MAX_ITEMS) : [],
        }
      : null,
  };
}

export function buildLabAssistantMessages(payload) {
  return [
    {
      role: "user",
      content: [
        "你是《计算机组成原理》电路实验课的AI助教，正在实时指导一名学生完成电路装配挑战。",
        "只根据给定的关卡要求和学生当前状态进行讲解，不编造学生没犯过的错误。",
        "语气亲切鼓励，像老师站在学生旁边轻声指导，中文回答，每条不超过80字。",
        "严格输出 JSON（不要 Markdown、不要额外解释），必须包含字段：",
        "conceptReview（字符串：本关核心概念的1-2句点拨）、",
        "errorAnalysis（字符串数组：针对学生当前错误的具体分析，没有错误时为空数组）、",
        "nextStepHints（字符串数组：2-4条下一步操作建议，从易到难，第一条不给答案只给方向）。",
        "不要输出密码、令牌、Cookie 等敏感内容。",
        "以下是学生当前实验数据：",
        JSON.stringify(payload),
      ].join("\n"),
    },
  ];
}

export function buildFallbackLabHint(payload, reason) {
  const errors = payload.feedback?.errors ?? [];
  const missing = payload.feedback?.missing ?? [];
  const hints = [
    `重新阅读关卡目标：「${payload.challenge.goal || payload.challenge.title}」，对照左侧元件属性面板确认每个端口的作用。`,
    "先保证每一条必要连线都存在，再追求信号方向正确。",
    "用「单步执行」观察数据旅程检查点，看信号在哪一步偏离预期。",
  ];
  if (missing.length > 0) {
    hints.unshift(`还有 ${missing.length} 处必要连线未完成，优先补齐：${missing.slice(0, 3).join("、")}。`);
  }
  return {
    source: "fallback",
    generatedAt: new Date().toISOString(),
    hint: {
      conceptReview: `本关「${payload.challenge.title}」考查的是${payload.challenge.goal || "核心部件之间的数据通路"}。`,
      errorAnalysis: errors.slice(0, MAX_ITEMS),
      nextStepHints: hints.slice(0, MAX_ITEMS),
    },
    fallbackReason: typeof reason === "string" ? reason : (reason?.message ?? "AI 服务不可用"),
  };
}

export function parseLabHintJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw createAiError("AI_RESPONSE", "AI 返回内容为空");
  }
  const trimmed = text.trim();
  const normalized = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;

  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw createAiError("AI_RESPONSE", "AI 返回内容不是有效 JSON");
  }

  const source = isPlainObject(parsed?.hint) ? parsed.hint : parsed;
  for (const key of HINT_KEYS) {
    if (!(key in source)) {
      throw createAiError("AI_RESPONSE", `AI JSON 缺少字段：${key}`);
    }
  }
  if (typeof source.conceptReview !== "string" || !source.conceptReview.trim()) {
    throw createAiError("AI_RESPONSE", "AI JSON 字段不可为空：conceptReview");
  }
  for (const key of ["errorAnalysis", "nextStepHints"]) {
    if (!Array.isArray(source[key]) || !source[key].every((item) => typeof item === "string" && item.trim())) {
      throw createAiError("AI_RESPONSE", `AI JSON 字段必须是非空字符串数组：${key}`);
    }
  }

  return {
    conceptReview: source.conceptReview.trim(),
    errorAnalysis: source.errorAnalysis.map((s) => s.trim()).slice(0, MAX_ITEMS),
    nextStepHints: source.nextStepHints.map((s) => s.trim()).slice(0, MAX_ITEMS),
  };
}

export async function generateLabAssistantHint(labContext, { env = process.env } = {}) {
  const payload = buildLabAssistantPayload(labContext ?? {});
  const config = readDeepSeekConfig(env);

  if (!config.enabled) {
    return buildFallbackLabHint(payload, "AI_DISABLED");
  }

  try {
    const content = await requestChatCompletion(config, buildLabAssistantMessages(payload));
    const hint = parseLabHintJson(content);
    return { source: "ai", generatedAt: new Date().toISOString(), hint };
  } catch (error) {
    return buildFallbackLabHint(payload, error?.code ?? error?.message ?? "AI_ERROR");
  }
}
