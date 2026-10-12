export function migrateStudyEngagement(db) {
  if(!db.prepare('PRAGMA table_info(chapter_practice_attempts)').all().some(c=>c.name==='observations_json'))db.exec("ALTER TABLE chapter_practice_attempts ADD COLUMN observations_json TEXT NOT NULL DEFAULT '{}'");
  db.exec(`CREATE TABLE IF NOT EXISTS study_visits (
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL,
    created_at TEXT NOT NULL, PRIMARY KEY(student_id,day));
    CREATE TABLE IF NOT EXISTS study_engagement_policies (
      class_id INTEGER PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
      version INTEGER NOT NULL, policy_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS study_bonus_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES users(id), policy_version INTEGER NOT NULL,
      bonus REAL NOT NULL, reason TEXT NOT NULL, snapshot_json TEXT NOT NULL,
      review_token TEXT NOT NULL, client_submission_id TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(class_id,student_id,client_submission_id));
    CREATE INDEX IF NOT EXISTS idx_study_bonus_class ON study_bonus_reviews(class_id,student_id,id DESC);`);
}
