import { clickCentered } from "./qaInteraction.mjs";

/**
 * 从课程首页打开指定关卡。
 *
 * 只认章节实验行与路线卡片这两类真正的关卡入口：顶栏的「继续实验 <当前关卡>」胶囊按钮
 * 也包含关卡标题，命中它只会点到不可见/不稳定的元素上。
 *
 * 首页按章节折叠，默认只展开第一章，因此目标关卡的入口可能根本不在 DOM 中：
 * 先把折叠章节全部展开，再按标题点击。
 */
const CHALLENGE_ENTRY_SELECTOR = ".project-experiment-row, .route-card";

export async function openChallengeFromHome(page, title) {
  const target = page.locator(CHALLENGE_ENTRY_SELECTOR).filter({ hasText: title }).first();
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
  await clickCentered(target);
}
