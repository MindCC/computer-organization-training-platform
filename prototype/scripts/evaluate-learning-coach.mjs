import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { FULL_ADDER_CIRCUIT } from '../src/circuit/challengeCircuitModel.js';
import { inspectAdder, planCoachIntervention, COACH_SOURCES } from '../server/learningCoach.js';

// Synthetic fault injections, not real learner cases or teacher-reviewed gold data.
// Labels follow branch ownership, independent of the diagnostic's simulation output.
const edges = FULL_ADDER_CIRCUIT.requiredEdges;
const branch = edge => {
  if (edge.to.nodeId === 'xor-1') return 'shared';
  if (['xor-2', 'sum-output'].includes(edge.to.nodeId)) return 'sum';
  return 'carry';
};
const fixtures = [{ id: 'correct', removed: [], expectedFocus: 'transfer', expectedPassed: true }];
function add(indices) {
  const branches = new Set(indices.map(i => branch(edges[i])));
  fixtures.push({ id: 'missing-' + indices.join('-'), removed: indices, expectedFocus: branches.has('shared') || branches.size > 1 ? 'wiring' : [...branches][0], expectedPassed: false });
}
for (let i = 0; i < edges.length; i++) add([i]);
for (let i = 0; i < edges.length && fixtures.length < 50; i++) for (let j = i + 1; j < edges.length && fixtures.length < 50; j++) add([i, j]);
const rows = [];
for (const fixture of fixtures) {
  const start = performance.now(), circuitEdges = edges.filter((_, i) => !fixture.removed.includes(i));
  const report = inspectAdder({ circuitEdges });
  const plan = await planCoachIntervention(report, COACH_SOURCES);
  rows.push({ ...fixture, actualFocus: report.focus, actualPassed: report.passed, correct: fixture.expectedFocus === report.focus && fixture.expectedPassed === report.passed, allInputsChecked: report.cases.length === 8, validSourceIds: plan.references.every(ref => COACH_SOURCES.some(source => source.id === ref.id)), elapsedMs: performance.now() - start });
}
const sorted = rows.map(row => row.elapsedMs).sort((a, b) => a - b);
const result = { kind: 'synthetic-technical-regression', reviewedByTeacher: false, classroomEvidence: false, externalAiCalled: false, generatedAt: new Date().toISOString(), cases: rows.length, correct: rows.filter(row => row.correct).length, allInputsChecked: rows.every(row => row.allInputsChecked), validSourceIds: rows.every(row => row.validSourceIds), p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], rows };
mkdirSync('qa-artifacts', { recursive: true });
writeFileSync('qa-artifacts/learning-coach-evaluation.json', JSON.stringify(result, null, 2));
writeFileSync('qa-artifacts/learning-coach-cases.json', JSON.stringify({ description: '合成断线案例；用于技术回归，待教师审核和真实课堂案例补充。', fixtures }, null, 2));
console.log(JSON.stringify({ kind: result.kind, cases: result.cases, correct: result.correct, allInputsChecked: result.allInputsChecked, validSourceIds: result.validSourceIds, p95Ms: result.p95Ms, externalAiCalled: false }, null, 2));
assert.equal(result.correct, result.cases); assert.ok(result.allInputsChecked && result.validSourceIds);
if (process.argv.includes('--live-ai')) {
  // Only public synthetic evidence; never reads the classroom database.
  const plan = await planCoachIntervention(inspectAdder({ circuitEdges: [] }), COACH_SOURCES, 'selected-circuit-evidence', { env: process.env });
  writeFileSync('qa-artifacts/learning-coach-live-ai.json', JSON.stringify({ publicSyntheticInput: true, ...plan }, null, 2));
  console.log(JSON.stringify({ liveAiSource: plan.source, reason: plan.reason, tools: plan.trace.map(step => ({ tool: step.tool, status: step.status })) }, null, 2));
}
