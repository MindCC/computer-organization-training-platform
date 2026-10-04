import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMindMap, layoutMindMap, removeMindMapNode, mindMapSvg } from './mindMap.js';

const graph = { title: '存储系统', nodes: [
  { id: 'root', label: '存储系统', parentId: null },
  { id: 'cache', label: 'Cache', parentId: 'root' },
  { id: 'hit', label: '命中率', parentId: 'cache' },
  { id: 'memory', label: '主存', parentId: 'root' },
], relations: [{ id: 'r1', source: 'cache', target: 'memory', label: '交换数据' }] };

test('rejects disconnected, cyclic, duplicate and excessive maps', () => {
  for (const nodes of [
    [{ id: 'a', label: 'a', parentId: 'b' }, { id: 'b', label: 'b', parentId: 'a' }],
    [{ id: 'a', label: 'a' }, { id: 'a', label: 'b', parentId: 'a' }],
    [{ id: 'a', label: 'a' }, { id: 'b', label: 'b', parentId: 'missing' }],
    Array.from({ length: 81 }, (_, i) => ({ id: String(i), label: 'x', parentId: i ? '0' : null })),
  ]) assert.throws(() => normalizeMindMap({ title: 'x', nodes }));
});

test('assigns branch colors, preserves edits and lays out every node without overlap', () => {
  const map = normalizeMindMap(graph);
  assert.equal(map.nodes[1].color, map.nodes[2].color);
  assert.notEqual(map.nodes[1].color, map.nodes[3].color);
  const placed = layoutMindMap(map);
  assert.equal(placed.nodes.length, 4);
  assert.ok(placed.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  const edited = normalizeMindMap({ ...placed, nodes: placed.nodes.map(n => n.id === 'cache' ? { ...n, x: 123, color: '#123456', fontSize: 22 } : n) });
  assert.equal(edited.nodes[1].x, 123);
  assert.equal(edited.nodes[1].fontSize, 22);
  assert.equal(edited.nodes[1].color, '#123456');
});

test('deletes a subtree and all dangling relationships, protects the root', () => {
  const map = normalizeMindMap(graph);
  const next = removeMindMapNode(map, 'cache');
  assert.deepEqual(next.nodes.map(n => n.id), ['root', 'memory']);
  assert.equal(next.relations.length, 0);
  assert.throws(() => removeMindMapNode(map, 'root'));
});

test('exports all nodes and arrows with escaped labels and no active SVG markup', () => {
  const map = layoutMindMap(normalizeMindMap({ ...graph, title: '<script>alert(1)</script>', nodes: graph.nodes.map(n => ({ ...n, label: n.id === 'hit' ? '<img onerror="x"> & 命中率' : n.label })) }));
  const svg = mindMapSvg(map);
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('&lt;img'));
  assert.ok(svg.includes('交换数据'));
  assert.ok(svg.includes('marker-end'));
  assert.ok(!svg.includes('<script>'));
});
