import { buildCircuitModelIndex, portKey } from "./challengeCircuitModel.js";
import { validateCircuitStructure } from "./circuitValidation.js";

const UNKNOWN = "unknown";
const ERROR = "error";

function normalizeSignal(value) {
  if (value === 0 || value === 1) return value;
  if (value === false) return 0;
  if (value === true) return 1;
  if (Number.isFinite(Number(value))) return Number(value);
  return UNKNOWN;
}

function hasUnknown(...values) {
  return values.some((value) => value === UNKNOWN || value === ERROR);
}

function readInput(values, nodeId, portId) {
  return values.get(portKey(nodeId, portId)) ?? UNKNOWN;
}

function writeOutput(values, nodeId, portId, value) {
  values.set(portKey(nodeId, portId), value);
}

function computeNode(node, values) {
  if (node.type === "input" || node.type === "output") return;

  if (node.type === "buffer") {
    writeOutput(values, node.id, "out", readInput(values, node.id, "in"));
    return;
  }

  if (node.type === "xor") {
    const a = readInput(values, node.id, "a");
    const b = readInput(values, node.id, "b");
    writeOutput(values, node.id, "s", hasUnknown(a, b) ? UNKNOWN : (a & 1) ^ (b & 1));
    return;
  }

  if (node.type === "and") {
    const a = readInput(values, node.id, "a");
    const b = readInput(values, node.id, "b");
    writeOutput(values, node.id, "c", hasUnknown(a, b) ? UNKNOWN : (a & 1) & (b & 1));
    return;
  }

  if (node.type === "or") {
    const a = readInput(values, node.id, "a");
    const b = readInput(values, node.id, "b");
    writeOutput(values, node.id, "out", hasUnknown(a, b) ? UNKNOWN : (a & 1) | (b & 1));
    return;
  }

  if (node.type === "not") {
    const input = readInput(values, node.id, "in");
    writeOutput(values, node.id, "out", input === UNKNOWN ? UNKNOWN : (input & 1) ^ 1);
    return;
  }

  if (node.type === "fullAdder") {
    const a = readInput(values, node.id, "a");
    const b = readInput(values, node.id, "b");
    const cin = readInput(values, node.id, "cin");
    if (hasUnknown(a, b, cin)) {
      writeOutput(values, node.id, "sum", UNKNOWN);
      writeOutput(values, node.id, "cout", UNKNOWN);
      return;
    }
    const total = (a & 1) + (b & 1) + (cin & 1);
    writeOutput(values, node.id, "sum", total & 1);
    writeOutput(values, node.id, "cout", total > 1 ? 1 : 0);
    return;
  }

  if (node.type === "mux2") {
    const d0 = readInput(values, node.id, "d0");
    const d1 = readInput(values, node.id, "d1");
    const sel = readInput(values, node.id, "sel");
    writeOutput(values, node.id, "y", hasUnknown(d0, d1, sel) ? UNKNOWN : ((sel & 1) === 0 ? d0 : d1));
    return;
  }

  if (node.type === "alu1") {
    const a = readInput(values, node.id, "a");
    const b = readInput(values, node.id, "b");
    const cin = readInput(values, node.id, "cin");
    const op = readInput(values, node.id, "op");
    if (hasUnknown(a, b, cin, op)) {
      writeOutput(values, node.id, "f", UNKNOWN);
      writeOutput(values, node.id, "zero", UNKNOWN);
      writeOutput(values, node.id, "carry", UNKNOWN);
      return;
    }

    const operation = op % 4;
    const add = (a & 1) + (b & 1) + (cin & 1);
    const resultMap = [add & 1, (a & 1) & (b & 1), (a & 1) | (b & 1), (a & 1) ^ (b & 1)];
    const result = resultMap[operation];
    writeOutput(values, node.id, "f", result);
    writeOutput(values, node.id, "zero", result === 0 ? 1 : 0);
    writeOutput(values, node.id, "carry", operation === 0 && add > 1 ? 1 : 0);
  }
}

function propagateEdges(values, edges) {
  let changed = false;

  for (const edge of edges) {
    const fromKey = portKey(edge.from.nodeId, edge.from.portId);
    const toKey = portKey(edge.to.nodeId, edge.to.portId);
    const nextValue = values.get(fromKey) ?? UNKNOWN;
    if (values.get(toKey) !== nextValue) {
      values.set(toKey, nextValue);
      changed = true;
    }
  }

  return changed;
}

export function simulateCircuit(model, studentEdges, inputs = {}) {
  const structure = validateCircuitStructure(model, studentEdges);
  if (structure.invalidEdges.length > 0) {
    return { status: ERROR, errors: structure.errors, values: {}, steps: [] };
  }

  const index = buildCircuitModelIndex(model);
  const values = new Map();
  const steps = [];

  for (const key of index.ports.keys()) {
    values.set(key, UNKNOWN);
  }

  for (const node of model.nodes) {
    if (node.type !== "input") continue;
    for (const port of node.ports.filter((item) => item.direction === "out")) {
      const key = portKey(node.id, port.id);
      values.set(key, normalizeSignal(inputs[key]));
      steps.push({ type: "input", nodeId: node.id, portId: port.id, value: values.get(key) });
    }
  }

  const maxIterations = Math.max(4, model.nodes.length * 2);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const before = new Map(values);
    propagateEdges(values, studentEdges);

    for (const node of model.nodes) {
      computeNode(node, values);
    }

    propagateEdges(values, studentEdges);

    const changed = [...values.entries()].some(([key, value]) => before.get(key) !== value);
    steps.push({ type: "propagate", iteration, values: Object.fromEntries(values) });
    if (!changed) break;
  }

  return { status: "ok", errors: structure.errors, values: Object.fromEntries(values), steps };
}

export function runCircuitTestCases(model, studentEdges) {
  const cases = (model?.testCases ?? []).map((testCase) => {
    const simulation = simulateCircuit(model, studentEdges, testCase.inputs);
    const mismatches = Object.entries(testCase.expected).filter(([key, expected]) => simulation.values[key] !== expected);

    return {
      name: testCase.name,
      passed: simulation.status === "ok" && mismatches.length === 0,
      expected: testCase.expected,
      actual: Object.fromEntries(Object.keys(testCase.expected).map((key) => [key, simulation.values[key] ?? UNKNOWN])),
      mismatches,
    };
  });

  return { passed: cases.every((testCase) => testCase.passed), cases };
}
