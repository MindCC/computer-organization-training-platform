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
  // 学习热力图：按「本地日期 + 小时」聚合两张表的真实时间戳（0-23 整点）
  const hourly = db.prepare(`
    SELECT day, hour, SUM(attempts) AS attempts, SUM(minutes) AS minutes FROM (
      SELECT date(created_at, 'localtime') AS day,
             CAST(strftime('%H', created_at, 'localtime') AS INTEGER) AS hour,
             COUNT(*) AS attempts, SUM(elapsed_minutes) AS minutes
      FROM challenge_attempts WHERE student_id = ? GROUP BY day, hour
      UNION ALL
      SELECT date(created_at, 'localtime') AS day,
             CAST(strftime('%H', created_at, 'localtime') AS INTEGER) AS hour,
             COUNT(*) AS attempts, SUM(elapsed_minutes) AS minutes
      FROM demo_attempts WHERE student_id = ? GROUP BY day, hour
    )
    GROUP BY day, hour ORDER BY day ASC, hour ASC
  `).all(userId, userId);
  return { challenges, demos, hourly };
}
