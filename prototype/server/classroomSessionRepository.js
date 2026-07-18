export function createClassroomSessionRepository(db) {
  return {
    createDraft,
    getById,
    findCurrentForStudent,
    findActiveConflictsForClass,
    getStudentState,
    enterStudent,
    transition,
    findDuplicateAttempt,
    updateStudentAfterAttempt,
    freezeReport,
    getOverview,
  };

  function createDraft(input) {
    return db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO classroom_sessions
          (class_id, teacher_id, template_key, template_version, title, status,
           duration_minutes, pass_score, allow_makeup, config_json)
        VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
      `).run(
        input.classId,
        input.teacherId,
        input.templateKey,
        input.templateVersion,
        input.title,
        input.durationMinutes,
        input.passScore,
        input.allowMakeup ? 1 : 0,
        input.configJson,
      );
      const sessionId = Number(result.lastInsertRowid);
      db.prepare(`
        INSERT INTO student_session_states (session_id, student_id, status)
        SELECT ?, student_id, 'not_started'
        FROM class_members WHERE class_id = ?
      `).run(sessionId, input.classId);
      return getById(sessionId);
    })();
  }

  function getById(sessionId) {
    return db.prepare("SELECT * FROM classroom_sessions WHERE id = ?").get(sessionId) ?? null;
  }

  function findCurrentForStudent(studentId) {
    return db.prepare(`
      SELECT cs.*
      FROM classroom_sessions cs
      JOIN class_members cm ON cm.class_id = cs.class_id
      WHERE cm.student_id = ? AND cs.status IN ('live', 'paused', 'ended')
      ORDER BY CASE WHEN cs.status IN ('live', 'paused') THEN 0 ELSE 1 END, cs.id DESC
      LIMIT 1
    `).get(studentId) ?? null;
  }

  function findActiveConflictsForClass(classId, excludeSessionId = null) {
    return db.prepare(`
      SELECT DISTINCT u.id AS student_id, u.display_name, cs.id AS session_id, cs.title
      FROM class_members target
      JOIN class_members other ON other.student_id = target.student_id
      JOIN classroom_sessions cs
        ON cs.class_id = other.class_id AND cs.status IN ('live', 'paused')
      JOIN users u ON u.id = target.student_id
      WHERE target.class_id = ? AND (? IS NULL OR cs.id <> ?)
      ORDER BY u.display_name, u.id
    `).all(classId, excludeSessionId, excludeSessionId);
  }

  function getStudentState(sessionId, studentId) {
    return db.prepare(`
      SELECT * FROM student_session_states WHERE session_id = ? AND student_id = ?
    `).get(sessionId, studentId) ?? null;
  }

  function enterStudent(sessionId, studentId) {
    db.prepare(`
      INSERT OR IGNORE INTO student_session_states (session_id, student_id, status)
      VALUES (?, ?, 'not_started')
    `).run(sessionId, studentId);
    db.prepare(`
      UPDATE student_session_states
      SET status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
          entered_at = COALESCE(entered_at, CURRENT_TIMESTAMP),
          last_activity_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND student_id = ?
    `).run(sessionId, studentId);
    return getStudentState(sessionId, studentId);
  }

  function transition(sessionId, expectedStatus, nextStatus, fields = {}) {
    const result = db.prepare(`
      UPDATE classroom_sessions
      SET status = ?, active_started_at = ?, accumulated_active_seconds = ?,
          started_at = COALESCE(?, started_at),
          paused_at = ?, ended_at = ?, report_json = COALESCE(?, report_json),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = ?
    `).run(
      nextStatus,
      fields.activeStartedAt ?? null,
      fields.accumulatedActiveSeconds ?? 0,
      fields.startedAt ?? null,
      fields.pausedAt ?? null,
      fields.endedAt ?? null,
      fields.reportJson ?? null,
      sessionId,
      expectedStatus,
    );
    return result.changes === 1 ? getById(sessionId) : null;
  }

  function findDuplicateAttempt(studentId, clientSubmissionId) {
    return db.prepare(`
      SELECT * FROM challenge_attempts
      WHERE student_id = ? AND client_submission_id = ?
    `).get(studentId, clientSubmissionId) ?? null;
  }

  function updateStudentAfterAttempt(input) {
    db.prepare(`
      UPDATE student_session_states
      SET status = ?, current_stage_index = ?, xp = ?, stars = ?, streak = ?,
          result_json = ?, last_activity_at = CURRENT_TIMESTAMP,
          completed_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND student_id = ?
    `).run(
      input.status,
      input.currentStageIndex,
      input.xp,
      input.stars,
      input.streak,
      JSON.stringify(input.result),
      input.completedAt,
      input.sessionId,
      input.studentId,
    );
    return getStudentState(input.sessionId, input.studentId);
  }

  function freezeReport(sessionId, report) {
    db.prepare(`
      UPDATE classroom_sessions SET report_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND report_json IS NULL
    `).run(JSON.stringify(report), sessionId);
    return getById(sessionId);
  }

  function getOverview(sessionId) {
    const session = getById(sessionId);
    const students = db.prepare(`
      SELECT sss.*, u.display_name, u.username
      FROM student_session_states sss
      JOIN users u ON u.id = sss.student_id
      WHERE sss.session_id = ?
      ORDER BY u.display_name, u.id
    `).all(sessionId);
    return { session, students };
  }
}
