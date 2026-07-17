import test from "node:test";
import assert from "node:assert/strict";
import { createHistory } from "./labHistory.js";

test("push adds snapshot and undo restores previous state", () => {
  const h = createHistory();
  h.push({ connections: ["A->B"], placedComponents: [] });
  h.push({ connections: ["A->B", "C->D"], placedComponents: [{ id: "x", name: "X" }] });
  assert.equal(h.canUndo(), true);
  const prev = h.undo();
  assert.deepEqual(prev.connections, ["A->B"]);
  assert.deepEqual(prev.placedComponents, []);
  assert.equal(h.canRedo(), true);
});

test("redo restores the undone state", () => {
  const h = createHistory();
  h.push({ connections: ["A->B"], placedComponents: [] });
  h.push({ connections: ["C->D"], placedComponents: [] });
  h.undo();
  const next = h.redo();
  assert.deepEqual(next.connections, ["C->D"]);
  assert.equal(h.canRedo(), false);
});

test("pushing after undo clears redo stack", () => {
  const h = createHistory();
  h.push({ connections: ["A"], placedComponents: [] });
  h.push({ connections: ["B"], placedComponents: [] });
  h.undo();
  h.push({ connections: ["C"], placedComponents: [] });
  assert.equal(h.canRedo(), false);
  assert.deepEqual(h.undo().connections, ["A"]);
});

test("empty history has no undo or redo", () => {
  const h = createHistory();
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), null);
});

test("maxDepth limits history size", () => {
  const h = createHistory(3);
  for (let i = 0; i < 10; i++) h.push({ connections: [String(i)], placedComponents: [] });
  assert.equal(h.canUndo(), true);
  // Should only have 3 states + current
  let count = 0;
  while (h.canUndo()) { h.undo(); count++; }
  assert.ok(count <= 3);
});
