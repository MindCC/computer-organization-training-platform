import test from "node:test";
import assert from "node:assert/strict";
import { applyLabEventBatch, createLabRunSnapshot, normalizeLabEventBatch } from "./labRunState.js";

test("normalizes a bounded semantic event batch with a stable client batch id", () => {
  const batch = normalizeLabEventBatch({ baseRevision: 2, batchId: "batch-1", events: [{ eventId: "event-1", type: "cpu.executeInstruction", payload: { program: "addition-demo@1" } }] });
  assert.equal(batch.baseRevision, 2);
  assert.equal(batch.events[0].type, "cpu.executeInstruction");
});

test("applies each event once and advances the run revision", () => {
  const snapshot = createLabRunSnapshot();
  const batch = normalizeLabEventBatch({ baseRevision: 0, batchId: "batch-1", events: [{ eventId: "event-1", type: "cpu.executeInstruction", payload: { program: "addition-demo@1" } }] });
  const applied = applyLabEventBatch(snapshot, batch);
  assert.equal(applied.snapshot.revision, 1);
  assert.equal(applied.events.length, 1);
  const retried = applyLabEventBatch(applied.snapshot, batch);
  assert.equal(retried.duplicate, true);
  assert.equal(retried.snapshot.revision, 1);
});

test("rejects stale conflicting writes, oversize batches and unknown events", () => {
  const snapshot = { ...createLabRunSnapshot(), revision: 1 };
  assert.throws(() => applyLabEventBatch(snapshot, normalizeLabEventBatch({ baseRevision: 0, batchId: "batch-old", events: [{ eventId: "event-old", type: "cpu.executeInstruction", payload: {} }] })), /版本冲突/);
  assert.throws(() => normalizeLabEventBatch({ baseRevision: 0, batchId: "batch-2", events: [{ eventId: "event-2", type: "browser.click", payload: {} }] }), /事件类型/);
  assert.throws(() => normalizeLabEventBatch({ baseRevision: 0, batchId: "batch-3", events: Array.from({ length: 51 }, (_, index) => ({ eventId: `event-${index}`, type: "cpu.executeInstruction", payload: {} })) }), /不能超过/);
});
