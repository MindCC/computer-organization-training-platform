export function migrateStudyRecommendations(db) {
  if (!db.prepare('PRAGMA table_info(ai_conversations)').all().some(c => c.name === 'concept_ids_json')) {
    db.exec("ALTER TABLE ai_conversations ADD COLUMN concept_ids_json TEXT NOT NULL DEFAULT '[]'");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS study_recommendation_feedback (
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      concept_id TEXT NOT NULL, choice TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(student_id, concept_id)
    );
    CREATE TABLE IF NOT EXISTS study_remediation_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      concept_id TEXT NOT NULL, state_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_remediation_owner ON study_remediation_sessions(student_id, id DESC);
  `);
}
