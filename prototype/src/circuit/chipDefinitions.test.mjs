import test from "node:test";
import assert from "node:assert/strict";
import { CHIP_DEFINITIONS, getUnlockedChips, buildChipPalette } from "./chipDefinitions.js";
import { simulateCircuit } from "./circuitSimulation.js";

test("CHIP_DEFINITIONS has entries for all basic gate/addder challenges", () => {
  const ids = Object.keys(CHIP_DEFINITIONS);
  assert.ok(ids.includes("half-adder"));
  assert.ok(ids.includes("full-adder"));
  assert.ok(ids.includes("and-gate"));
  assert.ok(ids.includes("or-gate"));
  assert.ok(ids.includes("xor-gate"));
});

test("getUnlockedChips returns only completed challenges", () => {
  const progress = {
    "half-adder": { status: "completed", bestScore: 100 },
    "full-adder": { status: "in-progress", bestScore: 0 },
    "and-gate": { status: "completed", bestScore: 100 },
  };
  const chips = getUnlockedChips(progress);
  assert.equal(chips.length, 2);
  assert.ok(chips.some((c) => c.id === "half-adder"));
  assert.ok(chips.some((c) => c.id === "and-gate"));
  assert.equal(chips.some((c) => c.id === "full-adder"), false);
});

test("getUnlockedChips returns empty for no progress", () => {
  assert.deepEqual(getUnlockedChips({}), []);
  assert.deepEqual(getUnlockedChips(null), []);
});

test("buildChipPalette creates palette entries from unlocked chips", () => {
  const chips = [CHIP_DEFINITIONS["half-adder"], CHIP_DEFINITIONS["and-gate"]];
  const palette = buildChipPalette(chips);
  assert.equal(palette.length, 2);
  assert.equal(palette[0].id, "chip:half-adder");
  assert.equal(palette[0].displayLabel, "半加器");
  assert.equal(palette[0].isChip, true);
});

/**
 * 每个芯片的端口 id 必须与仿真函数真正读取的入参一致（历史上 not-gate 端口叫 in、
 * 仿真却读 inp，导致芯片恒输出 1）。这里用真值表从仿真函数本身出发覆盖：
 * - 输入向量按端口 id 构造，覆盖 0/1 全组合；
 * - 输出按端口 id 断言，任何一个输出未定义或算错都会失败。
 */
const CHIP_TRUTH_TABLES = {
  "half-adder": {
    inputs: ["a", "b"],
    outputs: {
      sum: (a, b) => ((a + b) & 1),
      carry: (a, b) => (a + b > 1 ? 1 : 0),
    },
  },
  "full-adder": {
    inputs: ["a", "b", "cin"],
    outputs: {
      sum: (a, b, cin) => ((a + b + cin) & 1),
      cout: (a, b, cin) => (a + b + cin > 1 ? 1 : 0),
    },
  },
  "and-gate": { inputs: ["a", "b"], outputs: { c: (a, b) => a & b } },
  "or-gate": { inputs: ["a", "b"], outputs: { out: (a, b) => a | b } },
  "xor-gate": { inputs: ["a", "b"], outputs: { s: (a, b) => a ^ b } },
  "not-gate": { inputs: ["in"], outputs: { out: (a) => (a ? 0 : 1) } },
};

function inputCombinations(ids) {
  const combinations = [[]];
  for (const id of ids) {
    const next = [];
    for (const prefix of combinations) {
      for (const value of [0, 1]) next.push([...prefix, value]);
    }
    combinations.length = 0;
    combinations.push(...next);
  }
  return combinations.map((values) => Object.fromEntries(ids.map((id, index) => [id, values[index]])));
}

test("每个芯片的仿真都对端口 id 对应的真值表成立", () => {
  for (const [chipId, table] of Object.entries(CHIP_TRUTH_TABLES)) {
    const chip = CHIP_DEFINITIONS[chipId];
    assert.ok(chip, `${chipId} 芯片未定义`);

    const inputPortIds = chip.ports.filter((port) => port.direction === "in").map((port) => port.id);
    assert.deepEqual([...inputPortIds].sort(), [...table.inputs].sort(), `${chipId} 输入端口应与真值表一致`);

    for (const inputs of inputCombinations(table.inputs)) {
      const outputs = chip.simulation(inputs);
      for (const [outId, expected] of Object.entries(table.outputs)) {
        const expectedValue = expected(...table.inputs.map((id) => inputs[id]));
        assert.equal(
          outputs[outId],
          expectedValue,
          `${chipId} 在 ${JSON.stringify(inputs)} 下 ${outId} 应为 ${expectedValue}，实际 ${outputs[outId]}`,
        );
      }
    }
  }
});

test("芯片端口声明的输出与仿真返回值一一对应", () => {
  for (const chip of Object.values(CHIP_DEFINITIONS)) {
    const inputPortIds = chip.ports.filter((port) => port.direction === "in").map((port) => port.id);
    const outputPortIds = chip.ports.filter((port) => port.direction === "out").map((port) => port.id);
    const outputs = chip.simulation(Object.fromEntries(inputPortIds.map((id) => [id, 1])));
    for (const outputId of outputPortIds) {
      assert.notEqual(outputs[outputId], undefined, `${chip.id} 的 ${outputId} 没有仿真返回值`);
      assert.equal(Number.isFinite(outputs[outputId]), true, `${chip.id} 的 ${outputId} 应为有限数值`);
    }
  }
});

test("非门芯片在电路里对输入取反", () => {
  const circuit = {
    id: "test-chip-not",
    nodes: [
      { id: "a", type: "input", label: "A", ports: [{ id: "out", label: "A", direction: "out", signal: "bit" }] },
      { id: "not1", type: "chip:not-gate", label: "非门", ports: [
        { id: "in", label: "A", direction: "in" },
        { id: "out", label: "Y", direction: "out" },
      ] },
      { id: "y", type: "output", label: "Y", ports: [{ id: "in", label: "Y", direction: "in", signal: "bit" }] },
    ],
    requiredEdges: [],
    testCases: [],
  };
  const edges = [
    { from: { nodeId: "a", portId: "out" }, to: { nodeId: "not1", portId: "in" } },
    { from: { nodeId: "not1", portId: "out" }, to: { nodeId: "y", portId: "in" } },
  ];

  assert.equal(simulateCircuit(circuit, edges, { "a.out": 0 }).values["y.in"], 1);
  assert.equal(simulateCircuit(circuit, edges, { "a.out": 1 }).values["y.in"], 0);
});

test("chip node simulation works in a circuit", () => {
  // Build a simple circuit using a half-adder chip
  const circuit = {
    id: "test-chip-circuit",
    nodes: [
      { id: "a", type: "input", label: "A", ports: [{ id: "out", label: "A", direction: "out", signal: "bit" }] },
      { id: "b", type: "input", label: "B", ports: [{ id: "out", label: "B", direction: "out", signal: "bit" }] },
      { id: "ha1", type: "chip:half-adder", label: "半加器", ports: [
        { id: "a", label: "A", direction: "in" }, { id: "b", label: "B", direction: "in" },
        { id: "sum", label: "S", direction: "out" }, { id: "carry", label: "C", direction: "out" },
      ]},
      { id: "s", type: "output", label: "和", ports: [{ id: "in", label: "S", direction: "in", signal: "bit" }] },
      { id: "c", type: "output", label: "进位", ports: [{ id: "in", label: "C", direction: "in", signal: "bit" }] },
    ],
    requiredEdges: [],
    testCases: [],
  };
  const edges = [
    { from: { nodeId: "a", portId: "out" }, to: { nodeId: "ha1", portId: "a" } },
    { from: { nodeId: "b", portId: "out" }, to: { nodeId: "ha1", portId: "b" } },
    { from: { nodeId: "ha1", portId: "sum" }, to: { nodeId: "s", portId: "in" } },
    { from: { nodeId: "ha1", portId: "carry" }, to: { nodeId: "c", portId: "in" } },
  ];

  // 1 + 0 = 1, carry 0
  const result = simulateCircuit(circuit, edges, { "a.out": 1, "b.out": 0 });
  assert.equal(result.status, "ok");
  assert.equal(result.values["s.in"], 1);
  assert.equal(result.values["c.in"], 0);

  // 1 + 1 = 0, carry 1
  const result2 = simulateCircuit(circuit, edges, { "a.out": 1, "b.out": 1 });
  assert.equal(result2.values["s.in"], 0);
  assert.equal(result2.values["c.in"], 1);
});

test("chip node outputs unknown when inputs are missing", () => {
  const circuit = {
    id: "test-chip-missing",
    nodes: [
      { id: "a", type: "input", label: "A", ports: [{ id: "out", label: "A", direction: "out", signal: "bit" }] },
      { id: "ha1", type: "chip:half-adder", label: "半加器", ports: [
        { id: "a", label: "A", direction: "in" }, { id: "b", label: "B", direction: "in" },
        { id: "sum", label: "S", direction: "out" }, { id: "carry", label: "C", direction: "out" },
      ]},
      { id: "s", type: "output", label: "和", ports: [{ id: "in", label: "S", direction: "in", signal: "bit" }] },
    ],
  };
  const edges = [
    { from: { nodeId: "a", portId: "out" }, to: { nodeId: "ha1", portId: "a" } },
    { from: { nodeId: "ha1", portId: "sum" }, to: { nodeId: "s", portId: "in" } },
  ];
  const result = simulateCircuit(circuit, edges, { "a.out": 1 });
  assert.equal(result.values["s.in"], "unknown"); // B not connected
});
