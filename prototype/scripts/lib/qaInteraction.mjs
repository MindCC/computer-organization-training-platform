/**
 * 点击前先把元素滚到视口中间。
 *
 * 应用顶栏是固定定位的：`scrollIntoViewIfNeeded` 会把目标贴到视口顶端，
 * 正好落在顶栏下面，于是点击被顶栏拦截（表现为 "intercepts pointer events" 超时）。
 * 先居中再点击可以避开这类重叠。
 *
 * 页面已经滚到底部时无法再居中（顶部控件仍会停在顶栏之下），此时回到页面顶部重试——
 * 这也正是真人用户会做的动作。
 */
export async function clickCentered(locator) {
  await locator.evaluate((element) => element.scrollIntoView({ block: "center", inline: "center" }));
  try {
    await locator.click({ timeout: 5_000 });
  } catch (error) {
    await locator.evaluate(() => window.scrollTo({ top: 0 }));
    await locator.click();
  }
}
