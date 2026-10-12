// 顶栏「一级分组 + 二级菜单」的统一点击辅助。
// 课程首页、课后作业（学生）等单项目是一级直出按钮，可直接点；
// 课程课件/互动演示/学习记录/错题本/知识库/教师看板等
// 在二级菜单里，菜单未展开时对 Playwright 不可见，需要先展开所属分组。
// 用法：await clickTopNavItem(page, "学习记录");

// 二级按钮仍在 DOM 中（hidden），点击所属一级导航后再进入目标页。
export async function clickTopNavItem(page, label) {
  // 装机的主入口已迁入实训平台；旧装机回归仍验证相同的真实工作区。
  if (label === '硬件配置挑战') {
    await clickTopNavItem(page, '实训平台');
    await page.getByRole('button', { name: '进入硬件互动装机', exact: true }).click();
    return;
  }
  const item = page.locator(".topbar-nav-item").filter({ hasText: label }).first();
  if (!(await item.isVisible().catch(() => false))) {
    const secondary = page.locator('.topbar-nav-secondary', {has:item}).first();
    if (await secondary.count()) {
      const controls = await secondary.getAttribute('id');
      await page.locator(`.topbar-nav-primary [aria-controls="${controls}"]`).click();
      await item.waitFor({state:'visible'});
      await item.click();
      return;
    }
    const group = page
      .locator(".topbar-nav-group", {
        has: page.locator(".topbar-nav-item").filter({ hasText: label }),
      })
      .first();
    await group.locator(".topbar-nav-toggle").click();
    await item.waitFor({ state: "visible" });
  }
  await item.click();
}

// 返回当前主导航可见的一级按钮/分组文字（一级直出按钮 + 分组开关）。
export function visibleTopNavLabels(page) {
  return page
    .locator(".topbar-nav-primary > button, .topbar-nav > .topbar-nav-item, .topbar-nav > .topbar-nav-group > .topbar-nav-toggle")
    .allTextContents();
}
