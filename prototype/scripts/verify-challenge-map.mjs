/**
 * 挑战路径章节收起 + 依赖地图（仿图灵完备）验收：
 * 1. 侧栏章节默认只展开当前关所在章，其余收起；点击章节头可展开；
 * 2. 「依赖地图」渲染 18 个关卡节点与依赖连线，状态着色（已完成/可做/未解锁）；
 * 3. 依赖解锁：演示学生完成 8 关（到异或门），半加器可做、全加器未解锁；
 * 4. 点地图节点进入对应挑战。
 */
import { chromium } from "playwright";

const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
const API_URL = process.env.QA_API_URL ?? "http://127.0.0.1:8787";

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector(".login-portal", { timeout: 10000 });
  await page.locator(".demo-login-button").click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  const ch3 = page.locator(".project-chapter-toggle", { hasText: "第 3 章" });
  await ch3.click();
  await page.waitForTimeout(400);
  await page.locator(".project-chapter", { has: ch3 }).locator("button.project-experiment-row").filter({ hasText: "与门" }).first().click();
  await page.waitForSelector(".lab-studio", { timeout: 20000 });
  await page.waitForTimeout(1200);

  // 1. 章节收起：默认只有第 3 章展开
  const expandedChapters = await page.locator(".lab-studio-step-chapter:not(.collapsed)").count();
  const totalChapters = await page.locator(".lab-studio-step-chapter").count();
  check("默认只展开当前章（8 章中 1 章展开）", expandedChapters === 1 && totalChapters === 8, `展开 ${expandedChapters}/${totalChapters}`);
  const collapsedCount = await page.locator(".lab-studio-step-chapter.collapsed").count();
  check("其余章节收起（7 章收起）", collapsedCount === 7, `收起 ${collapsedCount}`);

  // 点开另一章 → 展开
  await page.locator(".lab-studio-step-chapter", { hasText: "第四章" }).click();
  await page.waitForTimeout(300);
  check("点击章节头展开该章", (await page.locator(".lab-studio-step-chapter:not(.collapsed)").count()) === 2);

  // 全收起 / 全展开
  await page.locator(".route-fold-btn", { hasText: "全收起" }).click();
  await page.waitForTimeout(300);
  check("全收起后 0 章展开", (await page.locator(".lab-studio-step-chapter:not(.collapsed)").count()) === 0);
  await page.locator(".route-fold-btn", { hasText: "全展开" }).click();
  await page.waitForTimeout(300);
  check("全展开后 8 章展开", (await page.locator(".lab-studio-step-chapter:not(.collapsed)").count()) === 8);

  // 2. 依赖地图
  await page.locator(".sandbox-toggle", { hasText: "依赖地图" }).click();
  await page.waitForSelector(".challenge-map-wrap", { timeout: 10000 });
  check("依赖地图可进入", await page.locator(".challenge-map-wrap").count() === 1);
  check("地图 18 个关卡节点", (await page.locator(".map-node").count()) === 18, `实际 ${await page.locator(".map-node").count()}`);
  check("依赖连线存在", (await page.locator(".react-flow__edge").count()) >= 17, `边 ${await page.locator(".react-flow__edge").count()}`);
  check("无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));

  // 3. 依赖解锁状态（数据驱动：每个 locked 关卡都必有未完成的依赖）
  const progress = await (await page.request.get(`${API_URL}/api/student/progress`)).json();
  const prog = progress.progress ?? {};
  const { CHALLENGE_DEPS, isUnlocked } = await import("../src/challengeDependencies.js");
  const lockedIds = Object.keys(prog).filter((id) => prog[id]?.status === "locked" && CHALLENGE_DEPS[id]);
  const lockedWithDepsDone = lockedIds.filter((id) => isUnlocked(id, prog));
  check("每个未解锁关卡都有未完成的依赖（依赖驱动）", lockedWithDepsDone.length === 0, `异常: ${lockedWithDepsDone.join(",") || "无"}`);
  const openNodes = await page.locator(".map-node.open").count();
  const doneNodes = await page.locator(".map-node.done").count();
  check("地图上已完成节点 > 0 且可做节点 > 0", doneNodes > 0 && openNodes > 0, `done=${doneNodes} open=${openNodes}`);
  const completedCount = Object.entries(prog).filter(([id, r]) => CHALLENGE_DEPS[id] && r?.status === "completed").length;
  check("地图 done 节点数 = 已完成关卡数", doneNodes === completedCount, `map=${doneNodes} api=${completedCount}`);

  // 4. 点节点进入对应挑战
  await page.locator(".map-node", { hasText: "或门" }).first().click();
  await page.waitForTimeout(1200);
  const currentTitle = await page.locator(".lab-studio-current strong").innerText();
  check("点或门节点进入或门挑战", currentTitle.includes("或门"), currentTitle);
  check("全程无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
  await page.screenshot({ path: "qa-artifacts/challenge-map.png", fullPage: false });
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
