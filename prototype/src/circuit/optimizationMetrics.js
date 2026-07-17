import { simulateCircuit } from "./circuitSimulation.js";

/**
 * Multi-Objective Optimization Metrics
 *
 * After a circuit passes all test cases, evaluate its efficiency.
 */

const WEIGHTS = { edges: 0.5, cycles: 0.5 };
const MAX_SCORE = 100;

export function evaluateOptimizationMetrics({ model, studentEdges, referenceEdges }) {
  const reference = referenceEdges ?? model?.requiredEdges ?? [];
  const componentCount = (model?.nodes ?? []).filter((n) => n.type !== "input" && n.type !== "output").length;
  const edgeCount = studentEdges.length;
  const refEdgeCount = reference.length;
  const cycles = countSimulationCycles(model, studentEdges);
  const refCycles = countSimulationCycles(model, reference);
  const edgeScore = ratioScore(edgeCount, refEdgeCount);
  const cycleScore = ratioScore(cycles, refCycles);
  const optimizationScore = Math.round(WEIGHTS.edges * edgeScore + WEIGHTS.cycles * cycleScore);

  return {
    componentCount, edgeCount, refEdgeCount, cycles, refCycles,
    edgeScore, cycleScore, optimizationScore,
    grade: optimizationScore >= 80 ? "最优" : optimizationScore >= 50 ? "良好" : "可优化",
  };
}

export function buildOptimizationReport({ metrics, personalBest }) {
  const report = { metrics, personalBest: personalBest ?? metrics };
  if (personalBest && personalBest.optimizationScore > metrics.optimizationScore) {
    report.message = `最佳 ${personalBest.optimizationScore} 分，当前 ${metrics.optimizationScore} 分。`;
  } else {
    report.message = `${metrics.optimizationScore} / ${MAX_SCORE}（${metrics.grade}）`;
  }
  const suggestions = [];
  if (metrics.edgeCount > metrics.refEdgeCount) suggestions.push(`连线 ${metrics.edgeCount} > 最优 ${metrics.refEdgeCount}，检查多余连线。`);
  if (metrics.cycles > metrics.refCycles) suggestions.push(`周期 ${metrics.cycles} > 最优 ${metrics.refCycles}，简化连接路径。`);
  if (suggestions.length) report.suggestions = suggestions;
  return report;
}

function countSimulationCycles(model, edges) {
  const testCase = model?.testCases?.[0];
  if (!testCase) return 0;
  const sim = simulateCircuit(model, edges, testCase.inputs);
  return sim.steps?.length ?? 0;
}

function ratioScore(value, reference) {
  if (reference === 0) return 0;
  return Math.round(Math.min(100, (reference / Math.max(value, 1)) * 100));
}
