import test from "node:test";
import assert from "node:assert/strict";
import { HALF_ADDER_CIRCUIT } from "./challengeCircuitModel.js";
import { runAllCircuitTests } from "./circuitSimulation.js";
import { buildProgressiveHints, getHintLevel, HINT_LEVELS } from "./progressiveHints.js";

test("getHintLevel returns correct level for attempt count", () => {
  assert.equal(getHintLevel(1), HINT_LEVELS.PHENOMENON);
  assert.equal(getHintLevel(2), HINT_LEVELS.PHENOMENON);
  assert.equal(getHintLevel(3), HINT_LEVELS.MODULE);
  assert.equal(getHintLevel(4), HINT_LEVELS.MODULE);
  assert.equal(getHintLevel(5), HINT_LEVELS.OPERATION);
  assert.equal(getHintLevel(10), HINT_LEVELS.OPERATION);
});

test("buildProgressiveHints returns empty for all-pass", () => {
  const result = runAllCircuitTests(HALF_ADDER_CIRCUIT, HALF_ADDER_CIRCUIT.requiredEdges);
  const hints = buildProgressiveHints({ challengeModel: HALF_ADDER_CIRCUIT, studentEdges: HALF_ADDER_CIRCUIT.requiredEdges, testResults: result, attemptCount: 1 });
  assert.deepEqual(hints, []);
});

test("buildProgressiveHints level 1 shows phenomenon for early attempts", () => {
  const badEdges = HALF_ADDER_CIRCUIT.requiredEdges.filter((e) => e.id !== "xor-s-to-sum");
  const result = runAllCircuitTests(HALF_ADDER_CIRCUIT, badEdges);
  const hints = buildProgressiveHints({ challengeModel: HALF_ADDER_CIRCUIT, studentEdges: badEdges, testResults: result, attemptCount: 1 });
  assert.ok(hints.length > 0);
  assert.ok(hints.some((h) => h.title.includes("检测到问题")), "always-shown phenomenon hint");
  assert.ok(hints.some((h) => h.title.includes("用例")), "first-failing test case detail");
  // At level 1, should NOT include module or operation hints
  assert.equal(hints.filter((h) => h.level > HINT_LEVELS.PHENOMENON).length, 0);
});

test("buildProgressiveHints level 2 adds module hints", () => {
  const badEdges = HALF_ADDER_CIRCUIT.requiredEdges.filter((e) => e.id !== "xor-s-to-sum");
  const result = runAllCircuitTests(HALF_ADDER_CIRCUIT, badEdges);
  const hints = buildProgressiveHints({ challengeModel: HALF_ADDER_CIRCUIT, studentEdges: badEdges, testResults: result, attemptCount: 3 });
  assert.ok(hints.some((h) => h.level === HINT_LEVELS.MODULE), "module-level hints at attempt 3");
  assert.ok(hints.some((h) => h.title.includes("可能涉及的模块")), "module identification hint");
  // Should NOT include operation hints yet
  assert.equal(hints.filter((h) => h.level === HINT_LEVELS.OPERATION).length, 0);
});

test("buildProgressiveHints level 3 adds operation hints", () => {
  const badEdges = HALF_ADDER_CIRCUIT.requiredEdges.filter((e) => e.id !== "xor-s-to-sum");
  const result = runAllCircuitTests(HALF_ADDER_CIRCUIT, badEdges);
  const hints = buildProgressiveHints({ challengeModel: HALF_ADDER_CIRCUIT, studentEdges: badEdges, testResults: result, attemptCount: 5 });
  assert.ok(hints.some((h) => h.level === HINT_LEVELS.OPERATION), "operation hints at attempt 5");
  assert.ok(hints.some((h) => h.title.includes("连线建议") || h.title.includes("输出端未连接")), "specific connection suggestion");
});
