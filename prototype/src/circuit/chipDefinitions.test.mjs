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
