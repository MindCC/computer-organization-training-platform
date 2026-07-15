import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.PROTOTYPE_APP_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.PROTOTYPE_API_URL ?? "http://127.0.0.1:8787";
const teacherUsername = process.env.TEACHER_USERNAME ?? "teacher";
const teacherPassword = process.env.TEACHER_PASSWORD ?? "ChangeMe123!";
const artifactDir = process.env.QA_ARTIFACT_DIR
  ? path.resolve(process.env.QA_ARTIFACT_DIR)
  : path.join(__dirname, "..", "test-artifacts", "3d-verify");

await mkdir(artifactDir, { recursive: true });

let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
} catch {
  browser = await chromium.launch({ headless: true });
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log("  PASS " + name);
  } else {
    failed += 1;
    console.log("  FAIL " + name);
  }
}

async function expectOk(response, label) {
  if (response.ok) return response;
  const body = await response.text();
  throw new Error(`${label} failed: ${response.status} ${body}`);
}

const studentUsername = "3dstudent-" + Date.now();
const studentPassword = "Student123!";

try {
  console.log("1. Setup isolated test student via API");
  let response = await fetch(apiUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: teacherUsername, password: teacherPassword }),
  });
  await expectOk(response, "teacher login");
  const cookies = response.headers.get("set-cookie") ?? "";

  response = await fetch(apiUrl + "/api/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ name: "3D 验证班 " + Date.now() }),
  });
  await expectOk(response, "class creation");
  const classPayload = await response.json();
  const classId = classPayload.class.id;

  const csv = "学号,姓名,初始密码\n" + studentUsername + ",验证学生," + studentPassword;
  response = await fetch(apiUrl + "/api/teacher/classes/" + classId + "/import-students", {
    method: "POST",
    headers: { "Content-Type": "text/csv", Cookie: cookies },
    body: csv,
  });
  await expectOk(response, "student import");

  console.log("2. Login as student");
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByLabel("账号").fill(studentUsername);
  await page.getByLabel("密码").fill(studentPassword);
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByText("课程路线地图", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });

  console.log("3. Verify computer overview and assembly path");
  await page.getByRole("button").filter({ hasText: "认识计算机五大部件" }).last().click();
  await page.waitForSelector(".computer-exploded", { timeout: 20_000 });
  const canvas = page.locator(".computer-exploded canvas");
  check("Overview canvas exists", await canvas.count() > 0);
  check("Step mode button", await page.getByRole("button", { name: "分步组装" }).isVisible());
  check("Auto mode button", await page.getByRole("button", { name: "自动爆炸" }).isVisible());

  await page.getByRole("button", { name: "分步组装" }).click();
  await page.waitForSelector(".exploded-stepbar", { timeout: 10_000 });
  check("Step bar visible", await page.locator(".exploded-stepbar").isVisible());
  check("Step dots present", await page.locator(".exploded-step-indicator span").count() === 8);
  for (let step = 1; step <= 8; step += 1) {
    const label = await page.locator(".exploded-step-desc strong").textContent();
    check("Assembly step " + step + " has label", Boolean(label?.trim()));
    const nextButton = page.locator(".exploded-stepbar").getByRole("button", { name: "下一步" });
    if (step < 8) await nextButton.click();
  }
  check("Connections legend visible", await page.locator(".exploded-legend").isVisible());

  await page.getByRole("button", { name: "自动爆炸" }).click();
  await page.getByRole("button", { name: "查看 CPU 部件" }).click();
  check(
    "CPU info card shown",
    await page.locator(".exploded-info-card").getByText("CPU", { exact: true }).isVisible(),
  );
  check("Von Neumann overview present", await page.locator(".von-neumann-overview").isVisible());
  await page.screenshot({ path: path.join(artifactDir, "3d-overview.png"), fullPage: true });

  console.log("4. Verify hardware builder path");
  await page.getByRole("button", { name: /返回课程首页/ }).click();
  await page.locator(".sidebar-nav .nav-item").filter({ hasText: "硬件配置挑战" }).click();
  await page.waitForSelector(".builder-panel", { timeout: 20_000 });
  check("Builder 3D canvas", await page.locator(".computer-exploded canvas").count() > 0);
  check("Builder panel", await page.locator(".builder-panel").isVisible());
  check("Builder score", await page.locator(".builder-score").isVisible());
  await page.screenshot({ path: path.join(artifactDir, "3d-builder.png"), fullPage: true });

  assert.deepEqual(pageErrors, [], "3D QA must not emit page errors");
} catch (error) {
  console.error("Error:", error.message);
  failed += 1;
} finally {
  await browser.close();
}

console.log("\n" + passed + "/" + (passed + failed) + " passed");
if (failed) process.exit(1);
