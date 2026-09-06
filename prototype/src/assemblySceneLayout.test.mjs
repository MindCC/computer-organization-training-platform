import test from 'node:test';
import assert from 'node:assert/strict';
import { assemblyCameraPose, nearestAssemblySocket, assemblyLabelVisible, assemblyEntryPosition } from './assemblySceneLayout.js';

test('closeup frames supply and socket; top view stays above the bench', () => {
  const close = assemblyCameraPose('part', [-1.15, -.2, 0], [.3, 0, .2]);
  assert.ok(close.target[0] < .3 && close.target[0] > -1.15);
  assert.ok(close.position[1] > 1);
  assert.ok(assemblyCameraPose('top').position[1] > 3);
});
test('only active socket is labeled at rest, other targets appear during drag', () => {
  assert.equal(assemblyLabelVisible('memory', 'cpu', false), false);
  assert.equal(assemblyLabelVisible('cpu', 'cpu', false), true);
  assert.equal(assemblyLabelVisible('memory', 'cpu', true), true);
});
test('drop accepts nearby target or anchor and rejects empty bench', () => {
  const labels = [{ part: {id:'cpu'}, screen: {x:10,y:10}, anchor: {x:20,y:20} }, { part:{id:'memory'},screen:{x:150,y:20},anchor:{x:160,y:20} }];
  assert.equal(nearestAssemblySocket(labels, 12, 10), 'cpu');
  assert.equal(nearestAssemblySocket(labels, 155, 20), 'memory');
  assert.equal(nearestAssemblySocket(labels, 400, 400), null);
});
test('entry pose aligns CPU vertically and storage along its bay axis', () => {
  assert.deepEqual(assemblyEntryPosition('cpu', [.2, .1, .3]), [.2, .28, .3]);
  assert.deepEqual(assemblyEntryPosition('storage', [.2, .1, .3]), [.2, .1, .55]);
});
