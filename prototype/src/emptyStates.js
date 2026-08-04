/**
 * 空状态引导逻辑（纯函数）。
 * P1-A：学生首页 / 教师看板 / 笔记页在无数据时给出明确下一步，
 * 避免大片空白，并提供一个可点击的行动入口。
 */

/** 学生首页空状态：没有任何尝试记录时，引导从第一章第一关开始。 */
export function buildStudentHomeEmptyState(summary = {}, routeGroups = []) {
  if (Number(summary?.totalAttempts) > 0) return null;
  const firstStage = routeGroups?.[0]?.items?.[0];
  return {
    title: firstStage
      ? `建议从第一章「${firstStage.title}」开始探索`
      : "建议从第一章「认识计算机五大部件」开始探索",
    description: "完成第一个实验后，这里会展示你的完成率、平均分和下一步建议。",
    ctaLabel: firstStage ? "开始第一个实验" : "开始探索",
    targetId: firstStage?.id ?? null,
  };
}

/** 教师看板空状态：班级已导入学生但全员零提交时给出引导；无学生或已有提交返回 null。 */
export function buildTeacherEmptyState(students = []) {
  if (students.length === 0) return null; // 已有「暂无学生数据」空状态覆盖
  const hasAnyAttempt = students.some((s) => Number(s?.summary?.totalAttempts) > 0);
  if (hasAnyAttempt) return null;
  return {
    title: "还没有提交数据",
    description: "让学生登录并完成第一关，提交数据会出现在这里。",
    actionLabel: "查看导入模板",
    actionHref: "data:text/csv;charset=utf-8,%E5%AD%A6%E5%8F%B7%2C%E5%A7%93%E5%90%8D%2C%E5%88%9D%E5%A7%8B%E5%AF%86%E7%A0%81%0A2026001%2C%E6%9D%8E%E5%90%8C%E5%AD%A6%2CStudent123!",
  };
}
