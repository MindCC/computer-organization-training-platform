import { applyLabEventBatch, createLabRunSnapshot } from "../src/shared/labRunState.js";

export function createCpuPracticeRepository(db) {
  return { createOrGetRun, getRun, appendEvents };
  function createOrGetRun(studentId) {
    const found = db.prepare("SELECT * FROM cpu_practice_runs WHERE student_id=?").get(studentId);
    if (found) return dto(found);
    const result = db.prepare("INSERT INTO cpu_practice_runs (student_id, state_json) VALUES (?, ?)").run(studentId, JSON.stringify(createLabRunSnapshot()));
    return getRun(Number(result.lastInsertRowid));
  }
  function getRun(id) { const row = db.prepare("SELECT * FROM cpu_practice_runs WHERE id=?").get(id); return row ? dto(row) : null; }
  function appendEvents(runId, batch) {
    return db.transaction(() => {
      const current = getRun(runId); if (!current) return null;
      const applied = applyLabEventBatch(current.state, batch);
      if (!applied.duplicate) {
        const insert = db.prepare("INSERT INTO cpu_practice_events (cpu_practice_run_id, sequence, event_id, type, payload_json) VALUES (?, ?, ?, ?, ?)");
        for (const event of applied.events) insert.run(runId, event.sequence, event.eventId, event.type, JSON.stringify(event.payload));
        db.prepare("UPDATE cpu_practice_runs SET state_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(applied.snapshot), runId);
      }
      return { ...getRun(runId), duplicate: applied.duplicate };
    })();
  }
  function dto(row) { return { ...row, studentId: row.student_id, state: parse(row.state_json, createLabRunSnapshot()) }; }
}
function parse(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
