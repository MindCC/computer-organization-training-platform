export function learningActivity(db, userId) {
  const challenges = db.prepare(`
    SELECT date(created_at, 'localtime') AS day, challenge_id AS challengeId,
           COUNT(*) AS attempts, MAX(passed) AS passed, SUM(elapsed_minutes) AS minutes
    FROM challenge_attempts WHERE student_id = ?
    GROUP BY day, challenge_id ORDER BY day ASC
  `).all(userId);
  const demos = db.prepare(`
    SELECT date(created_at, 'localtime') AS day, COUNT(*) AS attempts,
           SUM(correct) AS correct, SUM(elapsed_minutes) AS minutes
    FROM demo_attempts WHERE student_id = ? GROUP BY day ORDER BY day ASC
  `).all(userId);
  return { challenges, demos };
}
