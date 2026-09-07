import test from "node:test";
import assert from "node:assert/strict";
import { createUser, migrate, openDatabase } from "./db.js";
import { createCpuPracticeRepository } from "./cpuPracticeRepository.js";
import { normalizeLabEventBatch } from "../src/shared/labRunState.js";

test("creates one recoverable CPU practice run per student and stores an idempotent snapshot", () => {
  const db = openDatabase(":memory:"); migrate(db);
  const student = createUser(db, { username: "practice-student", displayName: "学生", role: "student", passwordHash: "x" });
  const repo = createCpuPracticeRepository(db);
  const run = repo.createOrGetRun(student.id);
  assert.equal(repo.createOrGetRun(student.id).id, run.id);
  const batch = normalizeLabEventBatch({ baseRevision: 0, batchId: "practice-batch-1", events: [{ eventId: "practice-event-1", type: "cpu.stepMicro", payload: { machine: { pc: 1, memory: [1, 2, 3] } } }] });
  const saved = repo.appendEvents(run.id, batch);
  assert.equal(saved.state.revision, 1);
  assert.equal(repo.appendEvents(run.id, batch).duplicate, true);
  assert.deepEqual(saved.state.events[0].payload.machine, { pc: 1, memory: [1, 2, 3] });
  db.close();
});
