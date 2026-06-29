import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { CIRCUIT_CHALLENGES } from "../src/circuit/challengeCircuitModel.js";

const text = {
  appTitle: "\u7ec4\u6210\u539f\u7406\u5b9e\u8bad\u5e73\u53f0",
  login: "\u767b\u5f55",
  teacherHeading: "\u73ed\u7ea7\u5b66\u60c5\u7ba1\u7406",
  className: "\u8ba1\u7ec4 UI Smoke \u73ed",
  studentNo: "ui-smoke-001",
  studentName: "\u6d4b\u8bd5\u5b66\u751f",
  studentPassword: "Student123!",
  createClass: "\u521b\u5efa\u73ed\u7ea7",
  importStudents: "\u5bfc\u5165\u5b66\u751f",
  fillReference: "\u586b\u5165\u53c2\u8003\u7ed3\u6784",
  submit: "\u63d0\u4ea4\u68c0\u6d4b",
  passed: "\u672c\u5173\u901a\u8fc7",
  backHome: "\u8fd4\u56de\u8bfe\u7a0b\u9996\u9875",
  records: "\u5b66\u4e60\u8bb0\u5f55",
  recordsTitle: "\u4e2a\u4eba\u5b66\u60c5\u8bb0\u5f55",
  profile: "\u5b66\u4e60\u6863\u6848",
  logout: "\u9000\u51fa\u767b\u5f55",
};

const baseUrl = process.env.PROTOTYPE_URL ?? "http://127.0.0.1:8787";
const teacherUsername = process.env.TEACHER_USERNAME ?? "teacher";
const teacherPassword = process.env.TEACHER_PASSWORD ?? "ChangeMe123!";
const defaultArtifactDirUrl = new URL("../qa-artifacts/", import.meta.url);
const artifactDir = process.env.QA_ARTIFACT_DIR ? path.resolve(process.env.QA_ARTIFACT_DIR) : fileURLToPath(defaultArtifactDirUrl);
const artifactDirUrl = new URL(`file:///${artifactDir.replace(/\\/g, "/")}${artifactDir.endsWith("\\") ? "" : "/"}`);

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

await mkdir(artifactDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });

await page.goto(baseUrl, { waitUntil: "networkidle" });
await assertVisible(page, text.appTitle);
await login(page, teacherUsername, teacherPassword);
await assertVisible(page, text.teacherHeading);
await page.screenshot({ path: artifactPath("teacher-empty.png"), fullPage: true });

await page.getByLabel("\u65b0\u73ed\u7ea7\u540d\u79f0").fill(text.className);
await page.getByRole("button", { name: text.createClass }).click();
await assertVisible(page, text.className);
await page.locator(".teacher-import-box").fill(`\u5b66\u53f7,\u59d3\u540d,\u521d\u59cb\u5bc6\u7801\n${text.studentNo},${text.studentName},${text.studentPassword}`);
await page.getByRole("button", { name: text.importStudents }).click();
await assertVisible(page, text.studentName);
await page.screenshot({ path: artifactPath("teacher-imported.png"), fullPage: true });

const csvText = await page.evaluate(async () => {
  const response = await fetch(document.querySelector('a[href$="/export.csv"]').href, { credentials: "include" });
  return response.text();
});
assert.match(csvText, new RegExp(text.studentNo));
assert.match(csvText, new RegExp(text.studentName));

await logout(page);
await login(page, text.studentNo, text.studentPassword);
await assertVisible(page, "\u8fd0\u7b97\u5668\u95ef\u5173\u8def\u5f84");

for (const challenge of CIRCUIT_CHALLENGES) {
  await openChallenge(page, challenge.title);
  await verifyReactFlowChallenge(page, challenge);
  await page.screenshot({ path: artifactPath(`student-lab-${challenge.id}.png`), fullPage: true });
  await page.getByRole("button", { name: new RegExp(text.backHome) }).click();
}

await openRecords(page);
await assertVisible(page, text.recordsTitle);
await page.reload({ waitUntil: "networkidle" });
await openRecords(page);
await assertVisible(page, text.recordsTitle);
await page.screenshot({ path: artifactPath("student-records-after-refresh.png"), fullPage: true });

await logout(page);
await login(page, teacherUsername, teacherPassword);
await assertVisible(page, text.teacherHeading);
await assertVisible(page, text.studentName);
await assertVisible(page, "100%");
await page.screenshot({ path: artifactPath("teacher-overview-after-student.png"), fullPage: true });

await page.setViewportSize({ width: 390, height: 900 });
await page.goto(baseUrl, { waitUntil: "networkidle" });
await assertVisible(page, text.teacherHeading);
await page.screenshot({ path: artifactPath("mobile-teacher.png"), fullPage: true });

await browser.close();
console.log("UI smoke check passed");

async function login(targetPage, username, password) {
  await targetPage.getByLabel("\u8d26\u53f7").fill(username);
  await targetPage.getByLabel("\u5bc6\u7801").fill(password);
  await targetPage.getByRole("button", { name: text.login }).click();
  await targetPage.waitForLoadState("networkidle");
}

async function logout(targetPage) {
  await targetPage.locator(".profile-button").click();
  await targetPage.getByRole("button", { name: text.logout }).click();
  await assertVisible(targetPage, text.login);
}

async function openChallenge(targetPage, title) {
  await targetPage.getByRole("button", { name: new RegExp(title) }).first().click();
  await assertVisible(targetPage, title);
}

async function openRecords(targetPage) {
  await targetPage.locator(".sidebar-nav .nav-item").filter({ hasText: text.records }).click();
}

async function verifyReactFlowChallenge(targetPage, challenge) {
  const workbench = targetPage.locator(".circuit-flow-workbench");
  await targetPage.getByTestId("react-flow-circuit-canvas").waitFor({ state: "visible", timeout: 10_000 });
  await workbench.getByText(challenge.title).first().waitFor({ state: "visible", timeout: 10_000 });
  await targetPage.waitForFunction(
    ({ expectedNodes }) => document.querySelectorAll(".react-flow__node").length >= expectedNodes,
    { expectedNodes: challenge.nodes.length },
  );
  await workbench.getByRole("button", { name: text.fillReference }).click();
  await targetPage.waitForFunction(
    ({ expectedEdges }) => document.querySelectorAll(".react-flow__edge").length >= expectedEdges,
    { expectedEdges: challenge.requiredEdges.length },
  );
  await workbench.getByRole("button", { name: text.submit }).click();
  await workbench.getByText(text.passed).first().waitFor({ state: "visible", timeout: 10_000 });
}

async function assertVisible(targetPage, visibleText) {
  await targetPage.getByText(visibleText, { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await targetPage.getByText(visibleText, { exact: false }).first().isVisible(), true);
}

function artifactPath(fileName) {
  return fileURLToPath(new URL(fileName, artifactDirUrl));
}
