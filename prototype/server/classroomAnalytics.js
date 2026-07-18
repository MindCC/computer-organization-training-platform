/**
 * Teacher Classroom Analytics — stage heatmap, bottleneck detection, student replay timeline.
 */
export function buildClassroomHeatmap({ session, students, mission }) {
  const stages = mission?.stages ?? [];
  const heatmap = stages.map((stage, stageIndex) => {
    const inStage = students.filter((s) => s.current_stage_index === stageIndex);
    const notStarted = inStage.filter((s) => s.status === "not_started").length;
    const inProgress = inStage.filter((s) => s.status === "in_progress").length;
    const completed = inStage.filter((s) => s.status === "completed").length;
    const total = notStarted + inProgress + completed;
    return {
      stageId: stage.id,
      stageTitle: stage.title,
      stageIndex,
      notStarted,
      inProgress,
      completed,
      total,
      pctInProgress: total > 0 ? Math.round((inProgress / total) * 100) : 0,
      pctCompleted: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  // Bottleneck: stage with highest in-progress count
  const bottleneck = [...heatmap].sort((a, b) => b.inProgress - a.inProgress)[0] ?? null;

  // Repeated errors from student results
  const errorCounts = new Map();
  for (const student of students) {
    const result = safeJson(student.result_json);
    if (!result) continue;
    const stageScores = result.stageScores ?? [];
    for (let i = 0; i < stageScores.length; i++) {
      if (Number.isFinite(stageScores[i]) && stageScores[i] < 80) {
        const key = stages[i]?.id ?? `stage-${i}`;
        errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const repeatedErrors = [...errorCounts.entries()]
    .map(([stageId, count]) => ({ stageId, stageTitle: stages.find((s) => s.id === stageId)?.title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Inactive students (> 10 min no activity)
  const now = Date.now();
  const inactive = students
    .filter((s) => s.status === "in_progress" && s.last_activity_at)
    .filter((s) => (now - Date.parse(s.last_activity_at)) > 10 * 60 * 1000)
    .map((s) => ({
      studentId: s.student_id,
      displayName: s.display_name,
      lastActivityAt: s.last_activity_at,
      minutesInactive: Math.round((now - Date.parse(s.last_activity_at)) / 60000),
    }));

  return { heatmap, bottleneck, repeatedErrors, inactive, updatedAt: session.updated_at };
}

export function buildStudentReplay(sessionId, submissionRows) {
  const submissions = (submissionRows ?? []).map((row) => ({
    id: row.id,
    challengeId: row.challenge_id,
    score: row.score,
    passed: Boolean(row.passed),
    createdAt: row.created_at,
    errors: safeJson(row.errors_json, []),
  }));
  const passed = submissions.filter((s) => s.passed);
  const failed = submissions.filter((s) => !s.passed);
  return {
    sessionId,
    totalSubmissions: submissions.length,
    passRate: submissions.length > 0 ? Math.round((passed.length / submissions.length) * 100) : 0,
    timeline: submissions,
    passedCount: passed.length,
    failedCount: failed.length,
    firstError: failed[0]?.errors?.[0] ?? null,
  };
}

function safeJson(v, fallback = null) {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
