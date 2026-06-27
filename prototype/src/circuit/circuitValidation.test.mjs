import assert from "node:assert/strict";
import test from "node:test";

import { CIRCUIT_CHALLENGES, HALF_ADDER_CIRCUIT } from "./challengeCircuitModel.js";
import { canConnectPorts, validateCircuitStructure } from "./circuitValidation.js";

test("六个结构化关卡的参考结构验证通过", () => {
  for (const challenge of CIRCUIT_CHALLENGES) {
    const result = validateCircuitStructure(challenge, challenge.requiredEdges);
    assert.equal(result.passed, true, `${challenge.id} should pass structure validation`);
    assert.equal(result.score, 100, `${challenge.id} should score 100`);
  }
});

test("缺少必要连接时返回具体端口反馈", () => {
  const result = validateCircuitStructure(
    HALF_ADDER_CIRCUIT,
    HALF_ADDER_CIRCUIT.requiredEdges.filter((edge) => edge.id !== "input-a-to-xor-a"),
  );

  assert.equal(result.passed, false);
  assert.equal(result.missingEdges.length, 1);
  assert.deepEqual(result.errors[0], {
    type: "输入端未连接",
    message: "输入A没有进入异或门，和位无法判断。",
    nodeId: "xor-1",
    portId: "a",
  });
});

test("输入端不能连接到输入端", () => {
  const result = canConnectPorts(HALF_ADDER_CIRCUIT, {
    from: { nodeId: "sum-output", portId: "in" },
    to: { nodeId: "xor-1", portId: "a" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.type, "端口方向错误");
});

test("同一输入端不能被重复驱动", () => {
  const result = canConnectPorts(
    HALF_ADDER_CIRCUIT,
    { from: { nodeId: "input-b", portId: "out" }, to: { nodeId: "xor-1", portId: "a" } },
    [{ from: { nodeId: "input-a", portId: "out" }, to: { nodeId: "xor-1", portId: "a" } }],
  );

  assert.equal(result.ok, false);
  assert.equal(result.type, "输入端重复驱动");
});

test("多余但方向合法的连接会被扣分并标为结构冲突", () => {
  const result = validateCircuitStructure(HALF_ADDER_CIRCUIT, [
    ...HALF_ADDER_CIRCUIT.requiredEdges.filter((edge) => edge.id !== "input-a-to-and-a"),
    { from: { nodeId: "input-b", portId: "out" }, to: { nodeId: "and-1", portId: "a" } },
  ]);

  assert.equal(result.passed, false);
  assert.equal(result.extraEdges.length, 1);
  assert.equal(result.errors.some((error) => error.type === "结构冲突"), true);
});
