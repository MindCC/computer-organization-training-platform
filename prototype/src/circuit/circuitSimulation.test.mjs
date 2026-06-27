import assert from "node:assert/strict";
import test from "node:test";

import { CIRCUIT_CHALLENGES, HALF_ADDER_CIRCUIT } from "./challengeCircuitModel.js";
import { runCircuitTestCases, simulateCircuit } from "./circuitSimulation.js";

test("六个结构化关卡的参考结构都能通过组合逻辑测试", () => {
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
