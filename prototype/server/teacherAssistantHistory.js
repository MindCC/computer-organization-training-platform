/** Immutable, teacher-owned report snapshots. Never included in student session payloads. */
export function initializeAssistantHistory(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS teacher_assistant_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); CREATE INDEX IF NOT EXISTS idx_assistant_report_owner ON teacher_assistant_reports(teacher_id,id);`);
}

export function saveAssistantReport(db, teacherId, classId, report) {
  initializeAssistantHistory(db);
  const snapshot = JSON.stringify(report);
  if (Buffer.byteLength(snapshot) > 512000) throw new Error('助教报告过大，无法保存来源');
  const result = db.prepare('INSERT INTO teacher_assistant_reports(teacher_id,class_id,snapshot_json) VALUES(?,?,?)').run(teacherId,classId,snapshot);
  return {...report,reportId:Number(result.lastInsertRowid),sourceClassId:classId};
}

export function readAssistantReport(db, teacherId, reportId) {
  initializeAssistantHistory(db);
  const row = Number.isSafeInteger(reportId) && reportId > 0
    ? db.prepare('SELECT * FROM teacher_assistant_reports WHERE id=? AND teacher_id=?').get(reportId,teacherId) : null;
  if (!row) throw Object.assign(new Error('建议来源不存在或不属于你'),{status:404,statusCode:404});
  return {...JSON.parse(row.snapshot_json),reportId:row.id,sourceClassId:row.class_id};
}
