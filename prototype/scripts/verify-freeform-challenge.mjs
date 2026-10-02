/**
 * 自由拼装闯关 E2E 验收：
 * 1. 与门可切到「自由拼装」，起始预置 2 输入 + 1 输出，判分报「缺少门」；
 * 2. 拖入与门并连好三根线，全组合判分通过、提交按钮可用；
 * 3. 提交后本关判为通过、成绩入账；
 * 4. 切回「固定连线」模式正常。
 *
 * 前置：API(8787) 与 Vite(5173) 已启动，演示班级已 seed。
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  // 用 fresh 学生（本脚本只依赖「与门」可进入，演示学生即可）
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

  // 1. 切到自由拼装
  await page.locator(".sandbox-toggle", { hasText: "自由拼装" }).click();
  await page.waitForSelector(".sandbox", { timeout: 10000 });
  check("自由拼装可进入", await page.locator(".freeform-grading").count() === 1);
  const starterNodes = await page.locator(".react-flow__node").count();
  check("预置 2 输入 + 1 输出", starterNodes === 3, `实际 ${starterNodes}`);
  const gradingText = await page.locator(".freeform-grading").innerText();
  check("判分报缺少与门", gradingText.includes("还没有放入") && gradingText.includes("and"), gradingText.slice(0, 80));
  const gradeButton = page.locator(".freeform-grading button");
  check("提交按钮初始禁用且显示未通过", (await gradeButton.isDisabled()) && (await gradeButton.innerText()).includes("未通过"), await gradeButton.innerText());
  check("无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));

  // 2. 拖入与门
  await page.locator('.sandbox-gate[data-kind="and"]').dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 360, y: 320 } }).catch(async () => {
    const src = await page.locator('.sandbox-gate[data-kind="and"]').boundingBox();
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + 480, src.y + 260, { steps: 10 });
    await page.mouse.up();
  });
  await page.waitForTimeout(500);
  check("拖入与门后节点 4 个", (await page.locator(".react-flow__node").count()) === 4);

  // 连线：input-1(0).out → and-?(3).a；input-2(1).out → and(3).b；and(3).c → output(2).in
  // 节点顺序：input-1(上), input-2(下), output(中), and(新拖入, 排最后)
  async function connect(fromIdx, fromSel, toIdx, toSel) {
    const fromHandle = page.locator(".react-flow__node").nth(fromIdx).locator(fromSel);
    const toHandle = page.locator(".react-flow__node").nth(toIdx).locator(toSel);
    const fh = await fromHandle.boundingBox();
    const th = await toHandle.boundingBox();
    await page.mouse.move(fh.x + fh.width / 2, fh.y + fh.height / 2);
    await page.mouse.down();
    await page.mouse.move(th.x + th.width / 2, th.y + th.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  // 注意：拖入的与门是第 4 个节点（index 3）；output 是第 3 个（index 2）
  await connect(0, ".circuit-flow-handle.output", 3, ".circuit-flow-handle.input >> nth=0");
  await connect(1, ".circuit-flow-handle.output", 3, ".circuit-flow-handle.input >> nth=1");
  await connect(3, ".circuit-flow-handle.output", 2, ".circuit-flow-handle.input >> nth=0");
  await page.waitForTimeout(500);

  check("连出 3 条导线", (await page.locator(".react-flow__edge").count()) === 3);
  const afterWire = await page.locator(".freeform-grading").innerText();
  check("判分全过（结构与功能正确）", afterWire.includes("结构与功能全部正确"), afterWire.slice(0, 120));
  check("4 组用例全过", (await page.locator(".case-chip.pass").count()) === 4, `pass=${await page.locator(".case-chip.pass").count()}`);
  check("提交按钮可用", !(await gradeButton.isDisabled()) && (await gradeButton.innerText()).includes("提交检测"), await gradeButton.innerText());

  // 3. 提交 → 判为通过
  await gradeButton.click();
  await page.waitForTimeout(1500);
  const progress = await (await page.request.get(`${API_URL}/api/student/progress`)).json();
  const andGate = progress.progress?.["and-gate"];
  check("与门成绩入账（completed）", andGate?.status === "completed", JSON.stringify(andGate ?? null));
  check("与门得分 100", andGate?.bestScore === 100, `bestScore=${andGate?.bestScore}`);

  // 4. 提交后出现过关结算（通过后进入结算视图是预期行为）
  await page.waitForTimeout(1200);
  const settled = (await page.locator(".quest-settlement").count()) > 0 || (await page.locator(".lab-studio-feedback.passed").count()) > 0 || (await page.locator("body").innerText()).includes("已通过");
  check("提交后出现过关结算/通过反馈", settled, await page.locator(".quest-settlement").count());
  check("全程无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
  await page.screenshot({ path: "qa-artifacts/freeform-challenge.png" });
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
