import test from 'node:test';
import assert from 'node:assert/strict';
import { installPart, reconcileInstallation, assemblyCheck, assemblySignature } from './hardwareAssembly.js';

const selection = { cpu: 'cpu-i3', memory: 'mem-8', storage: 'ssd-512', gpu: 'gpu-integrated' };
test('wrong socket never installs a part', () => {
  const result = installPart({}, selection, 'cpu', 'memory');
  assert.equal(result.ok, false);
  assert.deepEqual(result.installed, {});
});
test('installation records the selected variant and requires an actual known part', () => {
  assert.deepEqual(installPart({}, selection, 'cpu', 'cpu').installed, { cpu: 'cpu-i3' });
  assert.equal(installPart({}, { ...selection, cpu: 'bogus' }, 'cpu', 'cpu').ok, false);
  assert.equal(installPart({}, selection, 'gpu', 'gpu').ok, false);
});
test('integrated graphics needs no physical card; discrete graphics does', () => {
  const installed = { cpu: 'cpu-i3', memory: 'mem-8', storage: 'ssd-512' };
  assert.equal(assemblyCheck(installed, selection).ready, true);
  assert.deepEqual(assemblyCheck(installed, { ...selection, gpu: 'gpu-entry' }).missing, ['gpu']);
});
test('changing configuration invalidates installed variant and boot fingerprint', () => {
  const installed = { cpu: 'cpu-i3', memory: 'mem-8', storage: 'ssd-512' };
  const changed = { ...selection, memory: 'mem-16' };
  assert.deepEqual(reconcileInstallation(installed, changed), { cpu: 'cpu-i3', storage: 'ssd-512' });
  assert.notEqual(assemblySignature(installed, selection), assemblySignature(installed, changed));
  assert.equal(assemblyCheck(installed, changed).ready, false);
});
test('removal prevents boot; invalid selections cannot pass POST', () => {
  assert.deepEqual(assemblyCheck({ cpu: 'cpu-i3' }, selection).missing, ['memory', 'storage']);
  assert.equal(assemblyCheck({}, {}).ready, false);
});
