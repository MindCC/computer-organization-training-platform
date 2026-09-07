import { applyLabEventBatch, createLabRunSnapshot } from "../src/shared/labRunState.js";

export function createLabRunRepository(db) {
  return { createOrGetRun, getRun, appendEvents };

  function createOrGetRun({ studentId, courseVersionId, stepId }) {
    const existing = db.prepare("SELECT * FROM lab_runs WHERE student_id=? AND course_version_id=? AND step_id=?").get(studentId, courseVersionId, stepId);
    if (existing) return dto(existing);
    const result = db.prepare("INSERT INTO lab_runs (student_id, course_version_id, step_id, state_json) VALUES (?, ?, ?, ?)")
      .run(studentId, courseVersionId, stepId, JSON.stringify(createLabRunSnapshot()));
    return getRun(Number(result.lastInsertRowid));
  }

  function getRun(id) {
    const row = db.prepare("SELECT * FROM lab_runs WHERE id=?").get(id);
    return row ? dto(row) : null;
  }

  function appendEvents(runId, batch) {
    return db.transaction(() => {
      const current = getRun(runId);
      if (!current) return null;
      const applied = applyLabEventBatch(current.state, batch);
      if (!applied.duplicate) {
        const insert = db.prepare("INSERT INTO lab_run_events (lab_run_id, sequence, event_id, type, payload_json) VALUES (?, ?, ?, ?, ?)");
        for (const event of applied.events) insert.run(runId, event.sequence, event.eventId, event.type, JSON.stringify(event.payload));
        db.prepare("UPDATE lab_runs SET state_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(applied.snapshot), runId);
      }
      return { ...getRun(runId), duplicate: applied.duplicate };
    })();
  }

  function dto(row) {
    return {
      ...row,
      studentId: row.student_id,
      courseVersionId: row.course_version_id,
      stepId: row.step_id,
      state: parse(row.state_json, createLabRunSnapshot()),
    };
  }
}
function parse(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
