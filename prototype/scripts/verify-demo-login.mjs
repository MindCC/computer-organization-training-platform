/**
 * 登录页一键演示登录 + 「先浏览课程」对比度验证
 * 前置：API(8787) 与 Vite(5173) 已启动。
 */
import { chromium } from "playwright";
import { clickTopNavItem } from "./nav-helpers.mjs";

const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function luminance(rgb) {
  const m = String(rgb ?? "").match(/[\d.]+/g);
  if (!m || m.length < 3) return 0;
  const [r, g, b] = m.slice(0, 3).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(c1, c2) {
  const l1 = luminance(c1), l2 = luminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("[pageerror]", String(err).slice(0, 300)));

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector(".login-portal", { timeout: 10000 });

  // 1. 演示按钮存在且文案正确
  const demoBtn = page.locator(".demo-login-button");
  check("一键演示按钮渲染", await demoBtn.count() === 1 && (await demoBtn.innerText()).includes("一键体验演示账号"));

  // 2. 「先浏览课程」对比度修复：文字与按钮底色对比 ≥ 3
  const backBtn = page.locator(".login-back");
  const styles = await backBtn.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, background: cs.backgroundColor, borderColor: cs.borderColor, borderWidth: cs.borderWidth };
  });
  console.log("  [debug] login-back styles:", JSON.stringify(styles));
  const ratioText = contrastRatio(styles.color, styles.backgroundColor || panelBgFallback(styles));
  function panelBgFallback() { return "rgba(33, 26, 41, 1)"; }
  check("「先浏览课程」文字提亮（非 muted 灰）", styles.color !== "rgb(185, 175, 191)", styles.color);
  check("按钮有描边或底色（不再融入背景）", styles.borderWidth !== "0px" || !String(styles.backgroundColor).includes(", 0)"), `${styles.borderWidth} / ${styles.backgroundColor}`);
  check("文字与按钮底色对比 ≥ 3（可读）", ratioText >= 3, `contrast = ${ratioText.toFixed(2)}`);

  // 3. 一键演示登录 → 落到课程首页且已认证
  await demoBtn.click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  check("一键演示登录落到课程首页", true);
  check("顶栏显示演示学生", (await page.locator(".profile-button").innerText()).length > 0);

  // 4. 登录后学习记录可用
  await clickTopNavItem(page, "学习记录");
  await page.waitForSelector(".records-screen", { timeout: 15000 });
  check("演示账号学习记录大屏可用", await page.locator(".learning-tree-canvas").count() === 1);

  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
