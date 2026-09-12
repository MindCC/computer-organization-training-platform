/**
 * 从课程首页打开指定关卡。
 *
 * 首页按章节折叠，默认只展开第一章，因此目标关卡的按钮可能根本不在 DOM 中：
 * 先把折叠章节全部展开，再按关卡标题点击。
 */
export async function openChallengeFromHome(page, title) {
  const target = page.getByRole("button").filter({ hasText: title }).first();
  if (!(await target.isVisible().catch(() => false))) {
    const toggles = page.locator(".project-chapter-toggle");
    const toggleCount = await toggles.count();
    for (let index = 0; index < toggleCount; index += 1) {
      const toggle = toggles.nth(index);
      if ((await toggle.getAttribute("aria-expanded")) !== "true") {
        await toggle.click();
      }
    }
  }
  await target.click();
}
