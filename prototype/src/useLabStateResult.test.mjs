import test from "node:test";
import assert from "node:assert/strict";
import { buildOverviewCompletionResult } from "./hooks/useLabState.js";

test("overview completion includes authoritative participation evidence", () => {
  assert.deepEqual(buildOverviewCompletionResult(12), {
    passed: true,
    completed: true,
    errors: [],
    score: 100,
    missing: [],
    elapsedMinutes: 12,
  });
});
