import test from "node:test";
import assert from "node:assert/strict";
import { motionPolicy, questEntrance, questUnlock } from "./questMotion.js";

test("reduced motion removes travel and scale", () => {
  assert.deepEqual(motionPolicy(true), { enabled: false, duration: 0.01 });
  assert.deepEqual(questEntrance(true), { autoAlpha: 1, x: 0, y: 0, duration: 0.01 });
  assert.deepEqual(questUnlock(true), { autoAlpha: 1, scale: 1, duration: 0.01 });
});

test("default motion uses transform and opacity only", () => {
  assert.deepEqual(motionPolicy(false), { enabled: true, duration: 0.55 });
  assert.deepEqual(questEntrance(false), { autoAlpha: 0, y: 18, duration: 0.55, ease: "power2.out" });
  assert.deepEqual(questUnlock(false), { autoAlpha: 0, scale: 0.9, duration: 0.5, ease: "back.out(1.4)" });
});
