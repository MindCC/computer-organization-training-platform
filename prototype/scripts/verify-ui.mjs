import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { CIRCUIT_CHALLENGES } from "../src/circuit/challengeCircuitModel.js";
import { CHALLENGES } from "../src/platformLogic.js";

const text = {
  appTitle: "\u7ec4\u6210\u539f\u7406\u5b9e\u8bad\u5e73\u53f0",
  login: "\u767b\u5f55",
  teacherHeading: "\u73ed\u7ea7\u5b66\u60c5\u7ba1\u7406",
  className: "\u8ba1\u7ec4 UI Smoke \u73ed " + Date.now(),
  studentNo: "ui-smoke-" + Date.now(),
  studentName: "\u6d4b\u8bd5\u5b66\u751f",
  studentPassword: "Student123!",
  createClass: "\u521b\u5efa\u73ed\u7ea7",
  importStudents: "\u5bfc\u5165\u5b66\u751f",
  importTemplate: "\u4e0b\u8f7d\u5bfc\u5165\u6a21\u677f",
  classroomSettings: "\u8bfe\u5802\u8bbe\u7f6e",
  smartAssistant: "\u667a\u80fd\u52a9\u6559",
  generateAssistant: "\u751f\u6210 AI \u52a9\u6559\u5efa\u8bae",
  localFallback: "\u672c\u5730\u964d\u7ea7\u5efa\u8bae",
  deepseekGenerated: "DeepSeek \u751f\u6210",
  missingDeepseekKey: "DEEPSEEK_API_KEY \u672a\u914d\u7f6e",
  viewDetail: "\u67e5\u770b\u8be6\u60c5",
  studentDetail: "\u5b66\u751f\u8be6\u60c5",
  viewReference: "\u67e5\u770b\u53c2\u8003\u7ed3\u6784",
  fillReference: "\u586b\u5165\u53c2\u8003\u7ed3\u6784",
  casePanel: "\u7528\u4f8b\u5c55\u793a",
  liveDataFlow: "\u5b9e\u65f6\u6570\u636e\u6d41\u52a8\u68c0\u6d4b",
  submit: "\u63d0\u4ea4\u68c0\u6d4b",
  passed: "\u672c\u5173\u901a\u8fc7",
  backHome: "\u8fd4\u56de\u8bfe\u7a0b\u9996\u9875",
  records: "\u5b66\u4e60\u8bb0\u5f55",
  recordsTitle: "\u4e2a\u4eba\u5b66\u60c5\u8bb0\u5f55",
  dataJourney: "\u6570\u636e\u65c5\u7a0b",
  journeyCheckpoint: "\u6570\u636e\u65c5\u7a0b\u68c0\u67e5\u70b9",
  pcToMar: "PC -> MAR",
  machineNumberQuiz: "\u673a\u5668\u6570\u5c0f\u6d4b",
  twosComplement: "\u8865\u7801",
  profile: "\u5b66\u4e60\u6863\u6848",
  logout: "\u9000\u51fa\u767b\u5f55",
};

const baseUrl = process.env.PROTOTYPE_URL ?? "http://127.0.0.1:8787";
const teacherUsername = process.env.TEACHER_USERNAME ?? "teacher";
const teacherPassword = process.env.TEACHER_PASSWORD ?? "ChangeMe123!";
const legacyOverviewChallenges = CHALLENGES.filter(
  (challenge) => !CIRCUIT_CHALLENGES.some((circuitChallenge) => circuitChallenge.id === challenge.id),
);
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
await page.locator(".teacher-studio-actions").getByRole("button", { name: text.classroomSettings }).click();
const templateHref = await page.locator(".settings-template-link").getAttribute("href");
assert.match(templateHref ?? "", /^data:text\/csv/);
await assertVisible(page, text.importStudents);
await page.getByRole("button", { name: "\u5173\u95ed" }).click();
await page.screenshot({ path: artifactPath("teacher-empty.png"), fullPage: true });

await page.getByLabel("\u65b0\u73ed\u7ea7\u540d\u79f0").fill(text.className);
await page.getByRole("button", { name: text.createClass }).click();
await assertVisible(page, text.className);
await selectClass(page, text.className);
await assertVisible(page, text.smartAssistant);
await page.getByRole("button", { name: text.generateAssistant }).click();
await assertAssistantReportGenerated(page);
assert.equal(await page.locator(".teacher-import-panel").count(), 0);
await page.locator(".teacher-studio-actions").getByRole("button", { name: text.classroomSettings }).click();
await page.getByLabel("\u5b66\u751f\u5bfc\u5165 CSV").fill(`\u5b66\u53f7,\u59d3\u540d,\u521d\u59cb\u5bc6\u7801\n${text.studentNo},${text.studentName},${text.studentPassword}`);
await page.getByRole("button", { name: text.importStudents }).click();
await page.getByRole("button", { name: "\u5173\u95ed" }).click();
await page.locator(".teacher-student-table").getByText(text.studentName).waitFor({ state: "visible", timeout: 10_000 });
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
await assertVisible(page, text.dataJourney);

for (const challenge of legacyOverviewChallenges) {
  await openChallenge(page, challenge.title);
  await verifyLegacyChallenge(page, challenge);
  await page.screenshot({ path: artifactPath(`student-lab-${challenge.id}.png`), fullPage: true });
  await page.getByRole("button", { name: new RegExp(text.backHome) }).click();
}

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
await selectClass(page, text.className);
await assertVisible(page, text.studentName);
await assertVisible(page, "100%");
await page.locator(".teacher-student-table .record-row").filter({ hasText: text.studentName }).last().getByRole("button", { name: text.viewDetail }).click();
const detailPanel = page.locator(".teacher-detail-panel");
await detailPanel.waitFor({ state: "visible", timeout: 10_000 });
await detailPanel.getByText(text.studentDetail).waitFor({ state: "visible", timeout: 10_000 });
await detailPanel.getByText("\u9010\u5173\u6700\u4f73\u6210\u7ee9").waitFor({ state: "visible", timeout: 10_000 });
await detailPanel.getByText("\u6700\u8fd1\u63d0\u4ea4").waitFor({ state: "visible", timeout: 10_000 });
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

async function selectClass(targetPage, className) {
  const classButton = targetPage.locator(".teacher-class").filter({ hasText: className }).last();
  await classButton.waitFor({ state: "visible", timeout: 10_000 });
  await classButton.click();
}

async function assertAssistantReportGenerated(targetPage) {
  await targetPage.waitForFunction(
    ({ fallbackText, aiText }) => document.body.innerText.includes(fallbackText) || document.body.innerText.includes(aiText),
    { fallbackText: text.localFallback, aiText: text.deepseekGenerated },
  );

  const fallbackVisible = await targetPage.getByText(text.localFallback, { exact: false }).first().isVisible().catch(() => false);
  if (fallbackVisible) {
    await assertVisible(targetPage, text.missingDeepseekKey);
  }
}

async function verifyLegacyChallenge(targetPage, challenge) {
  await assertVisible(targetPage, challenge.title);
  await targetPage.getByRole("button", { name: text.viewReference }).first().click();
  await targetPage.getByRole("button", { name: text.submit }).first().click();
  await assertVisible(targetPage, text.passed);
}

async function verifyReactFlowChallenge(targetPage, challenge) {
  const workbench = targetPage.locator(".circuit-flow-workbench");
  await targetPage.getByTestId("react-flow-circuit-canvas").waitFor({ state: "visible", timeout: 10_000 });
  await workbench.getByText(challenge.title).first().waitFor({ state: "visible", timeout: 10_000 });
  await workbench.getByText(text.casePanel).waitFor({ state: "visible", timeout: 10_000 });
  await workbench.getByText(text.liveDataFlow).waitFor({ state: "visible", timeout: 10_000 });
  await targetPage.waitForFunction(
    ({ expectedNodes }) => document.querySelectorAll(".react-flow__node").length >= expectedNodes,
    { expectedNodes: challenge.nodes.length },
  );
  if (challenge.id === "data-flow") {
    await dragRequiredEdge(targetPage, challenge.requiredEdges[0]);
    await targetPage.waitForFunction(() => document.querySelectorAll(".react-flow__edge").length >= 1);
    await workbench.locator(".circuit-flow-edge-signal").first().waitFor({ state: "visible", timeout: 10_000 });
    await workbench.getByRole("button", { name: "\u91cd\u7f6e" }).click();
  }
  if (challenge.id === "instruction-data") {
    await assertVisible(targetPage, text.journeyCheckpoint);
    await assertVisible(targetPage, text.pcToMar);
  }
  if (challenge.id === "machine-number") {
    await assertVisible(targetPage, text.machineNumberQuiz);
    await assertVisible(targetPage, text.twosComplement);
    await assertVisible(targetPage, "1011");
  }
  await workbench.getByRole("button", { name: text.fillReference }).click();
  await targetPage.waitForFunction(
    ({ expectedEdges }) => document.querySelectorAll(".react-flow__edge").length >= expectedEdges,
    { expectedEdges: challenge.requiredEdges.length },
  );
  await workbench.getByRole("button", { name: text.submit }).click();
  await workbench.getByText(text.passed).first().waitFor({ state: "visible", timeout: 10_000 });
}

async function dragRequiredEdge(targetPage, edge) {
  const source = targetPage.getByTestId(`port-${edge.from.nodeId}-${edge.from.portId}`);
  const target = targetPage.getByTestId(`port-${edge.to.nodeId}-${edge.to.portId}`);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  assert.ok(sourceBox, "source port is visible");
  assert.ok(targetBox, "target port is visible");
  await targetPage.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await targetPage.mouse.down();
  await targetPage.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await targetPage.mouse.up();
}

async function assertVisible(targetPage, visibleText) {
  await targetPage.getByText(visibleText, { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await targetPage.getByText(visibleText, { exact: false }).first().isVisible(), true);
}

function artifactPath(fileName) {
  return fileURLToPath(new URL(fileName, artifactDirUrl));
}
