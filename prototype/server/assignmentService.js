import { teacherOwnsClass } from "./db.js";

export function createAssignmentService({ db, repository }) {
  return {
    createAssignment,
    addQuestion,
    publishAssignment,
    getTeacherAssignments,
    getTeacherAssignmentDetail,
    listTeacherSubmissions,
    getStudentAssignments,
    getStudentAssignmentDetail,
    saveDraft,
    submitStudentAnswers,
    gradeSubmission,
    getStudentSubmissions,
    getClassAnalytics,
    getStudentAnalytics,
  };

  function assignmentNotFound() {
    return Object.assign(new Error("作业不存在"), { status: 404 });
  }

  function getExistingAssignment(assignmentId) {
    const assignment = repository.getById(assignmentId);
    if (!assignment) throw assignmentNotFound();
    return assignment;
  }

  function assertTeacherOwns(assignment, teacherId) {
    if (!teacherOwnsClass(db, teacherId, assignment.class_id)) {
      throw assignmentNotFound();
    }
  }

  function assertStudentCanAccess(assignment, studentId) {
    const member = db.prepare(`
      SELECT 1 FROM class_members
      WHERE class_id = ? AND student_id = ?
    `).get(assignment.class_id, studentId);
    if (!member || assignment.status !== "published") {
      throw assignmentNotFound();
    }
  }

  function createAssignment({ teacherId, classId, title, description, dueAt }) {
    if (!teacherOwnsClass(db, teacherId, classId)) throw Object.assign(new Error("班级不存在"), { status: 404 });
    return repository.createAssignment({ classId, teacherId, title, description, dueAt });
  }

  function addQuestion({ teacherId, assignmentId, ...q }) {
    const a = getExistingAssignment(assignmentId);
    assertTeacherOwns(a, teacherId);
    if (a.status !== "draft") throw Object.assign(new Error("已发布的作业不能修改题目"), { status: 400 });
    return repository.addQuestion({ assignmentId, ...q });
  }

  function publishAssignment({ teacherId, assignmentId }) {
    const a = getExistingAssignment(assignmentId);
    assertTeacherOwns(a, teacherId);
    const questions = repository.getQuestions(assignmentId);
    if (questions.length === 0) throw Object.assign(new Error("作业至少需要一道题目"), { status: 400 });
    return repository.updateStatus(assignmentId, "published");
  }

  function getTeacherAssignments({ teacherId, classId }) {
    if (!teacherOwnsClass(db, teacherId, classId)) throw Object.assign(new Error("班级不存在"), { status: 404 });
    return repository.listByClass(classId);
  }

  function getTeacherAssignmentDetail({ teacherId, assignmentId }) {
    const assignment = getExistingAssignment(assignmentId);
    assertTeacherOwns(assignment, teacherId);
    return { ...assignment, questions: repository.getQuestions(assignmentId) };
  }

  function listTeacherSubmissions({ teacherId, assignmentId }) {
    const assignment = getExistingAssignment(assignmentId);
    assertTeacherOwns(assignment, teacherId);
    return repository.listSubmissions(assignmentId);
  }

  function getStudentAssignments({ studentId }) {
    return db.prepare(`
      SELECT a.* FROM assignments a
      JOIN class_members cm ON cm.class_id = a.class_id
      WHERE cm.student_id = ? AND a.status = 'published'
      ORDER BY a.id DESC
    `).all(studentId);
  }

  function getStudentAssignmentDetail({ studentId, assignmentId }) {
    const assignment = getExistingAssignment(assignmentId);
    assertStudentCanAccess(assignment, studentId);
    const questions = repository.getQuestions(assignmentId).map(({ answer_json: _answer, ...question }) => question);
    const submission = repository.getSubmission(assignmentId, studentId);
    return { ...assignment, questions, submission };
  }

  function saveDraft({ studentId, assignmentId, answers }) {
    const a = getExistingAssignment(assignmentId);
    assertStudentCanAccess(a, studentId);
    return repository.upsertSubmission({ assignmentId, studentId, answers });
  }

  function submitStudentAnswers({ studentId, assignmentId, answers }) {
    const a = getExistingAssignment(assignmentId);
    assertStudentCanAccess(a, studentId);
    const questions = repository.getQuestions(assignmentId);
    const qMap = new Map(questions.map((q) => [q.id, q]));

    // Auto-grade objective questions (choice, truefalse, fill)
    let totalScore = 0;
    const graded = [];
    for (const ans of (answers ?? [])) {
      const q = qMap.get(ans.questionId);
      if (!q) continue;
      const correctAnswer = safeJson(q.answer_json);
      let isCorrect = false;
      if (q.type === "choice") {
        isCorrect = String(ans.value) === String(correctAnswer);
      } else if (q.type === "truefalse") {
        isCorrect = String(ans.value).toLowerCase() === String(correctAnswer).toLowerCase();
      } else if (q.type === "fill") {
        isCorrect = String(ans.value ?? "").trim() === String(correctAnswer ?? "").trim();
      }
      // short_answer: manual grading only
      const score = isCorrect ? q.score : 0;
      if (q.type !== "short_answer") {
        totalScore += score;
        graded.push({ questionId: q.id, score, isCorrect });
      } else {
        graded.push({ questionId: q.id, score: null, isCorrect: null });
      }
    }

    // Save submission as submitted
    const sub = repository.upsertSubmission({ assignmentId, studentId, answers });
    repository.gradeSubmission(sub.id, {
      totalScore,
      questionScores: graded,
      feedback: "",
    });
    return { submission: repository.getSubmission(assignmentId, studentId), autoScore: totalScore };
  }

  function gradeSubmission({ teacherId, submissionId, questionScores, feedback }) {
    const sub = db.prepare("SELECT * FROM student_submissions WHERE id = ?").get(submissionId);
    if (!sub) throw Object.assign(new Error("提交不存在"), { status: 404 });
    const a = repository.getById(sub.assignment_id);
    assertTeacherOwns(a, teacherId);

    // Recalculate total from question scores
    let total = 0;
    for (const qs of (questionScores ?? [])) {
      total += qs.score ?? 0;
    }
    return repository.gradeSubmission(submissionId, { totalScore: total, feedback, questionScores });
  }

  function getStudentSubmissions({ studentId }) {
    const rows = db.prepare(`
      SELECT ss.*, a.title AS assignment_title, a.total_score AS assignment_total
      FROM student_submissions ss JOIN assignments a ON a.id = ss.assignment_id
      WHERE ss.student_id = ? ORDER BY ss.id DESC
    `).all(studentId);
    return rows;
  }

  function getClassAnalytics({ teacherId, classId }) {
    if (!teacherOwnsClass(db, teacherId, classId)) throw Object.assign(new Error("班级不存在"), { status: 404 });
    return repository.getClassAnalytics(classId);
  }

  function getStudentAnalytics({ teacherId, studentId, classId }) {
    const membership = db.prepare(`
      SELECT 1 FROM class_members cm JOIN classes c ON c.id = cm.class_id
      WHERE cm.student_id = ? AND c.teacher_id = ? AND (? IS NULL OR c.id = ?)
    `).get(studentId, teacherId, classId, classId);
    if (!membership) throw Object.assign(new Error("学生不存在"), { status: 404 });

    const subs = db.prepare(`
      SELECT ss.*, a.title, a.total_score AS assignment_total_score
      FROM student_submissions ss
      JOIN assignments a ON a.id = ss.assignment_id
      JOIN classes c ON c.id = a.class_id
      WHERE ss.student_id = ?
        AND c.teacher_id = ?
        AND (? IS NULL OR a.class_id = ?)
      ORDER BY ss.submitted_at DESC
    `).all(studentId, teacherId, classId, classId);

    const graded = subs.filter((s) => s.status === "graded" && s.total_score != null);
    return {
      studentId,
      totalAssignments: subs.length,
      gradedCount: graded.length,
      averageScore: graded.length ? Math.round(graded.reduce((x, s) => x + s.total_score, 0) / graded.length) : null,
      submissions: subs.map((s) => ({
        assignmentId: s.assignment_id, title: s.title,
        status: s.status, score: s.total_score, totalScore: s.assignment_total_score,
        submittedAt: s.submitted_at, gradedAt: s.graded_at,
      })),
    };
  }
}

function safeJson(v) { try { return JSON.parse(v); } catch { return v; } }
