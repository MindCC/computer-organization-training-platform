import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { CIRCUIT_CHALLENGES } from "../src/circuit/challengeCircuitModel.js";

const text = {
  title: "\u7ec4\u6210\u539f\u7406\u5b9e\u8bad\u5e73\u53f0",
  route: "\u8fd0\u7b97\u5668\u95ef\u5173\u8def\u5f84",
  oldHeroName: "\u9648\u4e00\u9e23\uff0c\u7ee7\u7eed\u628a\u8fd0\u7b97\u5668\u62fc\u8d77\u6765\u3002",
  backHome: "\u8fd4\u56de\u8bfe\u7a0b\u9996\u9875",
  fillReference: "\u586b\u5165\u53c2\u8003\u7ed3\u6784",
  submit: "\u63d0\u4ea4\u68c0\u6d4b",
  passed: "\u672c\u5173\u901a\u8fc7",
  records: "\u5b66\u4e60\u8bb0\u5f55",
  recordsTitle: "\u4e2a\u4eba\u5b66\u60c5\u8bb0\u5f55",
  totalStudy: "\u7d2f\u8ba1\u5b66\u4e60",
  notes: "\u5b66\u4e60\u7b14\u8bb0",
  notesTitle: "\u628a\u5b9e\u9a8c\u590d\u76d8\u6c89\u6dc0\u4e0b\u6765\u3002",
  noteContent: "\u6211\u7406\u89e3\u4e86\u8fdb\u4f4d\u4f1a\u4ece\u4f4e\u4f4d\u4f20\u5230\u9ad8\u4f4d\u3002",
  noteLabel: "\u7b14\u8bb0\u5185\u5bb9",
  saveNote: "\u4fdd\u5b58\u7b14\u8bb0",
  profile: "\u5b66\u4e60\u6863\u6848",
  settings: "\u4e2a\u4eba\u8bbe\u7f6e",
  name: "\u59d3\u540d",
  studentName: "\u674e\u540c\u5b66",
  saveSettings: "\u4fdd\u5b58\u8bbe\u7f6e",
  settingsSaved: "\u4e2a\u4eba\u8bbe\u7f6e\u5df2\u66f4\u65b0\u3002",
  home: "\u8bfe\u7a0b\u9996\u9875",
};

const baseUrl = process.env.PROTOTYPE_URL ?? "http://127.0.0.1:4173";
const defaultArtifactDirUrl = new URL("../qa-artifacts/", import.meta.url);
const artifactDir = process.env.QA_ARTIFACT_DIR ? path.resolve(process.env.QA_ARTIFACT_DIR) : fileURLToPath(defaultArtifactDirUrl);
const artifactDirUrl = new URL(`file:///${artifactDir.replace(/\\/g, "/")}${artifactDir.endsWith("\\") ? "" : "/"}`);

async function launchBrowser() {
  try { return await chromium.launch({ channel: "msedge", headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}

await mkdir(artifactDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });

await page.goto(baseUrl, { waitUntil: "networkidle" });
await assertVisible(page, text.title);
await assertVisible(page, text.route);
await assertMissing(page, text.oldHeroName);
await page.screenshot({ path: artifactPath("desktop-home.png"), fullPage: true });

for (const challenge of CIRCUIT_CHALLENGES) {
  await openChallenge(page, challenge.title);
  await verifyReactFlowChallenge(page, challenge);
  await page.screenshot({ path: artifactPath(`desktop-lab-${challenge.id}.png`), fullPage: true });
  await page.getByRole("button", { name: new RegExp(text.backHome) }).click();
}

await page.getByRole("button", { name: text.records, exact: true }).click();
await assertVisible(page, text.recordsTitle);
await assertVisible(page, text.totalStudy);
await page.screenshot({ path: artifactPath("desktop-records.png"), fullPage: true });

await page.getByRole("button", { name: new RegExp(text.notes) }).click();
await assertVisible(page, text.notesTitle);
await page.getByLabel(text.noteLabel).fill(text.noteContent);
await page.getByRole("button", { name: text.saveNote }).click();
await assertVisible(page, text.noteContent);

await page.getByRole("button", { name: new RegExp(text.profile) }).click();
await page.getByRole("button", { name: text.settings }).click();
await page.getByLabel(text.name).fill(text.studentName);
await page.getByRole("button", { name: text.saveSettings }).click();
await assertVisible(page, text.settingsSaved);

await page.setViewportSize({ width: 390, height: 900 });
await page.goto(baseUrl, { waitUntil: "networkidle" });
await assertVisible(page, text.home);
await page.screenshot({ path: artifactPath("mobile-home.png"), fullPage: true });

await browser.close();
console.log("UI smoke check passed");

async function openChallenge(targetPage, title) {
  await targetPage.goto(baseUrl, { waitUntil: "networkidle" });
  await targetPage.getByRole("button", { name: new RegExp(title) }).first().click();
  await assertVisible(targetPage, title);
}

async function verifyReactFlowChallenge(targetPage, challenge) {
  const workbench = targetPage.locator(".circuit-flow-workbench");
  await targetPage.getByTestId("react-flow-circuit-canvas").waitFor({ state: "visible", timeout: 10_000 });
  await workbench.getByText(challenge.title).first().waitFor({ state: "visible", timeout: 10_000 });
  await targetPage.waitForFunction(({ expectedNodes }) => document.querySelectorAll(".react-flow__node").length >= expectedNodes, { expectedNodes: challenge.nodes.length });
  await workbench.getByRole("button", { name: text.fillReference }).click();
  await targetPage.waitForFunction(({ expectedEdges }) => document.querySelectorAll(".react-flow__edge").length >= expectedEdges, { expectedEdges: challenge.requiredEdges.length });
  await workbench.getByRole("button", { name: text.submit }).click();
  await workbench.getByText(text.passed).first().waitFor({ state: "visible", timeout: 10_000 });
}

async function assertVisible(targetPage, visibleText) {
  await targetPage.getByText(visibleText, { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await targetPage.getByText(visibleText, { exact: false }).first().isVisible(), true);
}

async function assertMissing(targetPage, missingText) {
  assert.equal(await targetPage.getByText(missingText, { exact: false }).count(), 0);
}

function artifactPath(fileName) {
  return fileURLToPath(new URL(fileName, artifactDirUrl));
}
