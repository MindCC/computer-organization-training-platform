import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowedVerifiers = new Set([
  "scripts/verify-ui.mjs",
  "scripts/verify-3d.mjs",
  "scripts/verify-performance.mjs",
  "scripts/verify-classroom.mjs",
]);
const verifier = String(process.argv[2] ?? "").replaceAll("\\", "/");
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
const appUrl = "http://127.0.0.1:" + appPort;
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

  const apiProcess = run(process.execPath, ["server/server.js"], {
    env: {
      DATABASE_PATH: databasePath,
      PORT: String(apiPort),
      DEEPSEEK_API_KEY: "",
      PUBLIC_BASE_URL: appUrl,
    },
  });
  processes.push(apiProcess);

  const appProcess = run(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host", "127.0.0.1",
    "--port", String(appPort),
    "--strictPort",
  ], {
    env: { PROTOTYPE_API_PROXY_TARGET: apiUrl },
  });
  processes.push(appProcess);

  await waitFor(apiUrl + "/api/health", [[apiProcess, "API server"]]);
  await waitFor(appUrl, [[apiProcess, "API server"], [appProcess, "Vite server"]]);

  const verify = run(process.execPath, [verifier], {
    env: {
      PROTOTYPE_URL: appUrl,
      PROTOTYPE_APP_URL: appUrl,
      PROTOTYPE_API_URL: apiUrl,
      QA_ARTIFACT_DIR: path.join(root, "qa-artifacts"),
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