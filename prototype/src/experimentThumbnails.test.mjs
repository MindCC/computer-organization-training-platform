import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARNING_ITEMS } from './platformLogic.js';
import { COURSEWARE } from './courseware.js';
import { CIRCUIT_CHALLENGES } from './circuit/challengeCircuitModel.js';
import { HARDWARE_GAME_CASES } from './hardwareGame.js';
import { thumbnailForExperiment, thumbnailForDemo } from './experimentThumbnails.js';

test('全部30电路与6硬件实验使用各自真实模型的缩略图', () => {
  assert.equal(LEARNING_ITEMS.length, 36);
  for (const item of LEARNING_ITEMS) {
    const thumbnail = thumbnailForExperiment(item.id);
    assert.ok(thumbnail, item.id);
    assert.equal(thumbnail.id, item.id);
    assert.ok(thumbnail.description.length > 5);
    if (thumbnail.kind === 'circuit') {
      const circuit = CIRCUIT_CHALLENGES.find(candidate => candidate.id === item.id);
      assert.deepEqual(thumbnail.nodes.map(node => node.id), circuit.nodes.map(node => node.id));
      assert.deepEqual(thumbnail.edges, circuit.requiredEdges);
      assert.deepEqual(thumbnail.sample, circuit.testCases.at(-1));
    } else {
      const hardware = HARDWARE_GAME_CASES.find(candidate => candidate.id === item.id);
      assert.deepEqual(thumbnail.targets, hardware.targets);
    }
  }
  assert.equal(thumbnailForExperiment('unknown'), null);
});

test('每个章节演示的内容与独立缩略图一致，运算方法全部属于第二章', () => {
  for (const chapter of COURSEWARE.chapters) {
    assert.ok(chapter.demos.length);
    for (const demo of chapter.demos) {
      const thumbnail = thumbnailForDemo(demo.href);
      assert.ok(thumbnail, demo.href);
      assert.equal(thumbnail.chapterId, chapter.id);
      assert.ok(thumbnail.nodes.length >= 3);
      assert.ok(thumbnail.edges.length >= 2);
      assert.ok(thumbnail.description.length > 5);
    }
  }
  assert.equal(thumbnailForDemo('/demos/alu.html').chapterId, 'ch2');
  assert.match(thumbnailForDemo('/demos/adder-alu.html').description, /半加器.*全加器/);
  assert.equal(thumbnailForDemo('/demos/missing.html'), null);
});

test('缩略图保留教学信号，避免将寄存器次态图当作真实时序硬件', () => {
  assert.match(thumbnailForExperiment('register-enable').description, /次态|下一/);
  const adder = thumbnailForDemo('adder-alu');
  assert.equal(adder.sampleLabel, '1 + 1 + 1 = 11₂');
  const arithmetic = thumbnailForDemo('arithmetic-basics');
  assert.equal(arithmetic.sampleLabel, '−5 的 4 位补码：1011');
});
