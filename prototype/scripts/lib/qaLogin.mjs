/**
 * 浏览器门禁共用的登录步骤。
 *
 * 匿名访问时应用先渲染入口页：落地页的入口是「开始第一个实验」，退出登录后回到的
 * 游客首页入口是「登录」，两者都不直接显示表单。因此这里依次尝试这些入口，直到登录
 * 表单出现。输入框按 id 定位，避免依赖会随登录身份变化的 aria-label 文案。
 */
const ENTRY_BUTTONS = ["登录", "开始第一个实验"];

/**
 * 打开应用并等它就绪。
 *
 * 开发服务器带 HMR 长连接，`networkidle` 经常永远不会满足（首编译慢时尤其明显，
 * 直接导致 page.goto 超时）；改用 domcontentloaded，再等应用离开引导态。
 */
export async function gotoApp(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForAppReady(page);
}

async function waitForAppReady(page) {
  // 应用启动时会先渲染「正在连接课堂服务器…」，这期间页面上没有任何入口按钮。
  await page.waitForFunction(
    () => !document.body.innerText.includes("正在连接课堂服务器"),
    { timeout: 30_000 },
  ).catch(() => {});
}

export async function fillLoginForm(page, { username, password }) {
  const usernameField = page.locator("#login-username");
  await waitForAppReady(page);
  if (!(await usernameField.isVisible().catch(() => false))) {
    for (const name of ENTRY_BUTTONS) {
      const entry = page.getByRole("button", { name }).first();
      if (!(await entry.isVisible().catch(() => false))) continue;
      await entry.click();
      if (await usernameField.isVisible({ timeout: 5_000 }).catch(() => false)) break;
    }
  }
  if (!(await usernameField.isVisible().catch(() => false))) {
    await describeLoginPage(page);
  }
  await usernameField.waitFor({ state: "visible", timeout: 15_000 });
  await usernameField.fill(username);
  await page.locator("#login-password").fill(password);
}

/** 提交登录表单（按钮带有 .login-submit 类，避免与入口按钮同名）。 */
export async function submitLoginForm(page) {
  await page.locator("button.login-submit").click();
}

/** 找不到登录表单时把页面状态打出来，避免只看到一个超时。 */
async function describeLoginPage(page) {
  const buttons = await page.getByRole("button").allInnerTexts().catch(() => []);
  const bodyText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300)).catch(() => "");
  console.error("LOGIN DEBUG url:", page.url());
  console.error("LOGIN DEBUG buttons:", JSON.stringify(buttons.slice(0, 20)));
  console.error("LOGIN DEBUG body:", bodyText);
  await page.screenshot({ path: "qa-artifacts/login-debug.png", fullPage: true }).catch(() => {});
}
