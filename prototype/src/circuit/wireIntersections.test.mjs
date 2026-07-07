import test from "node:test";
import assert from "node:assert/strict";
import { findWireBridgeMarkers } from "./wireIntersections.js";

const nodes = [
  { id: "a", position: { x: 0, y: 0 } },
  { id: "b", position: { x: 100, y: 100 } },
  { id: "c", position: { x: 0, y: 100 } },
  { id: "d", position: { x: 100, y: 0 } },
  { id: "e", position: { x: 180, y: 0 } },
];

test("marks visual crossings between unrelated wires", () => {
  const markers = findWireBridgeMarkers([
    { id: "ab", source: "a", target: "b" },
    { id: "cd", source: "c", target: "d" },
  ], nodes);

  assert.equal(markers.length, 2);
  assert.deepEqual(markers.map((item) => item.edgeId).sort(), ["ab", "cd"]);
  assert.ok(Math.abs(markers[0].x - 50) <= 1);
  assert.ok(Math.abs(markers[0].y - 50) <= 1);
});

test("does not mark wires that share an endpoint as a crossing", () => {
  const markers = findWireBridgeMarkers([
    { id: "ab", source: "a", target: "b" },
    { id: "ae", source: "a", target: "e" },
  ], nodes);

  assert.equal(markers.length, 0);
});

test("does not mark parallel or separated wires", () => {
  const markers = findWireBridgeMarkers([
    { id: "ae", source: "a", target: "e" },
    { id: "cd", source: "c", target: "d" },
  ], nodes);

  assert.equal(markers.length, 0);
});
