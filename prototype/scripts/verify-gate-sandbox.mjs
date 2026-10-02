/**
 * 逻辑门沙盒 E2E 验收：
 * 1. 实验台可切到沙盒模式，调色板 7 个门、起始 4 个节点、无页面错误；
 * 2. 拖线把 输入A → 与门 → 输出 连起来，实时仿真出结果；
 * 3. 点输入开关切换 0/1，输出跟着变；
 * 4. 从调色板拖一个异或门到画布上。
 *
 * 前置：API(8787) 与 Vite(5173) 已启动，演示班级已 seed。
 */
import { chromium } from "playwright";

const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  // 登录并进实验台（与门）
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

  // 1. 切到沙盒
  await page.locator(".sandbox-toggle", { hasText: "逻辑门沙盒" }).click();
  await page.waitForSelector(".sandbox", { timeout: 10000 });
  check("沙盒模式可进入", await page.locator(".sandbox").count() === 1);
  check("调色板 7 个逻辑门", (await page.locator(".sandbox-gate").count()) === 7, await page.locator(".sandbox-gate").allTextContents().then((t) => t.join("|")));
  check("起始 4 个节点", (await page.locator(".react-flow__node").count()) === 4);
  check("无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));

  // 节点定位：输入A(input-1 上)、输入B(input-2 下)、与门(and-3)、输出(output-4)
  const nodeBox = async (idx) => await page.locator(".react-flow__node").nth(idx).boundingBox();

  // 2. 拖线：输入A.out → 与门.a
  async function connect(fromNodeIdx, fromHandleSel, toNodeIdx, toHandleSel) {
    const fromBox = await nodeBox(fromNodeIdx);
    const toBox = await nodeBox(toNodeIdx);
    const fromHandle = page.locator(".react-flow__node").nth(fromNodeIdx).locator(fromHandleSel);
    const toHandle = page.locator(".react-flow__node").nth(toNodeIdx).locator(toHandleSel);
    const fh = await fromHandle.boundingBox();
    const th = await toHandle.boundingBox();
    await page.mouse.move(fh.x + fh.width / 2, fh.y + fh.height / 2);
    await page.mouse.down();
    await page.mouse.move(th.x + th.width / 2, th.y + th.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }

  // React Flow 句柄：source 在右(output)、target 在左(input)
  // input-1(0) 的 out 句柄 → and-3(2) 的 a 句柄（第一个 input）
  await connect(0, ".circuit-flow-handle.output", 2, ".circuit-flow-handle.input >> nth=0");
  // input-2(1) 的 out 句柄 → and-3(2) 的 b 句柄（第二个 input）
  await connect(1, ".circuit-flow-handle.output", 2, ".circuit-flow-handle.input >> nth=1");
  // and-3(2) 的 c 句柄 → output-4(3) 的 in 句柄
  await connect(2, ".circuit-flow-handle.output", 3, ".circuit-flow-handle.input >> nth=0");

  const edgeCount = await page.locator(".react-flow__edge").count();
  check("连出 3 条导线", edgeCount === 3, `实际 ${edgeCount}`);

  // 初始 A=0,B=0 → 输出应为 0
  const outputValue = async () => await page.locator(".react-flow__node").nth(3).locator(".circuit-flow-port-value").first().innerText().catch(() => "?");
  check("初始输出为 0", (await outputValue()) === "0", await outputValue());

  // 3. 点输入A → A=1；A=1,B=0 → 与门输出仍 0
  await page.locator(".react-flow__node").nth(0).click();
  await page.waitForTimeout(400);
  const aVal = await page.locator(".react-flow__node").nth(0).locator(".circuit-flow-port-value").first().innerText();
  check("点输入A后 A=1", aVal === "1", aVal);
  check("A=1,B=0 → 输出仍为 0", (await outputValue()) === "0", await outputValue());

  // 点输入B → B=1；A=1,B=1 → 输出 1
  await page.locator(".react-flow__node").nth(1).click();
  await page.waitForTimeout(400);
  check("A=1,B=1 → 输出变为 1", (await outputValue()) === "1", await outputValue());

  // 4. 从调色板拖异或门到画布
  const gateCountBefore = await page.locator(".react-flow__node").count();
  await page.locator('.sandbox-gate[data-kind="xor"]').dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 420, y: 380 } }).catch(async () => {
    // dragTo 对部分 HTML5 DnD 场景不稳，退化为手动 mouse 拖拽
    const src = await page.locator('.sandbox-gate[data-kind="xor"]').boundingBox();
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + 500, src.y + 300, { steps: 10 });
    await page.mouse.up();
  });
  await page.waitForTimeout(600);
  const gateCountAfter = await page.locator(".react-flow__node").count();
  check("拖入异或门后节点 +1", gateCountAfter === gateCountBefore + 1, `${gateCountBefore} → ${gateCountAfter}`);

  check("全程无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
  await page.screenshot({ path: "qa-artifacts/logic-gate-sandbox.png" });
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
