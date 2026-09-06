import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assemblyDraftKey,
  loadAssemblyDraft,
  readAssemblyDraftSelection,
  saveAssemblyDraft,
} from './assemblyDraft.js';

const selection = {
  cpu: 'cpu-i5',
  memory: 'mem-16',
  storage: 'ssd-512',
  gpu: 'gpu-entry',
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('draft keys isolate users and orders', () => {
  assert.equal(assemblyDraftKey(2, 'order-1'), assemblyDraftKey('2', 'order-1'));
  assert.notEqual(assemblyDraftKey('student-a', 'order-1'), assemblyDraftKey('student-b', 'order-1'));
  assert.notEqual(assemblyDraftKey('student-a', 'order-1'), assemblyDraftKey('student-a', 'order-2'));
  assert.equal(assemblyDraftKey('', 'order-1'), null);
  assert.equal(assemblyDraftKey('student-a', null), null);
});

test('saved draft restores only installed parts that still match the selected variants', () => {
  const storage = memoryStorage();
  const key = assemblyDraftKey('student-a', 'order-1');
  const installed = { cpu: 'cpu-i5', memory: 'mem-16', storage: 'ssd-512', gpu: 'gpu-entry' };
  assert.equal(saveAssemblyDraft(storage, key, installed, selection), true);

  const changedSelection = { ...selection, cpu: 'cpu-i7' };
  assert.deepEqual(loadAssemblyDraft(storage, key, changedSelection), {
    memory: 'mem-16',
    storage: 'ssd-512',
    gpu: 'gpu-entry',
  });
});

test('saved payload contains only canonical version, selection, and installed state', () => {
  const storage = memoryStorage();
  const key = assemblyDraftKey('student-a', 'order-1');
  saveAssemblyDraft(storage, key, { cpu: 'cpu-i5', boot: 'passed' }, { ...selection, boot: true });

  const payload = JSON.parse(storage.getItem(key));
  assert.deepEqual(Object.keys(payload).sort(), ['installed', 'selection', 'version']);
  assert.deepEqual(payload.selection, selection);
  assert.deepEqual(payload.installed, { cpu: 'cpu-i5' });
  assert.equal(payload.boot, undefined);
});

test('selection restore accepts exactly four known hardware variants', () => {
  const storage = memoryStorage();
  const key = assemblyDraftKey('student-a', 'order-1');
  saveAssemblyDraft(storage, key, {}, selection);
  assert.deepEqual(readAssemblyDraftSelection(storage, key, {}), selection);

  storage.setItem(key, JSON.stringify({ version: 1, selection: { ...selection, gpu: 'gpu-unknown' }, installed: {} }));
  const fallback = { cpu: 'cpu-i3', memory: 'mem-8', storage: 'hdd-1tb', gpu: 'gpu-integrated' };
  assert.deepEqual(readAssemblyDraftSelection(storage, key, fallback), fallback);
});

test('corrupt, unknown-schema, null, and blocked storage inputs fail safely', () => {
  const storage = memoryStorage();
  storage.setItem('corrupt', '{');
  storage.setItem('future', JSON.stringify({ version: 2, selection, installed: { cpu: 'cpu-i5' } }));
  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };

  assert.deepEqual(loadAssemblyDraft(storage, 'corrupt', selection), {});
  assert.deepEqual(loadAssemblyDraft(storage, 'future', selection), {});
  assert.deepEqual(loadAssemblyDraft(null, null, selection), {});
  assert.deepEqual(loadAssemblyDraft(blocked, 'draft', selection), {});
  assert.deepEqual(readAssemblyDraftSelection(storage, 'corrupt', selection), selection);
  assert.deepEqual(readAssemblyDraftSelection(blocked, 'draft', selection), selection);
  assert.equal(saveAssemblyDraft(blocked, 'draft', {}, selection), false);
  assert.equal(saveAssemblyDraft(null, null, {}, selection), false);
});

test('unknown installed variants and boot results are never restored', () => {
  const storage = memoryStorage();
  const key = assemblyDraftKey('student-a', 'order-1');
  storage.setItem(key, JSON.stringify({
    version: 1,
    selection,
    installed: { cpu: 'cpu-unknown', memory: 'mem-16' },
    boot: { passed: true, score: 100 },
  }));

  assert.deepEqual(loadAssemblyDraft(storage, key, selection), { memory: 'mem-16' });
});
