export function createAssignmentRepository(db) {
  return {
    createAssignment, getById, listByClass, updateStatus,
    addQuestion, getQuestions,
    upsertSubmission, getSubmission, listSubmissions, gradeSubmission,
    getClassAnalytics,
  };

  function createAssignment({ classId, teacherId, title, description, dueAt }) {
    const result = db.prepare(`
      INSERT INTO assignments (class_id, teacher_id, title, description, due_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(classId, teacherId, title, description ?? "", dueAt ?? null);
    return getById(Number(result.lastInsertRowid));
  }

  function getById(id) {
    return db.prepare("SELECT * FROM assignments WHERE id = ?").get(id) ?? null;
  }

  function listByClass(classId) {
    return db.prepare("SELECT * FROM assignments WHERE class_id = ? ORDER BY id DESC").all(classId);
  }

  function updateStatus(id, status) {
    db.prepare("UPDATE assignments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
    return getById(id);
  }

  function addQuestion({ assignmentId, type, stem, options, answer, score, explanation, sortOrder }) {
    const result = db.prepare(`
      INSERT INTO assignment_questions (assignment_id, sort_order, type, stem, options_json, answer_json, score, explanation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(assignmentId, sortOrder ?? 0, type, stem, JSON.stringify(options ?? []), JSON.stringify(answer), score ?? 10, explanation ?? "");
    const count = db.prepare("SELECT COUNT(*) AS cnt FROM assignment_questions WHERE assignment_id = ?").get(assignmentId).cnt;
    db.prepare("UPDATE assignments SET question_count = ?, total_score = (SELECT COALESCE(SUM(score),0) FROM assignment_questions WHERE assignment_id = ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(count, assignmentId, assignmentId);
    return db.prepare("SELECT * FROM assignment_questions WHERE id = ?").get(Number(result.lastInsertRowid));
  }

  function getQuestions(assignmentId) {
    return db.prepare("SELECT * FROM assignment_questions WHERE assignment_id = ? ORDER BY sort_order, id").all(assignmentId);
  }

  function upsertSubmission({ assignmentId, studentId, answers }) {
    const existing = db.prepare("SELECT id FROM student_submissions WHERE assignment_id = ? AND student_id = ?").get(assignmentId, studentId);
    let submissionId;
    if (existing) {
      submissionId = existing.id;
      db.prepare("UPDATE student_submissions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(submissionId);
      db.prepare("DELETE FROM submission_answers WHERE submission_id = ?").run(submissionId);
    } else {
      const result = db.prepare("INSERT INTO student_submissions (assignment_id, student_id, status) VALUES (?, ?, 'draft')").run(assignmentId, studentId);
      submissionId = Number(result.lastInsertRowid);
    }
    for (const a of (answers ?? [])) {
      db.prepare("INSERT INTO submission_answers (submission_id, question_id, answer_json) VALUES (?, ?, ?)").run(submissionId, a.questionId, JSON.stringify(a.value ?? ""));
    }
    return db.prepare("SELECT * FROM student_submissions WHERE id = ?").get(submissionId);
  }

  function getSubmission(assignmentId, studentId) {
    return db.prepare("SELECT * FROM student_submissions WHERE assignment_id = ? AND student_id = ?").get(assignmentId, studentId) ?? null;
  }

  function listSubmissions(assignmentId) {
    return db.prepare(`
      SELECT ss.*, u.display_name, u.username
      FROM student_submissions ss JOIN users u ON u.id = ss.student_id
      WHERE ss.assignment_id = ? ORDER BY u.display_name
    `).all(assignmentId);
  }

  function gradeSubmission(submissionId, { totalScore, feedback, questionScores }) {
    return db.transaction(() => {
      for (const qs of (questionScores ?? [])) {
        db.prepare("UPDATE submission_answers SET score = ?, is_correct = ? WHERE submission_id = ? AND question_id = ?")
          .run(qs.score, qs.isCorrect ? 1 : 0, submissionId, qs.questionId);
      }
      db.prepare("UPDATE student_submissions SET status = 'graded', total_score = ?, feedback = ?, graded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(totalScore, feedback ?? "", submissionId);
      return db.prepare("SELECT * FROM student_submissions WHERE id = ?").get(submissionId);
    })();
  }

  function getClassAnalytics(classId) {
    const assignments = listByClass(classId).filter((a) => a.status !== "draft");
    const results = [];
    for (const a of assignments) {
      const subs = listSubmissions(a.id);
      const graded = subs.filter((s) => s.status === "graded");
      const scores = graded.map((s) => s.total_score).filter((s) => s != null);
      results.push({
        assignmentId: a.id, title: a.title, totalScore: a.total_score,
        submittedCount: subs.filter((s) => s.status !== "draft").length,
        gradedCount: graded.length,
        studentCount: subs.length,
        averageScore: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null,
      });
    }
    return results;
  }
}
