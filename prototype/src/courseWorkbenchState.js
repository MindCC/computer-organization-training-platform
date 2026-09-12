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

export function createEditableMilestoneDraft(draft, submission, createId) {
  if (draft) return draft;
  return {
    reflection: submission?.reflection ?? "",
    evidenceUrl: submission?.evidenceUrl ?? "",
    clientSubmissionId: createId(),
  };
}

export function buildStudentProjectSummary(projects) {
  const list = Array.isArray(projects) ? projects : [];
  const next = list.flatMap((project) => project.milestones ?? []).find((milestone) => milestone?.dueAt) ?? null;
  return { count: list.length, nextMilestone: next };
}

export function buildProjectChapters(projects) {
  return (Array.isArray(projects) ? projects : []).map((project) => {
    const submissions = new Map((project.submissions ?? []).map((submission) => [submission.milestoneId, submission]));
    const experiments = (project.milestones ?? []).map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      status: submissions.get(milestone.id)?.status ?? "not-started",
    }));
    return {
      id: project.id,
      title: project.title,
      description: project.description,
      teamName: project.team?.name ?? "我的小组",
      completedCount: experiments.filter((experiment) => experiment.status === "reviewed").length,
      experiments,
    };
  });
}
