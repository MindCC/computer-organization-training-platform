// 顶栏「一级分组 + 二级菜单」的统一点击辅助。
// 课程首页、课后作业（学生）等单项目是一级直出按钮，可直接点；
// 课程课件/互动演示/硬件配置挑战/学习记录/错题本/知识库/教师看板等
// 在二级菜单里，菜单未展开时对 Playwright 不可见，需要先展开所属分组。
// 用法：await clickTopNavItem(page, "学习记录");

// 菜单闭合时二级按钮仍在 DOM 中（hidden），因此可以用 CSS 文本匹配定位所属分组，
// 再悬停展开（与真实鼠标行为一致），最后点击目标项。
export async function clickTopNavItem(page, label) {
  const item = page.locator(".topbar-nav-item").filter({ hasText: label }).first();
  if (!(await item.isVisible().catch(() => false))) {
    const group = page
      .locator(".topbar-nav-group", {
        has: page.locator(".topbar-nav-item").filter({ hasText: label }),
      })
      .first();
    await group.locator(".topbar-nav-toggle").hover();
    await item.waitFor({ state: "visible" });
  }
  await item.click();
}

// 返回当前主导航可见的一级按钮/分组文字（一级直出按钮 + 分组开关）。
export function visibleTopNavLabels(page) {
  return page
    .locator(".topbar-nav > .topbar-nav-item, .topbar-nav > .topbar-nav-group > .topbar-nav-toggle")
    .allTextContents();
}
