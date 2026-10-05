import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowedVerifiers = new Set([
  'scripts/verify-mobile.mjs',
  'scripts/verify-study-planning.mjs',
  'scripts/verify-task-chain-ai.mjs',
  'scripts/verify-task-chain.mjs',
  'scripts/verify-teacher-assistant-plan.mjs',
  'scripts/verify-learning-coach.mjs',
  'scripts/verify-mind-map.mjs',
  "scripts/verify-interactive-demos.mjs",
  "scripts/verify-courseware-redesign.mjs",
  "scripts/verify-study-mascot.mjs",
  "scripts/verify-immersive-workbench.mjs",
  "scripts/verify-parameter-playground.mjs",
  "scripts/verify-account-settings.mjs",
  "scripts/verify-demo-teacher.mjs",
  "scripts/verify-learning-atlas.mjs",
  "scripts/verify-assignment-questions.mjs",
  "scripts/verify-shop-service.mjs",
  "scripts/verify-ui.mjs",
  "scripts/verify-platform-audit.mjs",
  "scripts/verify-lab-workbench.mjs",
  "scripts/verify-workbench-curriculum.mjs",
  "scripts/verify-login-design.mjs",
  "scripts/verify-home-design.mjs",
  "scripts/verify-learning-tree.mjs",
  "scripts/verify-learning-integration.mjs",
  "scripts/verify-knowledge-base.mjs",
  "scripts/verify-demo-linkage.mjs",
  "scripts/verify-records-screen.mjs",
  "scripts/verify-3d.mjs",
  "scripts/verify-hardware-story.mjs",
  "scripts/verify-shop-story.mjs",
  "scripts/verify-custom-customer.mjs",
  "scripts/verify-performance.mjs",
  "scripts/verify-classroom.mjs",
  "scripts/verify-production-modules.mjs",
  "scripts/verify-teacher-dashboard.mjs",
  // 深度场景脚本：各自通过 API 造数，可用同一运行器执行
  "scripts/verify-audit.mjs",
  "scripts/verify-sessions.mjs",
  "scripts/verify-skip-locked.mjs",
  "scripts/verify-xray.mjs",
  "scripts/verify-offline-env.mjs",
  "scripts/verify-empty-states.mjs",
  // 这三个依赖 npm run seed:demo 生成的演示数据，需加 --seed-demo 播种
  "scripts/verify-completion.mjs",
  "scripts/verify-mistakes.mjs",
  "scripts/verify-overview-exploration.mjs",
  // 定向回归脚本：3D 中间键平移、总览自由探索、教师看板本轮修复
  "scripts/verify-middle-pan.mjs",
  "scripts/verify-teacher-fixes.mjs",
]);
const verifier = String(process.argv[2] ?? "").replaceAll("\\", "/");
const production = process.argv.includes('--production');
const liveAi = process.argv.includes('--live-ai');
if(liveAi && !['scripts/verify-custom-customer.mjs','scripts/verify-study-mascot.mjs','scripts/verify-task-chain-ai.mjs'].includes(verifier))throw new Error('Live AI is only enabled for dedicated authorized AI checks');
if (!allowedVerifiers.has(verifier)) {
  throw new Error("Unsupported verifier: " + verifier);
}

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, "..");
const tempDir = await mkdtemp(path.join(tmpdir(), "zcyl-browser-qa-"));
const databasePath = path.join(tempDir, "classroom.sqlite");
const apiPort = await findOpenPort();
const appPort = await findOpenPort(new Set([apiPort]));
const apiUrl = "http://127.0.0.1:" + apiPort;
const appUrl = production ? apiUrl : "http://127.0.0.1:" + appPort;
const teacherUsername = "teacher";
const teacherPassword = "ChangeMe123!";
const processes = [];

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    stdio: options.stdio ?? "inherit",
    windowsHide: true,
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(child.exitCode ?? 0);
      return;
    }
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function findOpenPort(excludedPorts = new Set()) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const port = await new Promise((resolve, reject) => {
      const reservation = createServer();
      reservation.unref();
      reservation.once("error", reject);
      reservation.listen(0, "127.0.0.1", () => {
        const address = reservation.address();
        const selectedPort = typeof address === "object" && address ? address.port : null;
        reservation.close((error) => {
          if (error) reject(error);
          else resolve(selectedPort);
        });
      });
    });
    if (port && !excludedPorts.has(port)) return port;
  }
  throw new Error("Unable to allocate a distinct browser QA port");
}

function assertProcessRunning(child, label) {
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error(label + " exited before becoming ready");
  }
}

async function waitFor(url, children = [], timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const [child, label] of children) assertProcessRunning(child, label);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for " + url);
}

try {
  const seed = run(process.execPath, ["server/seedTeacher.js"], {
    env: {
      DATABASE_PATH: databasePath,
      TEACHER_USERNAME: teacherUsername,
      TEACHER_PASSWORD: teacherPassword,
    },
  });
  if (await waitForExit(seed) !== 0) throw new Error("Teacher seed failed");

  // 需要演示数据的场景（完成度概览、错题本、空状态）用 --seed-demo 播种
  if (process.argv.includes("--seed-demo")) {
    const demoSeed = run(process.execPath, ["server/seedDemoClassroom.js"], {
      env: {
        DATABASE_PATH: databasePath,
        TEACHER_USERNAME: teacherUsername,
      },
    });
    if (await waitForExit(demoSeed) !== 0) throw new Error("Demo classroom seed failed");
  }

  const apiProcess = run(process.execPath, ["server/server.js"], {
    env: {
      DATABASE_PATH: databasePath,
      PORT: String(apiPort),
      DEEPSEEK_API_KEY: liveAi ? (process.env.DEEPSEEK_API_KEY??'') : "",
      MINDMAP_API_KEY: '',
      PUBLIC_BASE_URL: appUrl,
      NODE_ENV: production ? 'production' : 'development',
      ENABLE_DEMO_LOGIN: process.argv.includes('--seed-demo') ? 'true' : 'false',
      SESSION_SECRET: 'isolated-browser-qa-session-secret',
      COOKIE_SECURE: '0',
    },
  });
  processes.push(apiProcess);

  const appProcess = production ? null : run(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host", "127.0.0.1",
    "--port", String(appPort),
    "--strictPort",
  ], {
    env: { PROTOTYPE_API_PROXY_TARGET: apiUrl },
  });
  if (appProcess) processes.push(appProcess);

  await waitFor(apiUrl + "/api/health", [[apiProcess, "API server"]]);
  await waitFor(appUrl, [[apiProcess, "API server"], ...(appProcess ? [[appProcess, "Vite server"]] : [])]);

  const verify = run(process.execPath, [verifier], {
    env: {
      PROTOTYPE_URL: appUrl,
      PROTOTYPE_APP_URL: appUrl,
      PROTOTYPE_API_URL: apiUrl,
      QA_ARTIFACT_DIR: path.join(root, "qa-artifacts"),
      QA_LIVE_AI: liveAi ? '1' : '0',
      TEACHER_USERNAME: teacherUsername,
      TEACHER_PASSWORD: teacherPassword,
      DEEPSEEK_API_KEY: "",
    },
  });
  if (await waitForExit(verify) !== 0) {
    throw new Error("Browser verification failed: " + verifier);
  }
} finally {
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  await Promise.allSettled(processes.map(waitForExit));
  await rm(tempDir, { recursive: true, force: true });
}
