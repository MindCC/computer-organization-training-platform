/**
 * 教师看板是「工作区 → 统计分类」两级标签：
 *   教学活动 / 学情统计（学情洞察、学习监控、学情分析助手、学情明细）
 * 各区块只在对应标签下渲染，断言前必须先切到承载该区块的标签。
 */
export async function openTeacherWorkspace(page, workspaceLabel, statisticLabel = null) {
  const workspace = page.getByRole("button", { name: workspaceLabel, exact: true });
  await workspace.waitFor({ state: "visible", timeout: 20_000 });
  if ((await workspace.getAttribute("aria-pressed")) !== "true") {
    await workspace.click();
  }
  if (!statisticLabel) return;
  const statistic = page.getByRole("button", { name: statisticLabel, exact: true });
  await statistic.waitFor({ state: "visible", timeout: 20_000 });
  if ((await statistic.getAttribute("aria-pressed")) !== "true") {
    await statistic.click();
  }
}

export const TEACHER_WORKSPACE = {
  teaching: "教学活动",
  statistics: "学情统计",
  insight: "学情洞察",
  monitor: "学习监控",
  assistant: "学情分析助手",
  students: "学情明细",
};
