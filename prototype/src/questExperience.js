export function buildRoleEntryCopy(role = "student") {
  return role === "teacher"
    ? {
      usernameLabel: "教师账号",
      usernamePlaceholder: "请输入教师账号",
      submitLabel: "登录并进入指挥台",
      help: "首次登录后可创建或选择班级",
    }
    : {
      usernameLabel: "学号",
      usernamePlaceholder: "请输入教师发放的学号",
      submitLabel: "登录并继续学习",
      help: "账号由任课教师统一发放",
    };
}

export function buildStudentQuestModel(routeGroups = [], recommended, progress = {}) {
  const stages = routeGroups.flatMap((group) => group.items.map((item) => ({
    ...item,
    groupId: group.id,
    groupTitle: group.title,
  })));
  const isEligible = (stage) => stage.status !== "completed" && stage.status !== "locked";
  const recommendedStage = stages.find((stage) => stage.id === recommended?.id);
  const currentId = recommendedStage && isEligible(recommendedStage)
    ? recommendedStage.id
    : stages.find(isEligible)?.id;
  const decoratedStages = stages.map((stage, index) => {
    const previous = stages[index - 1];
    return {
      ...stage,
      isCurrent: stage.id === currentId,
      unlockRequirement: stage.status === "locked" && previous
        ? `完成「${previous.title}」后解锁`
        : "",
      record: progress[stage.id] ?? {},
    };
  });

  return {
    chapters: routeGroups,
    stages: decoratedStages,
    current: decoratedStages.find((stage) => stage.isCurrent) ?? null,
  };
}

export function buildFirstUseSteps(progress = {}) {
  const records = Object.values(progress);
  const hasAttempt = records.some((record) => Number(record?.attempts) > 0);
  const hasPass = records.some((record) => record?.status === "completed");

  return [
    { id: "inspect", label: "查看当前任务", completed: hasAttempt || hasPass },
    { id: "open", label: "进入实验工作台", completed: hasAttempt || hasPass },
    { id: "submit", label: "提交一次评测", completed: hasAttempt },
  ];
}

export function buildQuestSettlement(challengeId, result = {}, routeGroups = []) {
  const stages = routeGroups.flatMap((group) => group.items);
  const index = stages.findIndex((stage) => stage.id === challengeId);
  const stage = stages[index];
  const next = stages[index + 1];

  if (!result.passed || !stage) return null;

  const score = Number(result.score ?? 100);
  return {
    challengeId,
    title: `${stage.title}已通过`,
    verified: "评测条件已全部满足",
    score: Number.isFinite(score) ? score : 100,
    nextId: next?.id ?? null,
    nextTitle: next?.title ?? "课程路线",
    errors: result.errors ?? [],
  };
}
