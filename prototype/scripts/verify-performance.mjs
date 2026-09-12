import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { fillLoginForm, submitLoginForm } from "./lib/qaLogin.mjs";
import { openChallengeFromHome } from "./lib/qaHome.mjs";

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
  await fillLoginForm(page, { username: student.username, password: student.password });
  await submitLoginForm(page);
  await page.getByText("当前任务", { exact: true }).first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
}

async function openOverview(page) {
  // 首页已改为章节折叠布局，按标题从对应章节进入概览关卡。
  await openChallengeFromHome(page, "认识计算机五大部件");
  await page.waitForSelector(".computer-exploded canvas", { timeout: 20_000 });
  assert.equal(
    await page.locator(".computer-exploded canvas").count(),
    1,
    "overview must create exactly one canvas",
  );
}

async function returnHome(page) {
  await page.getByRole("button", { name: /返回课程首页/ }).click();
  await page.getByText("当前任务", { exact: true }).first().waitFor({
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
let browser;
try {
  browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--js-flags=--expose-gc"],
  });
} catch {
  browser = await chromium.launch({
    headless: true,
    args: ["--js-flags=--expose-gc"],
  });
}
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
  async function openAssembly() {
    await page.locator('.sidebar-nav .nav-item').filter({ hasText: '硬件配置挑战' }).click();
    await page.locator('.assembly-workshop canvas[data-model-source="blender-glb"]').waitFor({ state: 'visible' });
  }
  async function leaveAssembly() {
    await page.locator('.sidebar-nav .nav-item').filter({ hasText: '课程首页' }).click();
    await page.locator('.assembly-workshop canvas').waitFor({ state: 'detached' });
  }
  await returnHome(page);
  await openAssembly();
  await page.getByRole('button', { name: '打开侧板', exact: true }).click();
  await page.getByRole('button', { name: '固定主板', exact: true }).click();
  await page.getByRole('button', { name: '固定电源', exact: true }).click();
  for (const [label,socket] of [['处理器','CPU 插座'],['内存','DIMM 插槽'],['硬盘','硬盘托架']]) {
    await page.locator('.assembly-part-tabs button').filter({ hasText: label }).click();
    await page.getByRole('button', { name: '安装到'+socket, exact: true }).last().click();
  }
  await page.getByRole('button', { name: '固定CPU 散热器', exact: true }).click();
  for (const [from,to] of [['psu-atx','board-atx'],['psu-cpu','cpu-power'],['cooler-fan','cpu-fan'],['ssd-data','board-sata'],['psu-sata','ssd-power']]) {
    await page.getByRole('combobox', { name: '线缆端', exact: true }).selectOption(from);
    await page.getByRole('combobox', { name: '目标接口', exact: true }).selectOption(to);
    await page.getByRole('button', { name: '连接接口', exact: true }).click();
  }
  await leaveAssembly();
  const initialAssemblyHeap = await collectHeap(cdp);
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await openAssembly();
    await leaveAssembly();
  }
  const assemblyHeapDelta = (await collectHeap(cdp)) - initialAssemblyHeap;
  assert.ok(assemblyHeapDelta <= heapBudgetBytes, `assembly heap grew ${assemblyHeapDelta} bytes`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openAssembly();
  await page.getByRole('button', { name: '开机自检', exact: true }).click();
  await page.locator('.assembly-boot').filter({ hasText: '开机成功' }).waitFor();
  assert.equal(await page.locator('.assembly-workshop canvas').getAttribute('data-fans-running'), 'true', 'sample the powered model with fans running');
  const assemblyFrames = await sampleFrameRate(page, durationMs);
  assert.ok(assemblyFrames.fps >= 30, `assembly frame rate ${assemblyFrames.fps} is below 30 FPS`);
  assert.ok(assemblyFrames.p95FrameMs <= 50, `assembly p95 frame time ${assemblyFrames.p95FrameMs} exceeds 50ms`);
  assert.deepEqual(pageErrors, [], 'assembly QA must not emit page errors');
  const beforePractice=await collectHeap(cdp);
  for(let cycle=0;cycle<10;cycle++){
    await page.getByRole('button',{name:'进入装机教学练习',exact:true}).click();
    await page.locator('.assembly-practice canvas[data-model-source="blender-glb"]').waitFor();
    await page.getByRole('combobox',{name:'练习模式',exact:true}).selectOption('guided');
    await page.getByRole('combobox',{name:'练习模式',exact:true}).selectOption('fault');
    await page.locator('.assembly-practice canvas[data-model-source="blender-glb"]').waitFor();
    await page.getByRole('button',{name:'返回客户订单',exact:true}).click();
    await page.locator('.assembly-workshop canvas[data-model-source="blender-glb"]').waitFor();
  }
  const practiceHeapDelta=(await collectHeap(cdp))-beforePractice;
  assert.ok(practiceHeapDelta<=heapBudgetBytes,`practice heap grew ${practiceHeapDelta} bytes`);
  assert.deepEqual(pageErrors, [], 'practice lifecycle must not emit page errors');
  console.log('PRACTICE_PERF_RESULT '+JSON.stringify({cycles:10,practiceHeapDelta}));
  console.log('ASSEMBLY_PERF_RESULT ' + JSON.stringify({ cycles: 10, assemblyHeapDelta, fps: assemblyFrames.fps, p95FrameMs: assemblyFrames.p95FrameMs }));
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
