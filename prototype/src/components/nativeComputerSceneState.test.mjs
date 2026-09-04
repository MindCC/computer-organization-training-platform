import test from "node:test";
import assert from "node:assert/strict";
import {
  createResourceRegistry,
  normalizeSceneViewState,
  partPosition,
  screenPointFromNdc,
} from "./nativeComputerSceneState.js";

test("normalizes native scene state without leaking mutable sets", () => {
  const state = normalizeSceneViewState({
    visiblePartIds: ["cpu", "ram-0"],
    explodeDistance: 1.5,
    autoAnimating: false,
    selectedPartId: "cpu",
    xray: true,
    showConnections: true,
  });
  assert.deepEqual([...state.visiblePartIds], ["cpu", "ram-0"]);
  assert.equal(state.targetExplodeDistance, 1.5);
  assert.equal(state.selectedPartId, "cpu");
  assert.equal(state.xray, true);
});

test("auto animation targets the settled 1.3 explosion distance", () => {
  assert.equal(normalizeSceneViewState({ autoAnimating: true }).targetExplodeDistance, 1.3);
});

test("computes an exploded parent position", () => {
  assert.deepEqual(partPosition({ basePos: [1, 2, 3], explodeDir: [0.5, -1, 2] }, 2), [2, 0, 7]);
});

test("projects visible NDC points and hides points outside clip depth", () => {
  assert.deepEqual(screenPointFromNdc({ x: 0, y: 0, z: 0 }, 800, 600), { left: 400, top: 300 });
  assert.equal(screenPointFromNdc({ x: 0, y: 0, z: 2 }, 800, 600), null);
});

test("resource registry disposes unique resources once and is idempotent", () => {
  let disposed = 0;
  const resource = { dispose: () => { disposed += 1; } };
  const registry = createResourceRegistry();
  registry.add(resource);
  registry.add(resource);
  registry.dispose();
  registry.dispose();
  assert.equal(disposed, 1);
});
