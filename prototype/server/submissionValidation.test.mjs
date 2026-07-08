import test from "node:test";
import assert from "node:assert/strict";

import { normalizeStudentAttemptPayload } from "./submissionValidation.js";
import { LEARNING_ITEMS } from "../src/platformLogic.js";

test("rejects impossible scores and inconsistent passed state", () => {
  const tooHigh = normalizeStudentAttemptPayload({
    challengeId: "data-flow",
    result: { score: 999, passed: true, errors: [], elapsedMinutes: 8 },
  }, LEARNING_ITEMS);
  assert.equal(tooHigh.ok, false);
  assert.equal(tooHigh.status, 400);

  const lowPassed = normalizeStudentAttemptPayload({
    challengeId: "data-flow",
    result: { score: 60, passed: true, errors: [], elapsedMinutes: 8 },
  }, LEARNING_ITEMS);
  assert.equal(lowPassed.ok, false);
  assert.match(lowPassed.error, /passed/i);
});

test("rejects unreasonable elapsed minutes and oversized result payloads", () => {
  const badElapsed = normalizeStudentAttemptPayload({
    challengeId: "data-flow",
    result: { score: 80, passed: true, errors: [], elapsedMinutes: 999 },
  }, LEARNING_ITEMS);
  assert.equal(badElapsed.ok, false);
  assert.match(badElapsed.error, /elapsed/i);

  const oversized = normalizeStudentAttemptPayload({
    challengeId: "data-flow",
    result: { score: 80, passed: true, errors: [], elapsedMinutes: 8, trace: "x".repeat(70_000) },
  }, LEARNING_ITEMS);
  assert.equal(oversized.ok, false);
  assert.match(oversized.error, /large/i);
});

test("regrades hardware game attempts from submitted selection", () => {
  const normalized = normalizeStudentAttemptPayload({
    challengeId: "game-office-pc",
    result: {
      score: 100,
      passed: true,
      errors: [],
      elapsedMinutes: 6,
      selection: { cpu: "cpu-i3", memory: "mem-8", storage: "hdd-1tb", gpu: "gpu-integrated" },
    },
  }, LEARNING_ITEMS);

  assert.equal(normalized.ok, true);
  assert.notEqual(normalized.result.score, 100);
  assert.equal(normalized.result.selectedParts.storage.id, "hdd-1tb");
  assert.equal(normalized.result.elapsedMinutes, 6);
});

