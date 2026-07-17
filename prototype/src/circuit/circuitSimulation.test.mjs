import assert from "node:assert/strict";
import test from "node:test";

import {
  AND_GATE_CIRCUIT,
  CIRCUIT_CHALLENGES,
  DATA_FLOW_CIRCUIT,
  HALF_ADDER_CIRCUIT,
  NOT_GATE_CIRCUIT,
  OR_GATE_CIRCUIT,
  XOR_GATE_CIRCUIT,
} from "./challengeCircuitModel.js";
import { runCircuitTestCases, runAllCircuitTests, simulateCircuit } from "./circuitSimulation.js";

test("结构化关卡的参考结构都能通过组合逻辑测试", () => {
  for (const challenge of CIRCUIT_CHALLENGES) {
    const result = runCircuitTestCases(challenge, challenge.requiredEdges);
    assert.equal(result.passed, true, `${challenge.id} should pass all circuit test cases`);
  }
});

test("半加器组合逻辑仿真覆盖完整真值表", () => {
  const result = runCircuitTestCases(HALF_ADDER_CIRCUIT, HALF_ADDER_CIRCUIT.requiredEdges);

  assert.equal(result.passed, true);
  assert.deepEqual(result.cases.map((testCase) => testCase.passed), [true, true, true, true]);
});

test("基础逻辑门组合逻辑仿真覆盖真值表", () => {
  for (const challenge of [AND_GATE_CIRCUIT, OR_GATE_CIRCUIT, NOT_GATE_CIRCUIT, XOR_GATE_CIRCUIT]) {
    const result = runCircuitTestCases(challenge, challenge.requiredEdges);
    assert.equal(result.passed, true, `${challenge.id} should pass`);
    assert.equal(result.cases.every((testCase) => testCase.passed), true, `${challenge.id} cases should pass`);
  }
});

test("缺少导线时对应输出保持 unknown", () => {
  const edges = HALF_ADDER_CIRCUIT.requiredEdges.filter((edge) => edge.id !== "xor-s-to-sum");
  const result = simulateCircuit(HALF_ADDER_CIRCUIT, edges, { "input-a.out": 1, "input-b.out": 0 });

  assert.equal(result.status, "ok");
  assert.equal(result.values["sum-output.in"], "unknown");
  assert.equal(result.values["carry-output.in"], 0);
});

test("非法结构会返回 error 而不是继续仿真", () => {
  const result = simulateCircuit(
    HALF_ADDER_CIRCUIT,
    [{ from: { nodeId: "sum-output", portId: "in" }, to: { nodeId: "xor-1", portId: "a" } }],
    { "input-a.out": 1, "input-b.out": 1 },
  );

  assert.equal(result.status, "error");
  assert.equal(result.errors.some((error) => error.type === "端口方向错误"), true);
});

test("hidden test cases affect passed but not cases array", () => {
  // Public-only: passes public cases
  const publicResult = runCircuitTestCases(DATA_FLOW_CIRCUIT, DATA_FLOW_CIRCUIT.requiredEdges);
  assert.equal(publicResult.passed, true);
  assert.equal(publicResult.publicPassed, true);
  assert.equal(publicResult.cases.length, 2); // only public

  // All: includes hidden, backward-compat .cases still public-only
  const allResult = runAllCircuitTests(DATA_FLOW_CIRCUIT, DATA_FLOW_CIRCUIT.requiredEdges);
  assert.equal(allResult.passed, true);
  assert.equal(allResult.publicPassed, true);
  assert.equal(allResult.hiddenPassed, true);
  assert.equal(allResult.hiddenCount, 1);
  assert.equal(allResult.hiddenPassedCount, 1);
  assert.equal(allResult.cases.length, 2); // .cases is public-only for BC
  assert.equal(allResult.allCases.length, 3); // allCases includes hidden
});

test("hidden test cases fail when edges are wrong", () => {
  const badEdges = DATA_FLOW_CIRCUIT.requiredEdges.slice(0, 1); // incomplete
  const result = runAllCircuitTests(DATA_FLOW_CIRCUIT, badEdges);
  assert.equal(result.passed, false);
  assert.equal(result.hiddenPassed, false);
  assert.equal(result.hiddenPassedCount, 0);
});
