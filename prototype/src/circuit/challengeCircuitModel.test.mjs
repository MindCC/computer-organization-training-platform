import assert from "node:assert/strict";
import test from "node:test";

import {
  CIRCUIT_CHALLENGES,
  HALF_ADDER_CIRCUIT,
  buildCircuitModelIndex,
  edgeKey,
  getCircuitChallenge,
} from "./challengeCircuitModel.js";

const expectedIds = ["data-flow", "half-adder", "full-adder", "multi-adder", "mux", "alu"];

test("结构化模型覆盖六个运算器路线关卡", () => {
  assert.deepEqual(CIRCUIT_CHALLENGES.map((challenge) => challenge.id), expectedIds);
  assert.equal(getCircuitChallenge("half-adder"), HALF_ADDER_CIRCUIT);
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
