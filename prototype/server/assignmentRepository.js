export function createAssignmentRepository(db) {
  return {
    createAssignment, getById, listByClass, updateStatus,
    addQuestion, getQuestions,
    upsertSubmission, getSubmission, listSubmissions, markSubmitted, gradeSubmission,
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
    return db.transaction(() => {
      assertAnswersBelongToAssignment(assignmentId, answers);
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
      for (const answer of answers ?? []) {
        db.prepare("INSERT INTO submission_answers (submission_id, question_id, answer_json) VALUES (?, ?, ?)")
          .run(submissionId, answer.questionId, JSON.stringify(answer.value ?? ""));
      }
      return db.prepare("SELECT * FROM student_submissions WHERE id = ?").get(submissionId);
    })();
  }

  function getSubmission(assignmentId, studentId) {
    const submission = db.prepare("SELECT * FROM student_submissions WHERE assignment_id = ? AND student_id = ?").get(assignmentId, studentId) ?? null;
    return submission ? withAnswers(submission) : null;
  }

  function listSubmissions(assignmentId) {
    return db.prepare(`
      SELECT ss.*, u.display_name, u.username
      FROM student_submissions ss JOIN users u ON u.id = ss.student_id
      WHERE ss.assignment_id = ? ORDER BY u.display_name
    `).all(assignmentId).map(withAnswers);
  }

  function markSubmitted(submissionId, { totalScore, questionScores }) {
    return db.transaction(() => {
      updateQuestionScores(submissionId, questionScores);
      db.prepare("UPDATE student_submissions SET status = 'submitted', total_score = ?, submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(totalScore, submissionId);
      return db.prepare("SELECT * FROM student_submissions WHERE id = ?").get(submissionId);
    })();
  }

  function gradeSubmission(submissionId, { totalScore, feedback, questionScores }) {
    return db.transaction(() => {
      updateQuestionScores(submissionId, questionScores);
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
        studentCount: db.prepare("SELECT COUNT(*) AS count FROM class_members WHERE class_id = ?").get(classId).count,
        averageScore: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null,
      });
    }
    return results;
  }

  function assertAnswersBelongToAssignment(assignmentId, answers) {
    if (!Array.isArray(answers)) throw Object.assign(new Error("答案必须为数组"), { status: 400 });
    const questionIds = new Set(getQuestions(assignmentId).map((question) => question.id));
    const seen = new Set();
    for (const answer of answers) {
      const questionId = Number(answer?.questionId);
      if (!Number.isInteger(questionId) || !questionIds.has(questionId) || seen.has(questionId)) {
        throw Object.assign(new Error("答案包含无效或重复题目"), { status: 400 });
      }
      seen.add(questionId);
    }
  }

  function updateQuestionScores(submissionId, questionScores = []) {
    for (const score of questionScores) {
      db.prepare(`
        INSERT INTO submission_answers (submission_id, question_id, answer_json, score, is_correct)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(submission_id, question_id) DO UPDATE SET
          score = excluded.score,
          is_correct = excluded.is_correct
      `).run(
        submissionId,
        score.questionId,
        JSON.stringify(""),
        score.score,
        score.isCorrect == null ? null : score.isCorrect ? 1 : 0,
      );
    }
  }

  function withAnswers(submission) {
    const answers = db.prepare(`
      SELECT question_id, answer_json, score, is_correct
      FROM submission_answers WHERE submission_id = ? ORDER BY question_id
    `).all(submission.id).map((answer) => ({
      questionId: answer.question_id,
      value: parseJson(answer.answer_json),
      score: answer.score,
      isCorrect: answer.is_correct == null ? null : Boolean(answer.is_correct),
    }));
    return { ...submission, answers };
  }
}

function parseJson(value) { try { return JSON.parse(value); } catch { return value; } }
