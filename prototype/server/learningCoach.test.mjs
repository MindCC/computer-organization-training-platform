import test from 'node:test';
import assert from 'node:assert/strict';
import { FULL_ADDER_CIRCUIT } from '../src/circuit/challengeCircuitModel.js';
import { inspectAdder, buildCoachHints, gradeTransferAnswers, planCoachIntervention, COACH_SOURCES } from './learningCoach.js';

test('diagnosis recomputes every input and separates carry evidence from hypotheses', () => {
  const edges = FULL_ADDER_CIRCUIT.requiredEdges.filter(e => !(e.from.nodeId === 'input-cin' && e.to.nodeId === 'carry-cin'));
  const report = inspectAdder({ circuitEdges: edges, passed: true, score: 100 });
  assert.equal(report.passed, false);
  assert.equal(report.cases.length, 8);
  assert.equal(report.focus, 'carry');
  assert.ok(report.cases.some(row => row.actual.Cout === 'unknown'));
  assert.match(report.hypothesis, /可能/);
  assert.equal(inspectAdder({ circuitEdges: FULL_ADDER_CIRCUIT.requiredEdges }).passed, true);
  assert.throws(() => inspectAdder({ circuitEdges: [{ from: {}, to: {} }] }), /证据/);
});

test('freeform equivalent circuits pass without reference-edge matching and arbitrary labels are stripped', () => {
  let input = 0, output = 0;
  const circuitNodes = FULL_ADDER_CIRCUIT.nodes.map(node => ({ ...node, label: 'private-label', ioIndex: node.type === 'input' ? input++ : node.type === 'output' ? output++ : undefined }));
  const circuitEdges = FULL_ADDER_CIRCUIT.requiredEdges.map(edge => ({ from: { ...edge.from, nodeId: edge.from.nodeId === 'input-a' ? 'input-b' : edge.from.nodeId === 'input-b' ? 'input-a' : edge.from.nodeId }, to: edge.to }));
  const report = inspectAdder({ mode: 'freeform', circuitNodes, circuitEdges });
  assert.equal(report.passed, true);
  assert.ok(!JSON.stringify(report).includes('private-label'));
});

test('bounded planner runs actual source/intervention tools, verifies citations and protects private data', async () => {
  const report = inspectAdder({ circuitEdges: [], username: 'PRIVATE', grades: 'PRIVATE' });
  const requests = [], env = { DEEPSEEK_API_KEY: 'test-key' };
  const requester = async (_config, messages) => {
    requests.push(JSON.stringify(messages));
    return JSON.stringify(requests.length === 1 ? { tool: 'lookup_course_sources', args: { sourceIds: ['adder-meaning-v1'] } } : { tool: 'propose_remediation', args: { sourceIds: ['adder-meaning-v1'], explanation: '先区分和位和进位，再对照失败输入逐段检查信号。' } });
  };
  assert.equal((await planCoachIntervention(report, COACH_SOURCES, undefined, { env, requester })).source, 'local');
  assert.equal(requests.length, 0);
  const plan = await planCoachIntervention(report, COACH_SOURCES, 'selected-circuit-evidence', { env, requester });
  assert.equal(plan.source, 'ai');
  assert.deepEqual(plan.trace.map(row => row.tool), ['inspect_circuit', 'lookup_course_sources', 'propose_remediation']);
  assert.ok(requests.every(request => !request.includes('PRIVATE') && !request.includes('circuitEdges')));
  const fallback = await planCoachIntervention(report, COACH_SOURCES, 'selected-circuit-evidence', { env, requester: async () => '{"tool":"write_grade","args":{"score":100}}' });
  assert.equal(fallback.source, 'local');
  assert.ok(fallback.trace.some(row => row.status === 'fallback'));
  for (const first of [{ tool: 'lookup_course_sources', args: { sourceIds: ['invented-citation'] } }, { tool: 'lookup_course_sources', args: { sourceIds: [] } }]) {
    assert.equal((await planCoachIntervention(report, COACH_SOURCES, 'selected-circuit-evidence', { env, requester: async () => JSON.stringify(first) })).source, 'local');
  }
});
test('lower hint tiers do not disclose wiring; level four is an explicit reference', () => {
  const report = inspectAdder({ circuitEdges: [] });
  const hints = buildCoachHints(report);
  assert.equal(hints.length, 4);
  assert.ok(!hints[0].detail.includes('→'));
  assert.ok(!hints[1].detail.includes('→'));
  assert.match(hints[3].title, /参考/);
  const incomplete = inspectAdder({ mode: 'freeform', circuitNodes: [{ id: 'input-1', type: 'input', position: { x: 0, y: 0 }, ioIndex: 0 }], circuitEdges: [] });
  assert.equal(incomplete.passed, false); assert.equal(incomplete.cases.length, 0);
  assert.match(buildCoachHints(incomplete)[1].detail, /结构问题/);
  assert.ok(!buildCoachHints(incomplete)[1].detail.includes('全部输入通过'));
});
test('server grades transfer independently of client score and reports evidence per item', () => {
  const questions = [{ id: 'q1', width: 1, a: 1, b: 1, cin: 1 }, { id: 'q2', width: 2, a: 3, b: 2, cin: 1 }];
  assert.equal(gradeTransferAnswers(questions, { q1: [1, 1], q2: [2, 1] }).passed, true);
  const result = gradeTransferAnswers(questions, { q1: [0, 1], q2: [2, 1], score: 100 });
  assert.equal(result.passed, false);
  assert.equal(result.correct, 1);
  assert.throws(() => gradeTransferAnswers(questions, { q1: [1, 1] }), /完成/);
});
