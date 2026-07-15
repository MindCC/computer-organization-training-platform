# 稳定性基线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 在不改变现有 SQLite 数据、HTTP URL 和课堂部署方式的前提下，消除双端阻断性崩溃、环境耦合测试、课程元数据错误和不可靠 3D 验证，建立后续架构重构可依赖的基线。

**Architecture:** 保持当前 React、Express、SQLite 技术栈，先在边界引入小型适配器和依赖注入，不进行大规模目录搬迁。前端组件只渲染视图模型，AI 路由显式接收依赖，课程路线只消费统一元数据，3D 通过可访问 HTML 控件和隔离 Playwright 编排验证。

**Tech Stack:** React 19.2、Vite 6.4.2、Express 5.2.1、better-sqlite3、Three.js、@react-three/fiber、Node test runner、Playwright 1.61.1。

## Global Constraints

- 决策优先级：最新用户决策 > 最新设计规格 > 本计划与验收测试 > 现有代码。
- 性能基线：Windows 10/11、四核 x86-64 CPU、8 GB 内存、集成显卡、1366×768、受支持 Edge 稳定版。
- 不重写产品，不更换 React、Express 或 SQLite。
- SQLite 数据、现有 API URL 和响应字段保持向后兼容。
- 测试禁止访问真实 AI 服务。
- Playwright 使用单个无头 Chromium 和单 worker，不使用内置浏览器。
- 临时数据库、截图、浏览器缓存、test-artifacts 和 .hermes 不进入产品提交。
- 当前工作树代码与本计划冲突时，以本计划为准；兼容改动在回归测试保护后吸收。
- 本文中的 Commit 步骤是未来实施检查点；当前不暂存、不提交，只有用户再次明确授权后才执行。

---

## 文件结构

**创建：**

- prototype/src/shared/api/teacherOverviewAdapter.js：把教师概览原始数据转换为稳定视图模型。
- prototype/src/teacherOverviewAdapter.test.mjs：覆盖教师硬件摘要的正常、空值和异常数据。
- prototype/scripts/run-browser-qa.mjs：创建临时数据库、启动服务、执行指定 Playwright 脚本并清理资源。

**修改：**

- prototype/server/app.js：注入 AI 报告生成器与环境，不直接依赖宿主进程配置。
- prototype/server/app.test.mjs：验证 AI 依赖注入与无网络降级。
- prototype/src/components/TeacherDashboard.jsx：只渲染适配后的瓶颈标签和数量。
- prototype/src/courseRoute.js：使用真实硬件挑战 ID，生成完整推荐视图模型和安全时间文案。
- prototype/src/courseRoute.test.mjs：覆盖空输入、真实硬件路线、推荐字段和时间格式。
- prototype/src/components/StudentHome.jsx：消费 App 传入的路线视图模型，不自行构造空路线。
- prototype/src/App.jsx：传递统一路线数据，吸收正确的 lab 状态引用与 memoryAccessState，移除矛盾欢迎文案。
- prototype/scripts/verify-ui.mjs：覆盖学生路线、笔记保存和页面异常。
- prototype/src/components/OverviewExplodedView.jsx：提供可测试、可键盘操作的 HTML 部件列表。
- prototype/src/styles.css：为部件列表提供低成本、可读、可聚焦样式。
- prototype/scripts/verify-3d.mjs：恢复概览与硬件构建器双路径，移除概率点击和硬编码地址。
- prototype/vite.config.mjs：允许隔离 QA 指定 API 代理目标。
- prototype/package.json：增加 qa:3d 和 qa:ui 命令。

## 接口总览

- <code>createApp(options)</code> 新增可选字段：
  - <code>generateTeacherAssistantReport</code>：异步报告函数；
  - <code>assistantOptions</code>：传给报告函数的 env、aiRequester 和 timeout。
- <code>adaptHardwareGameSummary(raw)</code> 返回：
  - completedCases：非负整数；
  - averageScore：0 至 100；
  - frequentBottlenecks：数组，每项为 key、label、type、count；
  - typicalBuilds：最多保留合法对象，不改变后端字段。
- <code>buildCourseRouteGroups(challenges, progress)</code> 始终返回所有正式路线节点。
- <code>findNextRecommendedChallenge(challenges, progress)</code> 返回 id、title、description、principle、estimatedMinutes，全部可直接渲染。
- <code>formatEstimatedMinutes(value)</code> 对无效、零或负值返回“待评估”。
- <code>PROTOTYPE_APP_URL</code>、<code>PROTOTYPE_API_URL</code>、<code>TEACHER_USERNAME</code>、<code>TEACHER_PASSWORD</code> 控制 3D 验证环境。

---

### Task 1: 隔离 AI 环境并注入报告生成器

**Files:**

- Modify: prototype/server/app.test.mjs
- Modify: prototype/server/app.js

**Interfaces:**

- Consumes: 现有 <code>generateTeacherAssistantReport(db, teacherId, classId, options)</code>。
- Produces: <code>createApp({ generateTeacherAssistantReport, assistantOptions })</code>。

- [ ] **Step 1: 写入依赖注入失败测试**

在 prototype/server/app.test.mjs 中把 <code>makeServer</code> 改为接收 options，并加入以下独立测试。测试函数内创建教师、登录、创建班级，然后请求助教报告：

~~~javascript
async function makeServer(options = {}) {
  const db = openDatabase(":memory:");
  migrate(db);
  createUser(db, {
    username: "teacher",
    displayName: "任课教师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const app = createApp({
    db,
    serveStatic: false,
    assistantOptions: { env: {} },
    ...options,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return { db, server, baseUrl: "http://127.0.0.1:" + server.address().port };
}

test("assistant route uses injected generator instead of host AI configuration", async () => {
  const calls = [];
  const { db, server, baseUrl } = await makeServer({
    assistantOptions: { env: { DEEPSEEK_API_KEY: "must-not-be-read" } },
    generateTeacherAssistantReport: async (_db, teacherId, classId, options) => {
      calls.push({ teacherId, classId, options });
      return {
        source: "fallback",
        generatedAt: "2026-07-15T00:00:00.000Z",
        fallbackReason: "测试注入",
        report: {
          lessonFocus: "测试重点",
          riskStudents: [],
          groupingPlan: [],
          commonMisconceptions: [],
          nextClassPlan: [],
          teacherScript: "测试讲解",
        },
      };
    },
  });
  const jar = {};
  try {
    await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "Teacher123!" }),
    }, jar);
    const created = await request(baseUrl, "/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "依赖注入班" }),
    }, jar);
    const result = await request(
      baseUrl,
      "/api/teacher/classes/" + created.body.class.id + "/assistant-report",
      { method: "POST" },
      jar,
    );

    assert.equal(result.response.status, 200);
    assert.equal(result.body.fallbackReason, "测试注入");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].options.env, { DEEPSEEK_API_KEY: "must-not-be-read" });
  } finally {
    server.close();
    db.close();
  }
});
~~~

- [ ] **Step 2: 运行目标测试并确认失败**

Run:

~~~powershell
cd D:\workspace\zcyl_training\prototype
node --test --test-name-pattern="assistant route uses injected generator" server/app.test.mjs
~~~

Expected: FAIL；返回内容不是“测试注入”，证明 app.js 仍直接调用模块级函数。

- [ ] **Step 3: 在 createApp 中注入依赖**

在 prototype/server/app.js 的 <code>createApp</code> 开头加入：

~~~javascript
const assistantReportGenerator =
  options.generateTeacherAssistantReport ?? generateTeacherAssistantReport;
const assistantOptions = options.assistantOptions ?? {};
~~~

把助教路由调用改为：

~~~javascript
const report = await assistantReportGenerator(
  db,
  req.user.id,
  classId,
  assistantOptions,
);
~~~

- [ ] **Step 4: 运行目标测试和全部服务端测试**

Run:

~~~powershell
node --test --test-name-pattern="assistant route uses injected generator" server/app.test.mjs
npm test
~~~

Expected: 目标测试 PASS；完整测试不访问网络且零失败。

- [ ] **Step 5: Commit**

~~~powershell
git add prototype/server/app.js prototype/server/app.test.mjs
git commit -m "test: isolate teacher assistant dependencies"
~~~

---

### Task 2: 修复教师首页对象渲染崩溃

**Files:**

- Create: prototype/src/shared/api/teacherOverviewAdapter.js
- Create: prototype/src/teacherOverviewAdapter.test.mjs
- Modify: prototype/src/components/TeacherDashboard.jsx

**Interfaces:**

- Consumes: 后端 <code>hardwareGameSummary</code> 原始对象。
- Produces: <code>adaptHardwareGameSummary(raw)</code> 和可直接渲染的 frequentBottlenecks。

- [ ] **Step 1: 写入适配器失败测试**

~~~javascript
import test from "node:test";
import assert from "node:assert/strict";
import { adaptHardwareGameSummary } from "./shared/api/teacherOverviewAdapter.js";

test("teacher hardware summary converts bottleneck objects into renderable labels", () => {
  const summary = adaptHardwareGameSummary({
    completedCases: 2,
    averageScore: 84,
    frequentBottlenecks: [
      { type: "存储速度不足", count: 3 },
      { type: "预算超限", count: 1 },
    ],
    typicalBuilds: [{ caseId: "game-office-pc", score: 96, parts: {} }],
  });

  assert.deepEqual(summary.frequentBottlenecks, [
    {
      key: "存储速度不足:3",
      type: "存储速度不足",
      count: 3,
      label: "存储速度不足 · 3 次",
    },
    {
      key: "预算超限:1",
      type: "预算超限",
      count: 1,
      label: "预算超限 · 1 次",
    },
  ]);
});

test("teacher hardware summary rejects malformed values without throwing", () => {
  const summary = adaptHardwareGameSummary({
    completedCases: -4,
    averageScore: 180,
    frequentBottlenecks: [null, {}, { type: "预算超限", count: "2" }],
    typicalBuilds: null,
  });

  assert.equal(summary.completedCases, 0);
  assert.equal(summary.averageScore, 100);
  assert.equal(summary.frequentBottlenecks.length, 1);
  assert.equal(summary.frequentBottlenecks[0].label, "预算超限 · 2 次");
  assert.deepEqual(summary.typicalBuilds, []);
});
~~~

- [ ] **Step 2: 运行测试并确认模块不存在**

Run:

~~~powershell
node --test src/teacherOverviewAdapter.test.mjs
~~~

Expected: FAIL，错误包含 ERR_MODULE_NOT_FOUND。

- [ ] **Step 3: 实现最小适配器**

~~~javascript
function toNonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

export function adaptHardwareGameSummary(raw = {}) {
  const completedCases = toNonNegativeInteger(raw?.completedCases);
  const averageScore = Math.min(100, toNonNegativeInteger(raw?.averageScore));
  const frequentBottlenecks = (Array.isArray(raw?.frequentBottlenecks)
    ? raw.frequentBottlenecks
    : [])
    .filter((item) => item && typeof item.type === "string" && item.type.trim())
    .map((item) => {
      const type = item.type.trim();
      const count = toNonNegativeInteger(item.count);
      return {
        key: type + ":" + count,
        type,
        count,
        label: type + " · " + count + " 次",
      };
    });

  return {
    completedCases,
    averageScore,
    frequentBottlenecks,
    typicalBuilds: Array.isArray(raw?.typicalBuilds) ? raw.typicalBuilds : [],
  };
}
~~~

- [ ] **Step 4: 让教师组件只渲染视图模型**

在 TeacherDashboard.jsx 导入适配器：

~~~javascript
import { adaptHardwareGameSummary } from "../shared/api/teacherOverviewAdapter.js";
~~~

替换 hardwareSummary 初始化：

~~~javascript
const hardwareSummary = adaptHardwareGameSummary(
  classOverview?.hardwareGameSummary,
);
~~~

替换瓶颈渲染：

~~~jsx
{hardwareSummary.frequentBottlenecks.length
  ? hardwareSummary.frequentBottlenecks.map((bottleneck) => (
      <span key={bottleneck.key}>{bottleneck.label}</span>
    ))
  : <p className="empty-state">暂无游戏提交数据</p>}
~~~

- [ ] **Step 5: 运行适配器测试、完整测试和生产构建**

Run:

~~~powershell
node --test src/teacherOverviewAdapter.test.mjs
npm test
npm run build
~~~

Expected: 全部命令退出码 0；教师摘要不再把对象作为 React 子节点。

- [ ] **Step 6: Commit**

~~~powershell
git add prototype/src/shared/api/teacherOverviewAdapter.js prototype/src/teacherOverviewAdapter.test.mjs prototype/src/components/TeacherDashboard.jsx
git commit -m "fix: normalize teacher hardware summary"
~~~

---

### Task 3: 统一课程路线和推荐任务元数据

**Files:**

- Modify: prototype/src/courseRoute.test.mjs
- Modify: prototype/src/courseRoute.js
- Modify: prototype/src/components/StudentHome.jsx
- Modify: prototype/src/App.jsx

**Interfaces:**

- Consumes: <code>LEARNING_ITEMS</code>、<code>HARDWARE_GAME_PROGRESS_ITEMS</code> 和 progress。
- Produces: 完整路线视图模型、完整推荐视图模型和安全时间文案。

- [ ] **Step 1: 写入真实硬件 ID、空输入和推荐字段测试**

把测试中的硬件 ID 常量改为从正式元数据生成，并加入以下测试：

~~~javascript
import {
  CHALLENGES,
  LEARNING_ITEMS,
  buildInitialLearningProgress,
} from "./platformLogic.js";
import { HARDWARE_GAME_PROGRESS_ITEMS } from "./hardwareGame.js";
import {
  buildCourseRouteGroups,
  findNextRecommendedChallenge,
  formatEstimatedMinutes,
} from "./courseRoute.js";

const HARDWARE_ROUTE_IDS = HARDWARE_GAME_PROGRESS_ITEMS.map((item) => item.id);

test("course route tolerates missing challenge input without exposing internal ids", () => {
  const groups = buildCourseRouteGroups(null, {});
  const hardware = groups.find((group) => group.id === "hardware");

  assert.deepEqual(hardware.items.map((item) => item.id), HARDWARE_ROUTE_IDS);
  assert.ok(hardware.items.every((item) => item.title && item.title !== item.id));
});

test("recommended challenge contains all fields required by the home screen", () => {
  const progress = buildInitialLearningProgress();
  const next = findNextRecommendedChallenge(LEARNING_ITEMS, progress);

  assert.equal(next.id, "computer-components");
  assert.equal(next.title, "认识计算机五大部件");
  assert.equal(typeof next.principle, "string");
  assert.ok(next.principle.length > 0);
  assert.equal(next.estimatedMinutes, 8);
});

test("estimated time never renders a negative or placeholder minute count", () => {
  assert.equal(formatEstimatedMinutes(undefined), "待评估");
  assert.equal(formatEstimatedMinutes(-1), "待评估");
  assert.equal(formatEstimatedMinutes(0), "待评估");
  assert.equal(formatEstimatedMinutes(8), "8 分钟");
});
~~~

- [ ] **Step 2: 运行路线测试并确认失败**

Run:

~~~powershell
node --test src/courseRoute.test.mjs
~~~

Expected: FAIL；失败点包括旧硬件 ID、推荐字段缺失或 formatEstimatedMinutes 未导出。

- [ ] **Step 3: 用正式元数据构建路线**

在 courseRoute.js 中导入硬件元数据：

~~~javascript
import { HARDWARE_GAME_PROGRESS_ITEMS } from "./hardwareGame.js";
~~~

硬件组使用：

~~~javascript
challengeIds: HARDWARE_GAME_PROGRESS_ITEMS.map((item) => item.id),
~~~

推荐视图模型与时间格式实现为：

~~~javascript
export function formatEstimatedMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "待评估";
  return Math.round(minutes) + " 分钟";
}

function buildRecommendation(id, challenge = {}) {
  return {
    id,
    title: challenge.title ?? "未命名任务",
    description: challenge.objective ?? challenge.shortTitle ?? "",
    principle: challenge.principle ?? challenge.objective ?? "完成任务后查看原理复盘。",
    estimatedMinutes: Number(challenge.estimatedMinutes) > 0
      ? Number(challenge.estimatedMinutes)
      : null,
  };
}
~~~

- [ ] **Step 4: StudentHome 只消费传入路线**

删除 StudentHome.jsx 对 buildCourseRouteGroups 的导入，并保留时间格式化工具：

~~~javascript
import { formatEstimatedMinutes } from "../courseRoute.js";
~~~

签名改为：

~~~javascript
export function StudentHome({
  progress,
  routeGroups,
  nextRecommendedChallenge,
  navigateToChallenge,
  summary,
  notes,
}) {
~~~

把本地 <code>buildCourseRouteGroups()</code> 调用删除，时间显示统一改为：

~~~jsx
<strong>{formatEstimatedMinutes(recommended?.estimatedMinutes)}</strong>
~~~

和：

~~~jsx
<small>{formatEstimatedMinutes(item.estimatedMinutes)}</small>
~~~

- [ ] **Step 5: App 使用 LEARNING_ITEMS 并传递路线**

~~~javascript
const routeGroups = useMemo(
  () => buildCourseRouteGroups(LEARNING_ITEMS, progress),
  [progress],
);
const nextRecommendedChallenge = useMemo(
  () => findNextRecommendedChallenge(LEARNING_ITEMS, progress),
  [progress],
);
~~~

StudentHome 调用增加 <code>routeGroups={routeGroups}</code>。初始状态文案改为：

~~~javascript
const [statusMessage, setStatusMessage] = useState("已同步最新学习进度。");
~~~

- [ ] **Step 6: 运行路线测试和完整测试**

Run:

~~~powershell
node --test src/courseRoute.test.mjs
npm test
npm run build
~~~

Expected: 路线测试和完整测试零失败；构建退出码 0。

- [ ] **Step 7: Commit**

~~~powershell
git add prototype/src/courseRoute.js prototype/src/courseRoute.test.mjs prototype/src/components/StudentHome.jsx prototype/src/App.jsx
git commit -m "fix: align student route with course metadata"
~~~

---

### Task 4: 吸收实验状态修复并保护笔记运行时路径

**Files:**

- Modify: prototype/scripts/verify-ui.mjs
- Modify: prototype/src/App.jsx

**Interfaces:**

- Consumes: <code>lab.currentChallenge</code>、<code>lab.currentRecord</code>、<code>buildMemoryAccessState</code>。
- Produces: 无未定义变量的笔记保存、继续实验和内存面板路径。

- [ ] **Step 1: 在 Playwright 冒烟中记录页面异常**

在创建 page 后立即加入：

~~~javascript
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
~~~

学生登录后加入笔记流程：

~~~javascript
await page.locator(".sidebar-nav .nav-item").filter({ hasText: "学习笔记" }).click();
await page.getByLabel("笔记内容").fill("3D 与总线关系复盘");
await page.getByRole("button", { name: "保存笔记" }).click();
await assertVisible(page, "3D 与总线关系复盘");
~~~

脚本关闭浏览器前加入：

~~~javascript
assert.deepEqual(pageErrors, [], "UI smoke must not emit page errors");
~~~

- [ ] **Step 2: 在当前工作树运行 UI 冒烟并记录结果**

Run:

~~~powershell
# 终端 A：隔离数据库与 API；停止进程后自动清理数据库
$databasePath = Join-Path $env:TEMP "zcyl-ui-red.sqlite"
Remove-Item -LiteralPath $databasePath -Force -ErrorAction SilentlyContinue
$env:DATABASE_PATH = $databasePath
npm run seed:teacher
try {
  node server/server.js
} finally {
  Remove-Item -LiteralPath $databasePath -Force -ErrorAction SilentlyContinue
  Remove-Item Env:DATABASE_PATH -ErrorAction SilentlyContinue
}
~~~

终端 B 启动 Vite：

~~~powershell
npm run dev
~~~

终端 C 等待页面可访问后运行冒烟：

~~~powershell
$env:PROTOTYPE_URL = "http://127.0.0.1:5173"
try {
  node scripts/verify-ui.mjs
} finally {
  Remove-Item Env:PROTOTYPE_URL -ErrorAction SilentlyContinue
}
~~~

Expected: 如果当前未提交 App 修复尚未生效，脚本在保存笔记或渲染内存面板时 FAIL；如果已生效，记录其为“已存在、现由回归覆盖”的兼容改动。

- [ ] **Step 3: 统一 App 中的实验状态引用**

确保 App.jsx 只使用以下引用，不再使用已移除的根级 currentChallenge 或 currentRecord：

~~~javascript
const memoryAccessState = useMemo(
  () => buildMemoryAccessState(
    memoryAddress,
    memoryOperation,
    memoryWriteValue,
  ),
  [memoryAddress, memoryOperation, memoryWriteValue],
);
~~~

保存笔记使用：

~~~javascript
title: lab.currentChallenge.shortTitle + "复盘",
tag: lab.currentChallenge.shortTitle,
~~~

继续实验使用：

~~~jsx
<small>
  {lab.currentChallenge.title} · {lab.currentRecord?.bestScore ?? 0} 分
</small>
~~~

NotesPage 使用：

~~~jsx
currentChallenge={lab.currentChallenge}
~~~

- [ ] **Step 4: 重跑 UI 冒烟、单元测试和构建**

Run:

~~~powershell
node scripts/verify-ui.mjs
npm test
npm run build
~~~

Expected: UI smoke 输出“UI smoke check passed”；pageErrors 为空；测试和构建退出码 0。

验证结束后，在终端 A 和终端 B 分别按 Ctrl+C；终端 A 的 finally 块必须删除临时数据库。

- [ ] **Step 5: Commit**

~~~powershell
git add prototype/scripts/verify-ui.mjs prototype/src/App.jsx
git commit -m "fix: stabilize current lab state consumers"
~~~

---

### Task 5: 建立确定性 3D 与硬件构建器验证

**Files:**

- Modify: prototype/src/components/OverviewExplodedView.jsx
- Modify: prototype/src/styles.css
- Modify: prototype/scripts/verify-3d.mjs
- Create: prototype/scripts/run-browser-qa.mjs
- Modify: prototype/vite.config.mjs
- Modify: prototype/package.json

**Interfaces:**

- Consumes: 现有 3D 部件、模式控制和硬件配置页面。
- Produces: HTML 部件列表、环境可配置 3D 验证、临时数据库 QA 编排。

- [ ] **Step 1: 先把 3D 测试改为要求稳定部件入口和双路径**

verify-3d.mjs 使用环境变量：

~~~javascript
const baseUrl = process.env.PROTOTYPE_APP_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.PROTOTYPE_API_URL ?? "http://127.0.0.1:8787";
const teacherUsername = process.env.TEACHER_USERNAME ?? "teacher";
const teacherPassword = process.env.TEACHER_PASSWORD ?? "ChangeMe123!";
const artifactDir = process.env.QA_ARTIFACT_DIR
  ? path.resolve(process.env.QA_ARTIFACT_DIR)
  : path.join(__dirname, "..", "test-artifacts", "3d-verify");
~~~

登录后加入响应状态检查：

~~~javascript
async function expectOk(response, label) {
  if (response.ok) return response;
  const body = await response.text();
  throw new Error(label + " failed: " + response.status + " " + body);
}
~~~

把概率画布点击替换为：

~~~javascript
await page.getByRole("button", { name: "查看 CPU 部件" }).click();
check(
  "CPU info card shown",
  await page.locator(".exploded-info-card").getByText("CPU").isVisible(),
);
~~~

恢复硬件构建器路径：

~~~javascript
await page.getByRole("button", { name: "返回课程首页" }).click();
await page.locator(".sidebar-nav .nav-item").filter({ hasText: "硬件配置挑战" }).click();
await page.waitForSelector(".builder-panel", { timeout: 20_000 });
check("Builder 3D canvas", await page.locator(".computer-exploded canvas").count() > 0);
check("Builder panel", await page.locator(".builder-panel").isVisible());
check("Builder score", await page.locator(".builder-score").isVisible());
~~~

- [ ] **Step 2: 运行现有 3D 脚本并确认稳定入口失败**

Run:

~~~powershell
node scripts/verify-3d.mjs
~~~

Expected: FAIL，找不到“查看 CPU 部件”按钮；这证明测试不再依赖概率命中。

- [ ] **Step 3: 提供键盘可用的 HTML 部件列表**

在 OverviewExplodedView.jsx 的顶层控件区加入：

~~~jsx
<div className="exploded-part-list" aria-label="部件列表">
  {visibleParts.map((part) => (
    <button
      aria-label={"查看 " + part.label + " 部件"}
      aria-pressed={selectedPart?.id === part.id}
      key={part.id}
      onClick={() => setSelectedPart(
        selectedPart?.id === part.id ? null : part,
      )}
      type="button"
    >
      <span>{part.label}</span>
      <small>{part.fiveElement}</small>
    </button>
  ))}
</div>
~~~

按钮的最终可访问名称必须包含“查看 CPU 部件”。样式只使用边框、背景色和 focus-visible，不增加阴影或连续动画：

~~~css
.exploded-part-list {
  position: absolute;
  left: 16px;
  bottom: 56px;
  display: grid;
  gap: 6px;
  max-width: 180px;
}

.exploded-part-list button {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(8, 17, 31, 0.88);
  color: #f4f7fb;
}

.exploded-part-list button:focus-visible,
.exploded-part-list button[aria-pressed="true"] {
  border-color: #4fc3f7;
  outline: 2px solid rgba(79, 195, 247, 0.45);
}
~~~

- [ ] **Step 4: 创建隔离 QA 编排器**

run-browser-qa.mjs 接收且只允许 scripts/verify-ui.mjs 或 scripts/verify-3d.mjs，并完整管理隔离环境：

~~~javascript
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowedVerifiers = new Set([
  "scripts/verify-ui.mjs",
  "scripts/verify-3d.mjs",
]);
const verifier = String(process.argv[2] ?? "").replaceAll("\\", "/");
if (!allowedVerifiers.has(verifier)) {
  throw new Error("Unsupported verifier: " + verifier);
}

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, "..");
const tempDir = await mkdtemp(path.join(tmpdir(), "zcyl-browser-qa-"));
const databasePath = path.join(tempDir, "classroom.sqlite");
const apiUrl = "http://127.0.0.1:8789";
const appUrl = "http://127.0.0.1:5174";
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

async function waitFor(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
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
    env: { DATABASE_PATH: databasePath },
  });
  if (await waitForExit(seed) !== 0) throw new Error("Teacher seed failed");

  processes.push(run(process.execPath, ["server/server.js"], {
    env: {
      DATABASE_PATH: databasePath,
      PORT: "8789",
      DEEPSEEK_API_KEY: "",
    },
  }));
  processes.push(run(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host", "127.0.0.1",
    "--port", "5174",
    "--strictPort",
  ], {
    env: { PROTOTYPE_API_PROXY_TARGET: apiUrl },
  }));

  await waitFor(apiUrl + "/api/health");
  await waitFor(appUrl);

  const verify = run(process.execPath, [verifier], {
    env: {
      PROTOTYPE_URL: appUrl,
      PROTOTYPE_APP_URL: appUrl,
      PROTOTYPE_API_URL: apiUrl,
      QA_ARTIFACT_DIR: path.join(tempDir, "artifacts"),
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
~~~

vite.config.mjs 使用同一环境变量配置代理：

~~~javascript
const apiProxyTarget =
  process.env.PROTOTYPE_API_PROXY_TARGET ?? "http://127.0.0.1:8787";

export default defineConfig({
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    proxy: {
      "/api": apiProxyTarget,
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
~~~

- [ ] **Step 5: 增加 npm QA 命令**

package.json scripts 增加：

~~~json
"qa:3d": "node scripts/run-browser-qa.mjs scripts/verify-3d.mjs",
"qa:ui": "node scripts/run-browser-qa.mjs scripts/verify-ui.mjs"
~~~

- [ ] **Step 6: 运行隔离 3D 验证两次**

Run:

~~~powershell
npm run qa:3d
npm run qa:3d
git status --short data
~~~

Expected: 两次均 PASS；data/classroom.sqlite 不新增测试班级；Git 不显示数据库变化；临时数据库和 QA 产物已清理。

- [ ] **Step 7: Commit**

~~~powershell
git add prototype/src/components/OverviewExplodedView.jsx prototype/src/styles.css prototype/scripts/verify-3d.mjs prototype/scripts/run-browser-qa.mjs prototype/vite.config.mjs prototype/package.json
git commit -m "test: make 3d verification deterministic"
~~~

---

### Task 6: 完整质量门与基线提交

**Files:**

- Review: docs/superpowers/specs/2026-07-15-dual-role-architecture-visual-refactor-design.md
- Review: docs/superpowers/plans/2026-07-15-dual-role-refactor-roadmap.md
- Review: 本计划涉及的全部代码和测试文件

**Interfaces:**

- Consumes: Tasks 1 至 5 的提交。
- Produces: 可供共享架构计划使用的稳定基线。

- [ ] **Step 1: 检查未提交范围**

Run:

~~~powershell
git status --short
git diff --check
git diff --stat
~~~

Expected: 无空白错误；临时数据库、test-artifacts 和 .hermes 未暂存。

- [ ] **Step 2: 运行完整单元与 API 测试**

Run:

~~~powershell
cd D:\workspace\zcyl_training\prototype
$env:DEEPSEEK_API_KEY = "host-key-must-not-be-used"
npm test
~~~

Expected: 零失败；没有外部网络请求。

- [ ] **Step 3: 运行生产构建**

Run:

~~~powershell
Remove-Item Env:DEEPSEEK_API_KEY -ErrorAction SilentlyContinue
npm run build
~~~

Expected: 退出码 0；记录入口包和大型块大小，超预算警告进入计划 1，不在本阶段隐藏。

- [ ] **Step 4: 运行双端与 3D Playwright**

Run:

~~~powershell
npm run qa:3d
npm run qa:ui
~~~

Expected: 单个无头 Chromium 流程通过；教师、学生、笔记、3D 概览和硬件构建器无未处理异常。

- [ ] **Step 5: 审查需求映射**

逐项确认：

- 教师瓶颈对象已转换为可渲染视图模型；
- AI 测试显式注入空环境；
- 学生首页没有 game-* 标识或“- 分钟”；
- 推荐卡标题、原理和预计时间来自同一视图模型；
- 3D 部件信息可以通过 HTML 按钮和键盘打开；
- 3D QA 不写默认数据库；
- 构建器验证已恢复；
- 当前 App、粒子和空值修复均有对应测试或 Playwright 证据。

- [ ] **Step 6: 创建稳定性基线提交**

只暂存产品代码、测试和已批准文档：

~~~powershell
git add docs/superpowers/specs/2026-07-15-dual-role-architecture-visual-refactor-design.md
git add docs/superpowers/plans/2026-07-15-dual-role-refactor-roadmap.md
git add docs/superpowers/plans/2026-07-15-stability-baseline.md
git add prototype/server/app.js prototype/server/app.test.mjs
git add prototype/src prototype/scripts prototype/package.json
git status --short
git commit -m "fix: establish dual-role stability baseline"
~~~

Expected: 提交不包含 .hermes、test-artifacts、qa-artifacts 或 SQLite 文件。

- [ ] **Step 7: 提交后复验**

Run:

~~~powershell
git show --stat --oneline HEAD
git status --short
npm test
npm run build
~~~

Expected: 提交内容与计划一致；测试和构建再次退出码 0。
## 2026-07-15 实施与验证记录

- 已完成 Step 1 至 Step 5；按用户决定保留未提交工作区，Step 6 与 Step 7 不执行。
- npm test：134 项通过，0 失败；电路实验和硬件配置均由服务端按提交证据重新判分。
- npm run build：通过；通用入口 373.49 KB（gzip 113.40 KB），实验和 3D 已按需加载。
- npm run qa:ui：教师、学生、逐关解锁、笔记、记录、班级和学生详情闭环通过。
- npm run qa:3d：最终代码状态 19/19，通过概览、八步组装、部件信息和硬件构建器检查；动态端口与临时数据库均已启用。
- 仍进入后续性能质量计划：3D 独立块 917.51 KB（gzip 248.50 KB）、大图资源优化、WebGL 禁用显式降级测试、60 秒帧率基线和 10 次进出资源释放测试。