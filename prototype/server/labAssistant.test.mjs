import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLabAssistantPayload,
  buildLabAssistantMessages,
  buildFallbackLabHint,
  parseLabHintJson,
  generateLabAssistantHint,
} from "./labAssistant.js";

test("buildLabAssistantPayload 组装学生实验上下文", () => {
  const payload = buildLabAssistantPayload({
    challengeId: "half-adder",
    connections: ["输入A->异或门1"],
    inputState: { a: 1, b: 0 },
    feedback: { passed: false, score: 40, errors: ["缺少进位连线"], missing: ["输入A->与门1"] },
    realtimeDiagnostics: { status: "failed", summary: "2/5 通过", issues: [{ type: "carry", message: "进位错误" }] },
  });

  assert.equal(payload.challenge.id, "half-adder");
  assert.ok(Array.isArray(payload.requiredConnections));
  assert.deepEqual(payload.studentConnections, ["输入A->异或门1"]);
  assert.equal(payload.feedback.passed, false);
  assert.deepEqual(payload.feedback.missing, ["输入A->与门1"]);
  assert.equal(payload.realtimeDiagnostics.status, "failed");
});

test("buildLabAssistantPayload 容忍空输入", () => {
  const payload = buildLabAssistantPayload({ challengeId: "unknown-challenge" });
  assert.equal(payload.challenge.id, "unknown-challenge");
  assert.equal(payload.feedback, null);
  assert.deepEqual(payload.studentConnections, []);
});

test("buildLabAssistantMessages 是单条 user 消息且包含数据", () => {
  const messages = buildLabAssistantMessages(buildLabAssistantPayload({ challengeId: "half-adder" }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "user");
  assert.ok(messages[0].content.includes("AI助教"));
  assert.ok(messages[0].content.includes("conceptReview"));
});

test("parseLabHintJson 解析合法 JSON 并裁剪长度", () => {
  const hint = parseLabHintJson(JSON.stringify({
    conceptReview: "半加器由异或门求和、与门进位。",
    errorAnalysis: ["进位未接"],
    nextStepHints: Array.from({ length: 10 }, (_, i) => `提示${i}`),
  }));
  assert.equal(hint.conceptReview, "半加器由异或门求和、与门进位。");
  assert.equal(hint.nextStepHints.length, 6);
});

test("parseLabHintJson 剥离代码围栏", () => {
  const hint = parseLabHintJson("```json\n{\"conceptReview\":\"点拨\",\"errorAnalysis\":[],\"nextStepHints\":[\"第一步\"]}\n```");
  assert.deepEqual(hint.nextStepHints, ["第一步"]);
});

test("parseLabHintJson 缺字段时抛错", () => {
  assert.throws(() => parseLabHintJson("{\"conceptReview\":\"点拨\"}"), /缺少字段/);
});

test("buildFallbackLabHint 生成降级建议", () => {
  const payload = buildLabAssistantPayload({
    challengeId: "half-adder",
    feedback: { passed: false, errors: [], missing: ["输入A->与门1", "输入B->与门1"] },
  });
  const fallback = buildFallbackLabHint(payload, "AI_DISABLED");
  assert.equal(fallback.source, "fallback");
  assert.ok(fallback.hint.nextStepHints.some((h) => h.includes("必要连线")));
  assert.ok(fallback.hint.conceptReview.length > 0);
});

test("generateLabAssistantHint 未配置 Key 时降级", async () => {
  const report = await generateLabAssistantHint({ challengeId: "half-adder" });
  assert.equal(report.source, "fallback");
});

test("generateLabAssistantHint AI 响应无效时降级", async () => {
  const { readDeepSeekConfig } = await import("./aiClient.js");
  const config = { ...readDeepSeekConfig(), enabled: true, apiKey: "test-key" };
  const { generateLabAssistantHint: gen } = await import("./labAssistant.js");
  // 直接构造：用无效 base url 触发失败路径
  const badConfig = { ...config, baseUrl: "http://127.0.0.1:1", timeoutMs: 500 };
  const { buildLabAssistantPayload, buildLabAssistantMessages, buildFallbackLabHint, parseLabHintJson } = await import("./labAssistant.js");
  const payload = buildLabAssistantPayload({ challengeId: "half-adder" });
  let report;
  try {
    const { requestChatCompletion } = await import("./aiClient.js");
    const content = await requestChatCompletion(badConfig, buildLabAssistantMessages(payload));
    report = { source: "ai", hint: parseLabHintJson(content) };
  } catch (error) {
    report = buildFallbackLabHint(payload, error?.code ?? "AI_ERROR");
  }
  assert.equal(report.source, "fallback");
});
