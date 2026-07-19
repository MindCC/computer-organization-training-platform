export function buildTeacherQuestModel(routeGroups = [], students = []) {
  const totalStudents = students.length;

  const stages = routeGroups.flatMap((group) =>
    group.items.map((item) => {
      const reached = students.filter(
        (s) => s.progress?.[item.id]?.status && s.progress[item.id].status !== "not-started",
      ).length;

      const completed = students.filter(
        (s) => s.progress?.[item.id]?.status === "completed",
      ).length;

      const completionRate = totalStudents > 0
        ? Math.round((completed / totalStudents) * 100)
        : 0;

      const blocker = determineBlocker(item.id, students);

      return {
        id: item.id,
        title: item.title,
        reached,
        completed,
        completionRate,
        blocker,
      };
    }),
  );

  return {
    stages,
    totalStudents,
  };
}

function determineBlocker(challengeId, students) {
  const errors = {};
  for (const s of students) {
    const p = s.progress?.[challengeId];
    if (!p || p.status === "completed" || p.status === "not-started") continue;
    for (const err of p.errors ?? []) {
      errors[err] = (errors[err] ?? 0) + 1;
    }
  }

  const top = Object.entries(errors).sort(([, a], [, b]) => b - a)[0];
  if (top) return `高频错误：「${top[0]}」（${top[1]} 人）`;

  const notEntered = students.filter(
    (s) => !s.progress?.[challengeId] || s.progress[challengeId].status === "not-started",
  ).length;

  if (notEntered > 0 && notEntered === students.length) return "无人进入本关";

  return "暂无集中卡点";
}

export function buildTeacherSetupSteps(context = {}) {
  const { hasClass, studentCount = 0, hasMission, hasStartedSession } = context;

  return [
    { id: "class", label: "创建或选择班级", completed: Boolean(hasClass) },
    { id: "import", label: `导入学生${studentCount > 0 ? `（${studentCount} 人）` : ""}`, completed: studentCount > 0 },
    { id: "mission", label: "选择课堂任务", completed: Boolean(hasMission) },
    { id: "start", label: "启动课堂", completed: Boolean(hasStartedSession) },
  ];
}

export function buildInterventionGroups(students = []) {
  const groups = [];

  const notEntered = students.filter((s) => {
    const records = Object.values(s.progress ?? {});
    return records.length === 0 || records.every((r) => (r?.attempts ?? 0) === 0);
  });

  if (notEntered.length > 0) {
    groups.push({
      id: "not-entered",
      label: `未进入实验（${notEntered.length} 人）`,
      severity: "warn",
      action: "推送提示",
      students: notEntered.map((s) => ({ id: s.id, displayName: s.displayName })),
    });
  }

  const repeatedFailures = students.filter((s) => {
    for (const p of Object.values(s.progress ?? {})) {
      if ((p?.attempts ?? 0) >= 3 && (p?.errors?.length ?? 0) >= 2) return true;
    }
    return false;
  });

  if (repeatedFailures.length > 0) {
    groups.push({
      id: "repeated-failure",
      label: `多次评测未通过（${repeatedFailures.length} 人）`,
      severity: "danger",
      action: "查看证据",
      students: repeatedFailures.map((s) => ({ id: s.id, displayName: s.displayName })),
    });
  }

  const completed = students.filter((s) => {
    const records = Object.values(s.progress ?? {});
    return records.length > 0 && records.some((r) => r?.status === "completed");
  });

  if (completed.length > 0) {
    groups.push({
      id: "completed-ready",
      label: `已完成并准备扩展（${completed.length} 人）`,
      severity: "success",
      action: "分配补充练习",
      students: completed.map((s) => ({ id: s.id, displayName: s.displayName })),
    });
  }

  return groups;
}
