import test from "node:test";
import assert from "node:assert/strict";
import { HALF_ADDER_CIRCUIT } from "./challengeCircuitModel.js";
import { evaluateOptimizationMetrics, buildOptimizationReport } from "./optimizationMetrics.js";

test("optimal reference edges get maximum score", () => {
  const metrics = evaluateOptimizationMetrics({
    model: HALF_ADDER_CIRCUIT,
    studentEdges: HALF_ADDER_CIRCUIT.requiredEdges,
  });
  assert.equal(metrics.edgeCount, 6);
  assert.equal(metrics.edgeScore, 100);
  assert.equal(metrics.cycleScore, 100);
  assert.equal(metrics.optimizationScore, 100);
  assert.equal(metrics.grade, "最优");
});

test("suboptimal circuit gets lower score", () => {
  // Add extra redundant edges
  const extraEdges = [
    ...HALF_ADDER_CIRCUIT.requiredEdges,
    { from: { nodeId: "input-a", portId: "out" }, to: { nodeId: "carry-output", portId: "in" } },
  ];
  const metrics = evaluateOptimizationMetrics({
    model: HALF_ADDER_CIRCUIT,
    studentEdges: extraEdges,
  });
  assert.ok(metrics.edgeCount > metrics.refEdgeCount);
  assert.ok(metrics.optimizationScore < 100);
});

test("buildOptimizationReport includes suggestions for suboptimal circuits", () => {
  const extraEdges = [
    ...HALF_ADDER_CIRCUIT.requiredEdges,
    { from: { nodeId: "input-a", portId: "out" }, to: { nodeId: "carry-output", portId: "in" } },
  ];
  const metrics = evaluateOptimizationMetrics({
    model: HALF_ADDER_CIRCUIT,
    studentEdges: extraEdges,
  });
  const report = buildOptimizationReport({ metrics });
  assert.ok(report.suggestions.length > 0);
  assert.ok(report.suggestions[0].includes("连线"));
});

test("buildOptimizationReport compares with personal best", () => {
  const metrics = evaluateOptimizationMetrics({
    model: HALF_ADDER_CIRCUIT,
    studentEdges: HALF_ADDER_CIRCUIT.requiredEdges,
  });
  const better = { ...metrics, optimizationScore: 95 };
  const report = buildOptimizationReport({ metrics: better, personalBest: metrics });
  assert.match(report.message, /100/); // personalBest was 100
});
