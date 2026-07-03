import assert from "node:assert/strict";
import test from "node:test";

import {
  AND_GATE_CIRCUIT,
  CIRCUIT_CHALLENGES,
  COMPUTER_COMPONENTS_CIRCUIT,
  HALF_ADDER_CIRCUIT,
  INSTRUCTION_DATA_CIRCUIT,
  NOT_GATE_CIRCUIT,
  OR_GATE_CIRCUIT,
  PROGRAM_FLOW_CIRCUIT,
  XOR_GATE_CIRCUIT,
  buildCircuitModelIndex,
  edgeKey,
  getCircuitChallenge,
} from "./challengeCircuitModel.js";

const expectedIds = ["computer-components", "program-flow", "instruction-data", "data-flow", "and-gate", "or-gate", "not-gate", "xor-gate", "half-adder", "full-adder", "machine-number", "multi-adder", "mux", "alu"];

test("结构化模型覆盖基础门到运算器路线关卡", () => {
  assert.deepEqual(CIRCUIT_CHALLENGES.map((challenge) => challenge.id), expectedIds);
  assert.equal(getCircuitChallenge("computer-components"), COMPUTER_COMPONENTS_CIRCUIT);
  assert.equal(getCircuitChallenge("program-flow"), PROGRAM_FLOW_CIRCUIT);
  assert.equal(getCircuitChallenge("instruction-data"), INSTRUCTION_DATA_CIRCUIT);
  assert.equal(getCircuitChallenge("half-adder"), HALF_ADDER_CIRCUIT);
  assert.equal(getCircuitChallenge("and-gate"), AND_GATE_CIRCUIT);
});

test("每个结构化关卡都使用稳定节点和端口 id", () => {
  for (const challenge of CIRCUIT_CHALLENGES) {
    const nodeIds = challenge.nodes.map((node) => node.id);
    assert.equal(new Set(nodeIds).size, nodeIds.length, `${challenge.id} node ids should be unique`);

    for (const node of challenge.nodes) {
      const portIds = node.ports.map((port) => port.id);
      assert.equal(new Set(portIds).size, portIds.length, `${challenge.id}/${node.id} ports should be unique`);
      assert.equal(typeof node.label, "string");
      assert.equal(typeof node.position.x, "number");
      assert.equal(typeof node.position.y, "number");
    }
  }
});

test("每个关卡必要连线都指向存在的节点端口", () => {
  for (const challenge of CIRCUIT_CHALLENGES) {
    const index = buildCircuitModelIndex(challenge);

    for (const edge of challenge.requiredEdges) {
      assert.equal(index.ports.has(`${edge.from.nodeId}.${edge.from.portId}`), true, `${challenge.id} ${edgeKey(edge)} from should exist`);
      assert.equal(index.ports.has(`${edge.to.nodeId}.${edge.to.portId}`), true, `${challenge.id} ${edgeKey(edge)} to should exist`);
    }
  }
});

test("每个关卡至少有一组可运行测试用例", () => {
  for (const challenge of CIRCUIT_CHALLENGES) {
    assert.equal(challenge.testCases.length > 0, true, `${challenge.id} should define test cases`);
    for (const testCase of challenge.testCases) {
      assert.equal(Object.keys(testCase.expected).length > 0, true, `${challenge.id}/${testCase.name} should assert outputs`);
    }
  }
});

test("半加器测试用例覆盖完整真值表", () => {
  assert.deepEqual(HALF_ADDER_CIRCUIT.testCases.map((item) => item.name), ["0 + 0", "0 + 1", "1 + 0", "1 + 1"]);
});

test("基础逻辑门测试用例覆盖完整真值表", () => {
  assert.deepEqual(AND_GATE_CIRCUIT.testCases.map((item) => item.name), ["0 与 0", "0 与 1", "1 与 0", "1 与 1"]);
  assert.deepEqual(OR_GATE_CIRCUIT.testCases.map((item) => item.name), ["0 或 0", "0 或 1", "1 或 0", "1 或 1"]);
  assert.deepEqual(NOT_GATE_CIRCUIT.testCases.map((item) => item.name), ["非 0", "非 1"]);
  assert.deepEqual(XOR_GATE_CIRCUIT.testCases.map((item) => item.name), ["0 异或 0", "0 异或 1", "1 异或 0", "1 异或 1"]);
});

test("机器数编码关卡复用 React Flow 元件模型", () => {
  const challenge = CIRCUIT_CHALLENGES.find((item) => item.id === "machine-number");

  assert.ok(challenge);
  assert.equal(challenge.title, "机器数编码");
  assert.equal(challenge.nodes.some((node) => node.label === "补码生成器"), true);
  assert.equal(challenge.requiredEdges.length >= 5, true);
  assert.equal(challenge.testCases.some((testCase) => testCase.name.includes("-5")), true);
});
