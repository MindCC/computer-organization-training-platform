export function getActiveGuideForChallenge(projects, challengeId) {
  if (challengeId !== "computer-components" || !Array.isArray(projects)) return null;
  return projects.find((project) => project?.guideChallengeId === challengeId && Array.isArray(project.guideScript) && project.guideScript.length > 0) ?? null;
}

export function nextGuideStep(steps, index, evidence) {
  const step = steps?.[index];
  if (!step) return index;
  if (step.completion === "acknowledge" && evidence?.acknowledged) return index + 1;
  if (step.completion === "challengeComplete" && evidence?.challengeCompleted) return index + 1;
  return index;
}

export function canEditMilestoneSubmission(submission) {
  return submission?.status !== "reviewed";
}

export function buildStudentProjectSummary(projects) {
  const list = Array.isArray(projects) ? projects : [];
  const next = list.flatMap((project) => project.milestones ?? []).find((milestone) => milestone?.dueAt) ?? null;
  return { count: list.length, nextMilestone: next };
}
