import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.join(__dirname, "..", "test-artifacts", "3d-verify");
const baseUrl = "http://localhost:5173";

await mkdir(artifactDir, { recursive: true });

let browser;
try { browser = await chromium.launch({ channel: "msedge", headless: true }); }
catch { browser = await chromium.launch({ headless: true }); }

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let passed = 0, failed = 0;

function check(name, condition) {
  if (condition) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name); }
}

try {
  console.log("1. Login as student");
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("input").first().fill("student1");
  await page.locator("input[type=password]").fill("Student123!");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForSelector(".route-map-header, .lab-studio-header", { timeout: 10000 });
  console.log("  Logged in");

  console.log("2. Navigate to computer-components challenge");
  // Click on the challenge in the route map
  const ccBtn = page.locator("button").filter({ hasText: "认识计算机五大部件" }).first();
  if (await ccBtn.count() === 0) {
    // Try clicking through lab stepper
    await page.locator(".route-item").filter({ hasText: "五大部件" }).first().click();
  } else {
    await ccBtn.click();
  }
  await page.waitForSelector(".computer-exploded", { timeout: 15000 });

  console.log("3. Verify 3D scene renders");
  const canvas = page.locator(".computer-exploded canvas");
  check("Canvas element exists", await canvas.count() > 0);

  console.log("4. Verify overlay controls");
  check("Topbar buttons", await page.locator(".exploded-topbar button").count() >= 2);
  check("Step mode available", await page.locator(".exploded-topbar").getByText("分步组装").isVisible());
  check("Auto mode available", await page.locator(".exploded-topbar").getByText("自动爆炸").isVisible());

  console.log("5. Switch to step mode");
  await page.locator(".exploded-topbar").getByText("分步组装").click();
  await page.waitForTimeout(500);
  check("Step bar visible", await page.locator(".exploded-stepbar").isVisible());
  check("8 step dots", await page.locator(".exploded-step-indicator span").count() === 8);
  check("Step description visible", await page.locator(".exploded-step-desc").isVisible());

  console.log("6. Navigate steps");
  for (let i = 1; i <= 8; i++) {
    const desc = await page.locator(".exploded-step-desc strong").textContent();
    check("Step " + i + " has label", desc && desc.length > 0);
    if (i < 8) await page.locator(".exploded-stepbar").getByText("下一步").click();
    await page.waitForTimeout(300);
  }
  check("Final step shows connections", await page.locator(".exploded-legend").isVisible());

  console.log("7. Click a part");
  await page.locator(".exploded-topbar").getByText("自动爆炸").click();
  await page.waitForTimeout(1000);
  // Click on the canvas to hopefully hit a part
  await canvas.first().click({ position: { x: 250, y: 250 } });
  await page.waitForTimeout(500);
  const infoCard = page.locator(".exploded-info-card");
  check("Part info card shown on click", await infoCard.count() > 0);

  console.log("8. Von Neumann diagram");
  check("Von Neumann overview present", await page.locator(".von-neumann-overview").isVisible());

  console.log("9. Navigate to hardware game");
  await page.locator(".lab-studio-icon-button").first().click(); // back
  await page.waitForTimeout(1000);
  // Navigate to hardware game
  await page.locator("button").filter({ hasText: "硬件挑战" }).first().click();
  await page.waitForSelector(".computer-exploded", { timeout: 15000 });
  check("Builder 3D view renders", await page.locator(".computer-exploded canvas").count() > 0);
  check("Builder panel present", await page.locator(".builder-panel").isVisible());
  check("Builder score shown", await page.locator(".builder-score").isVisible());

  await page.screenshot({ path: path.join(artifactDir, "3d-overview.png"), fullPage: true });
  console.log("  Screenshot saved");
} catch (e) {
  console.error("Error:", e.message);
  failed++;
} finally {
  await browser.close();
}

console.log("\n" + passed + "/" + (passed + failed) + " passed");
if (failed) process.exit(1);
