// Pending submission helpers for offline resilience

export function pendingSubmissionKey({ userId, sessionId, stageId }) {
  return `classroom:pending:${userId}:${sessionId}:${stageId}`;
}

export function readPendingSubmission(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return value?.clientSubmissionId && value?.payload ? value : null;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writePendingSubmission(storage, key, payload) {
  storage.setItem(key, JSON.stringify(payload));
}

export function clearPendingSubmission(storage, key) {
  storage.removeItem(key);
}

// View model builders

export function buildClassroomViewModel({ session, studentState, mission, remainingSeconds }) {
  if (!session) return { active: false };
  const stageIndex = studentState?.current_stage_index ?? 0;
  const currentStage = mission?.stages?.[stageIndex] ?? null;
  return {
    active: true,
    sessionId: session.id,
    title: session.title ?? mission?.title,
    status: session.status,
    paused: session.status === "paused",
    ended: session.status === "ended",
    stageIndex,
    currentStage,
    remainingSeconds: Math.max(0, remainingSeconds ?? 0),
    xp: studentState?.xp ?? 0,
    stars: studentState?.stars ?? 0,
    streak: studentState?.streak ?? 0,
    studentStatus: studentState?.status ?? "not_started",
    mission,
    result: studentState?.result,
  };
}

export function mergeClassroomSubmission(viewModel, studentState) {
  const stageIndex = studentState?.current_stage_index ?? viewModel.stageIndex ?? 0;
  return {
    ...viewModel,
    stageIndex,
    currentStage: viewModel.mission?.stages?.[stageIndex] ?? null,
    studentStatus: studentState?.status ?? viewModel.studentStatus,
    xp: studentState?.xp ?? viewModel.xp,
    stars: studentState?.stars ?? viewModel.stars,
    streak: studentState?.streak ?? viewModel.streak,
  };
}

export function buildTeacherSessionViewModel({ session, students, updatedAt }) {
  if (!session) return { active: false };
  const stageBuckets = { not_started: [], in_progress: [], completed: [] };
  for (const student of (students ?? [])) {
    const bucket = stageBuckets[student.status] ?? stageBuckets.in_progress;
    bucket.push(student);
  }
  const needsHelp = (students ?? []).filter((s) => s.status === "in_progress" && s.current_stage_index === 0);
  return {
    active: true,
    sessionId: session.id,
    title: session.title,
    status: session.status,
    paused: session.status === "paused",
    ended: session.status === "ended",
    stageBuckets,
    students: students ?? [],
    needsHelp,
    updatedAt: updatedAt ?? session.updated_at,
  };
}
