/**
 * 拍照导入错题的持久层。
 *
 * photo_imports：一次拍照导入（多张图片、识别状态、归档状态）。
 * photo_mistakes：识别并经学生核对后的单道错题（归档后进入统一错题本）。
 * photo_mistake_rounds：AI 同类题轮次与作答判分证据，用于「连续两轮全对」自动掌握。
 */
export function ensurePhotoMistakeTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS photo_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_submission_id TEXT,
      status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','archived')),
      images_json TEXT NOT NULL DEFAULT '[]',
      provider TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      archived_at TEXT,
      UNIQUE(student_id, client_submission_id)
    );
    CREATE INDEX IF NOT EXISTS idx_photo_imports_student ON photo_imports(student_id, id);
    CREATE TABLE IF NOT EXISTS photo_mistakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      import_id INTEGER NOT NULL REFERENCES photo_imports(id) ON DELETE CASCADE,
      image_index INTEGER NOT NULL DEFAULT 0,
      seq INTEGER NOT NULL DEFAULT 0,
      chapter_id TEXT,
      kp_id TEXT,
      knowledge_label TEXT NOT NULL DEFAULT '',
      qtype TEXT NOT NULL DEFAULT 'short_answer',
      stem TEXT NOT NULL,
      student_answer TEXT NOT NULL DEFAULT '',
      reference_answer TEXT NOT NULL DEFAULT '',
      explanation TEXT NOT NULL DEFAULT '',
      options_json TEXT NOT NULL DEFAULT '[]',
      box_json TEXT,
      mastered INTEGER NOT NULL DEFAULT 0,
      mastered_manual INTEGER NOT NULL DEFAULT 0,
      ai_explanation_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_photo_mistakes_student ON photo_mistakes(student_id, import_id, seq);
    CREATE TABLE IF NOT EXISTS photo_mistake_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_mistake_id INTEGER NOT NULL REFERENCES photo_mistakes(id) ON DELETE CASCADE,
      client_submission_id TEXT,
      questions_json TEXT NOT NULL DEFAULT '[]',
      answers_json TEXT,
      results_json TEXT,
      all_correct INTEGER,
      created_at TEXT NOT NULL,
      answered_at TEXT,
      UNIQUE(student_id, client_submission_id)
    );
    CREATE INDEX IF NOT EXISTS idx_photo_rounds_mistake ON photo_mistake_rounds(photo_mistake_id, id);
  `);
}

const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

export function mapImportRow(row) {
  if (!row) return null;
  return { id: row.id, status: row.status, provider: row.provider, createdAt: row.created_at, archivedAt: row.archived_at,
    imageCount: parse(row.images_json, []).length };
}

export function mapMistakeRow(row) {
  if (!row) return null;
  return { id: row.id, importId: row.import_id, imageIndex: row.image_index, seq: row.seq,
    chapterId: row.chapter_id, kpId: row.kp_id, knowledgeLabel: row.knowledge_label, qtype: row.qtype,
    stem: row.stem, studentAnswer: row.student_answer, referenceAnswer: row.reference_answer,
    explanation: row.explanation, options: parse(row.options_json, []), box: parse(row.box_json, null),
    mastered: Boolean(row.mastered), masteredManual: Boolean(row.mastered_manual),
    aiExplanation: parse(row.ai_explanation_json, null), createdAt: row.created_at };
}

export function mapRoundRow(row) {
  if (!row) return null;
  return { id: row.id, photoMistakeId: row.photo_mistake_id, questions: parse(row.questions_json, []),
    answers: parse(row.answers_json, null), results: parse(row.results_json, null),
    allCorrect: row.all_correct === null ? null : Boolean(row.all_correct),
    createdAt: row.created_at, answeredAt: row.answered_at };
}

export function createImport(db, { studentId, clientSubmissionId = null, images, provider }) {
  const createdAt = new Date().toISOString();
  const info = db.prepare("INSERT INTO photo_imports (student_id, client_submission_id, images_json, provider, created_at) VALUES (?,?,?,?,?)")
    .run(studentId, clientSubmissionId, JSON.stringify(images), provider, createdAt);
  return { id: info.lastInsertRowid, createdAt };
}

export function findImportByClientId(db, studentId, clientSubmissionId) {
  return db.prepare("SELECT * FROM photo_imports WHERE student_id = ? AND client_submission_id = ?").get(studentId, clientSubmissionId) ?? null;
}

export function getImportRow(db, studentId, id) {
  return db.prepare("SELECT * FROM photo_imports WHERE id = ? AND student_id = ?").get(id, studentId) ?? null;
}

export function insertMistake(db, { studentId, importId, imageIndex, seq, chapterId, kpId, knowledgeLabel, qtype, stem, studentAnswer, referenceAnswer, explanation, options, box }) {
  const info = db.prepare(`INSERT INTO photo_mistakes
    (student_id, import_id, image_index, seq, chapter_id, kp_id, knowledge_label, qtype, stem, student_answer, reference_answer, explanation, options_json, box_json, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(studentId, importId, imageIndex, seq, chapterId, kpId, knowledgeLabel, qtype, stem, studentAnswer, referenceAnswer, explanation,
      JSON.stringify(options ?? []), box ? JSON.stringify(box) : null, new Date().toISOString());
  return info.lastInsertRowid;
}

export function listImportMistakes(db, importId) {
  return db.prepare("SELECT * FROM photo_mistakes WHERE import_id = ? ORDER BY seq ASC, id ASC").all(importId);
}

export function replaceImportMistakes(db, { studentId, importId, questions }) {
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM photo_mistakes WHERE import_id = ? AND student_id = ?").run(importId, studentId);
    questions.forEach((question, index) => insertMistake(db, { studentId, importId, seq: index, ...question }));
  });
  transaction();
}

export function archiveImport(db, studentId, id) {
  db.prepare("UPDATE photo_imports SET status = 'archived', archived_at = ? WHERE id = ? AND student_id = ? AND status = 'review'")
    .run(new Date().toISOString(), id, studentId);
}

export function getMistakeRow(db, studentId, id) {
  return db.prepare("SELECT * FROM photo_mistakes WHERE id = ? AND student_id = ?").get(id, studentId) ?? null;
}

export function deleteMistake(db, studentId, id) {
  db.prepare("DELETE FROM photo_mistakes WHERE id = ? AND student_id = ?").run(id, studentId);
}

export function setMastered(db, studentId, id, mastered, manual) {
  db.prepare("UPDATE photo_mistakes SET mastered = ?, mastered_manual = ? WHERE id = ? AND student_id = ?")
    .run(mastered ? 1 : 0, manual ? 1 : 0, id, studentId);
}

export function autoMaster(db, studentId, id) {
  // Preserve an already-mastered student's explicit manual mark. A later new
  // successful round may still restore mastery after they manually cancelled it.
  db.prepare("UPDATE photo_mistakes SET mastered = 1, mastered_manual = 0 WHERE id = ? AND student_id = ? AND mastered = 0")
    .run(id, studentId);
}

export function saveAiExplanation(db, id, payload) {
  db.prepare("UPDATE photo_mistakes SET ai_explanation_json = ? WHERE id = ?").run(JSON.stringify(payload), id);
}

export function createRound(db, { studentId, photoMistakeId, clientSubmissionId, questions }) {
  const createdAt = new Date().toISOString();
  const info = db.prepare("INSERT INTO photo_mistake_rounds (student_id, photo_mistake_id, client_submission_id, questions_json, created_at) VALUES (?,?,?,?,?)")
    .run(studentId, photoMistakeId, clientSubmissionId, JSON.stringify(questions), createdAt);
  return { id: info.lastInsertRowid, createdAt };
}

export function findRoundByClientId(db, studentId, clientSubmissionId) {
  return db.prepare("SELECT * FROM photo_mistake_rounds WHERE student_id = ? AND client_submission_id = ?").get(studentId, clientSubmissionId) ?? null;
}

export function getRoundRow(db, studentId, id) {
  return db.prepare("SELECT * FROM photo_mistake_rounds WHERE id = ? AND student_id = ?").get(id, studentId) ?? null;
}

export function listRounds(db, studentId, photoMistakeId) {
  return db.prepare("SELECT * FROM photo_mistake_rounds WHERE student_id = ? AND photo_mistake_id = ? ORDER BY id ASC").all(studentId, photoMistakeId);
}

export function answerRound(db, id, { answers, results, allCorrect }) {
  db.prepare("UPDATE photo_mistake_rounds SET answers_json = ?, results_json = ?, all_correct = ?, answered_at = ? WHERE id = ?")
    .run(JSON.stringify(answers), JSON.stringify(results), allCorrect ? 1 : 0, new Date().toISOString(), id);
}

export function getImportImage(db, studentId, id, index) {
  const row = getImportRow(db, studentId, id);
  if (!row) return null;
  const images = parse(row.images_json, []);
  return Number.isInteger(index) && index >= 0 && index < images.length ? images[index] : null;
}
