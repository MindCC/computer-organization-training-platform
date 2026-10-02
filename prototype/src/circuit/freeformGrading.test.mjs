import test from "node:test";
import assert from "node:assert/strict";

import { FREEFORM_SPECS, freeformSpecOf, gradeFreeform, checkFreeformStructure } from "./freeformGrading.js";

function inNode(id, y, label = id) {
  return { id, type: "input", label, position: { x: 40, y }, ports: [{ id: "out", label: "OUT", direction: "out", signal: "bit" }] };
}
function outNode(id, y, label = id) {
  return { id, type: "output", label, position: { x: 660, y }, ports: [{ id: "in", label: "IN", direction: "in", signal: "bit" }] };
}
function gateNode(id, type, y, ports) {
  return { id, type, label: type, position: { x: 340, y }, ports };
}
function inPort(id, label = id) { return { id, label, direction: "in", signal: "bit" }; }
function outPort(id, label = id) { return { id, label, direction: "out", signal: "bit" }; }
function edge(fromNode, fromPort, toNode, toPort) {
  return { from: { nodeId: fromNode, portId: fromPort }, to: { nodeId: toNode, portId: toPort } };
}

const AND_PORTS = [inPort("a", "A"), inPort("b", "B"), outPort("c", "C")];
const OR_PORTS = [inPort("a", "A"), inPort("b", "B"), outPort("out", "Y")];
const XOR_PORTS = [inPort("a", "A"), inPort("b", "B"), outPort("s", "S")];
const NOT_PORTS = [inPort("in", "IN"), outPort("out", "OUT")];

function andGateCircuit({ replaceGate = "and", dropWire = null } = {}) {
  const nodes = [
    inNode("input-1", 60, "输入 A"),
    inNode("input-2", 180, "输入 B"),
    gateNode("gate-3", replaceGate, 120, replaceGate === "and" ? AND_PORTS : replaceGate === "or" ? OR_PORTS : XOR_PORTS),
    outNode("output-4", 120, "输出"),
  ];
  const edges = [
    edge("input-1", "out", "gate-3", "a"),
    edge("input-2", "out", "gate-3", "b"),
    edge("gate-3", replaceGate === "and" ? "c" : replaceGate === "or" ? "out" : "s", "output-4", "in"),
  ];
  const kept = dropWire ? edges.filter((_, index) => index !== dropWire) : edges;
  return { nodes, edges: kept };
}

test("规格覆盖 6 个纯逻辑门关", () => {
  for (const id of ["and-gate", "or-gate", "not-gate", "xor-gate", "half-adder", "full-adder"]) {
    assert.ok(freeformSpecOf(id), `缺少 ${id} 的判分规格`);
  }
  assert.equal(freeformSpecOf("machine-number"), null);
});

test("与门：正确拼装（结构+功能）全部通过", () => {
  const { nodes, edges } = andGateCircuit();
  const grade = gradeFreeform({ nodes, requiredEdges: [], testCases: [] }, edges, FREEFORM_SPECS["and-gate"]);

  assert.equal(grade.passed, true);
  assert.equal(grade.cases.length, 4);
  assert.equal(grade.cases.every((item) => item.passed), true);
  assert.deepEqual(grade.cases.map((item) => item.expected[0]), [0, 0, 0, 1]);
});

test("与门：用错门（放成或门）报结构错误", () => {
  const { nodes, edges } = andGateCircuit({ replaceGate: "or" });
  const grade = gradeFreeform({ nodes, requiredEdges: [], testCases: [] }, edges, FREEFORM_SPECS["and-gate"]);

  assert.equal(grade.passed, false);
  assert.equal(grade.structuralErrors.some((error) => error.type === "缺少门"), true);
});

test("与门：一根输入没连 → 输出算不出（未知信号）", () => {
  const { nodes, edges } = andGateCircuit({ dropWire: 1 });
  const grade = gradeFreeform({ nodes, requiredEdges: [], testCases: [] }, edges, FREEFORM_SPECS["and-gate"]);

  assert.equal(grade.passed, false);
  assert.equal(grade.cases.some((item) => item.unknown), true, "应存在算不出来的输出");
  assert.match(grade.message, /没算出来|未知信号/);
});

test("结构检查：输出灯数量不足", () => {
  const model = { nodes: [inNode("input-1", 60), gateNode("g", "and", 100, AND_PORTS)], requiredEdges: [], testCases: [] };
  const structure = checkFreeformStructure(model, FREEFORM_SPECS["and-gate"]);

  assert.equal(structure.ok, false);
  assert.equal(structure.errors.some((error) => error.type === "输出不足"), true);
});

test("半加器：xor + and 正确拼装通过（S 与 Cout 都对）", () => {
  const nodes = [
    inNode("input-1", 60, "输入 A"),
    inNode("input-2", 180, "输入 B"),
    gateNode("g-xor", "xor", 100, XOR_PORTS),
    gateNode("g-and", "and", 220, AND_PORTS),
    outNode("output-s", 100, "和位 S"),
    outNode("output-c", 220, "进位 C"),
  ];
  const edges = [
    edge("input-1", "out", "g-xor", "a"), edge("input-2", "out", "g-xor", "b"),
    edge("input-1", "out", "g-and", "a"), edge("input-2", "out", "g-and", "b"),
    edge("g-xor", "s", "output-s", "in"),
    edge("g-and", "c", "output-c", "in"),
  ];
  const grade = gradeFreeform({ nodes, requiredEdges: [], testCases: [] }, edges, FREEFORM_SPECS["half-adder"]);

  assert.equal(grade.passed, true, grade.message);
  assert.equal(grade.cases.length, 4);
  assert.deepEqual(grade.cases.map((item) => item.expected), [[0, 0], [1, 0], [1, 0], [0, 1]]);
});

test("非门：单输入正确拼装通过", () => {
  const nodes = [inNode("input-1", 80, "输入 A"), gateNode("g-not", "not", 80, NOT_PORTS), outNode("output-2", 80, "输出")];
  const edges = [edge("input-1", "out", "g-not", "in"), edge("g-not", "out", "output-2", "in")];
  const grade = gradeFreeform({ nodes, requiredEdges: [], testCases: [] }, edges, FREEFORM_SPECS["not-gate"]);

  assert.equal(grade.passed, true);
  assert.equal(grade.cases.length, 2);
});

test("输入/输出按 y 坐标映射（上=A，下=B）", () => {
  // 交换两个输入的 y：上面的应映射 A
  const nodes = [inNode("input-1", 220, "输入下"), inNode("input-2", 40, "输入上"), gateNode("g", "xor", 130, XOR_PORTS), outNode("output-3", 130, "输出")];
  const edges = [edge("input-1", "out", "g", "b"), edge("input-2", "out", "g", "a"), edge("g", "s", "output-3", "in")];
  const grade = gradeFreeform({ nodes, requiredEdges: [], testCases: [] }, edges, FREEFORM_SPECS["xor-gate"]);

  assert.equal(grade.passed, true, "输入应按 y 顺序映射，接线对应后真值表仍应成立");
});
