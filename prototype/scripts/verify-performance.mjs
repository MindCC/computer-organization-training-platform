import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const baseUrl = process.env.PROTOTYPE_APP_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.PROTOTYPE_API_URL ?? "http://127.0.0.1:8787";
const teacherUsername = process.env.TEACHER_USERNAME ?? "teacher";
const teacherPassword = process.env.TEACHER_PASSWORD ?? "ChangeMe123!";
const durationMs = Number(process.env.QA_PERF_DURATION_MS ?? 10_000);
const heapBudgetBytes = 24 * 1024 * 1024;

assert.ok(
  Number.isInteger(durationMs) && durationMs >= 1_000 && durationMs <= 120_000,
  "QA_PERF_DURATION_MS must be an integer from 1000 to 120000",
);

async function expectOk(response, label) {
  if (response.ok) return response;
  const body = await response.text();
  throw new Error(`${label} failed: ${response.status} ${body}`);
}

async function setupStudent() {
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
    body: JSON.stringify({ name: "性能验证班 " + Date.now() }),
  });
  await expectOk(response, "class creation");
  const classPayload = await response.json();

  const username = "perfstudent-" + Date.now();
  const password = "Student123!";
  const csv = "学号,姓名,初始密码\n" + username + ",性能验证学生," + password;
  response = await fetch(
    apiUrl + "/api/teacher/classes/" + classPayload.class.id + "/import-students",
    {
      method: "POST",
      headers: { "Content-Type": "text/csv", Cookie: cookies },
      body: csv,
    },
  );
  await expectOk(response, "student import");
  return { username, password };
}

async function login(page, student) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByLabel("账号").fill(student.username);
  await page.getByLabel("密码").fill(student.password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByText("课程路线地图", { exact: false }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
}

async function openOverview(page) {
  await page.getByRole("button")
    .filter({ hasText: "认识计算机五大部件" })
    .last()
    .click();
  await page.waitForSelector(".computer-exploded canvas", { timeout: 20_000 });
  assert.equal(
    await page.locator(".computer-exploded canvas").count(),
    1,
    "overview must create exactly one canvas",
  );
}

async function returnHome(page) {
  await page.getByRole("button", { name: /返回课程首页/ }).click();
  await page.getByText("课程路线地图", { exact: false }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForSelector(".computer-exploded canvas", {
    state: "detached",
    timeout: 20_000,
  });
  assert.equal(
    await page.locator(".computer-exploded canvas").count(),
    0,
    "leaving overview must remove every canvas",
  );
}

async function collectHeap(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  const usage = await cdp.send("Runtime.getHeapUsage");
  return usage.usedSize;
}

async function sampleFrameRate(page, sampleDurationMs) {
  return page.evaluate(async (requestedDurationMs) => {
    let frames = 0;
    const frameTimes = [];
    const startedAt = performance.now();
    let previousFrameAt = startedAt;
    await new Promise((resolve) => {
      function tick(now) {
        frames += 1;
        frameTimes.push(now - previousFrameAt);
        previousFrameAt = now;
        if (now - startedAt >= requestedDurationMs) resolve();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    const elapsedMs = performance.now() - startedAt;
    const sortedFrameTimes = [...frameTimes].sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sortedFrameTimes.length * 0.95) - 1);
    return {
      frames,
      elapsedMs,
      fps: frames / (elapsedMs / 1000),
      p95FrameMs: sortedFrameTimes[p95Index] ?? 0,
    };
  }, sampleDurationMs);
}

const student = await setupStudent();
const browser = await chromium.launch({
  headless: true,
  args: ["--js-flags=--expose-gc"],
});
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await login(page, student);
  const cdp = await context.newCDPSession(page);
  await cdp.send("HeapProfiler.enable");

  console.log("1. Warm lazy 3D route before taking heap baseline");
  await openOverview(page);
  await returnHome(page);
  const initialHeapBytes = await collectHeap(cdp);

  console.log("2. Verify ten enter/leave lifecycles");
  for (let cycle = 1; cycle <= 10; cycle += 1) {
    await openOverview(page);
    await returnHome(page);
    console.log("  PASS lifecycle " + cycle + "/10");
  }

  const finalHeapBytes = await collectHeap(cdp);
  const heapDeltaBytes = finalHeapBytes - initialHeapBytes;
  assert.ok(
    heapDeltaBytes <= heapBudgetBytes,
    `heap grew ${heapDeltaBytes} bytes; budget is ${heapBudgetBytes}`,
  );

  console.log("3. Measure requestAnimationFrame pacing");
  await openOverview(page);
  const frameMetrics = await sampleFrameRate(page, durationMs);
  assert.ok(
    frameMetrics.fps >= 20,
    `average frame rate ${frameMetrics.fps.toFixed(2)} is below 20 FPS`,
  );
  assert.ok(
    frameMetrics.p95FrameMs <= 50,
    "p95 frame time " + frameMetrics.p95FrameMs.toFixed(2) + "ms exceeds 50ms",
  );

  await returnHome(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openOverview(page);
  assert.equal(
    await page.locator(".exploded-stepbar").isVisible(),
    true,
    "reduced motion must start in step mode",
  );

  assert.deepEqual(pageErrors, [], "performance QA must not emit page errors");
  console.log("PERF_RESULT " + JSON.stringify({
    cycles: 10,
    durationMs,
    initialHeapBytes,
    finalHeapBytes,
    heapDeltaBytes,
    fps: Number(frameMetrics.fps.toFixed(2)),
    p95FrameMs: Number(frameMetrics.p95FrameMs.toFixed(2)),
    frames: frameMetrics.frames,
  }));
} finally {
  await browser.close();
}
