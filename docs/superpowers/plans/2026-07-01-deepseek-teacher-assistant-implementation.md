# DeepSeek Teacher Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a teacher-only DeepSeek assistant report that turns class progress data into lesson focus, risk-student, grouping, misconception, next-class, and teacher-script recommendations.

**Architecture:** Add a small backend AI boundary (`server/aiClient.js`) and a classroom-domain service (`server/teacherAssistant.js`). The Express route calls the service after existing teacher/class authorization. The React teacher dashboard calls the new endpoint and renders either an AI report or the local fallback report.

**Tech Stack:** Node.js ESM, Express, better-sqlite3, built-in `fetch`/`AbortController`, React 19, Vite, existing `node --test` tests and Playwright smoke.

## Global Constraints

- DeepSeek provider defaults: `DEEPSEEK_BASE_URL=https://api.deepseek.com`, `DEEPSEEK_MODEL=deepseek-v4-flash`, `AI_REQUEST_TIMEOUT_MS=15000`.
- Do not send password hashes, session tokens, cookies, request headers, API keys, or full student note content to DeepSeek.
- Do not expose student free-chat in this release.
- Do not let the frontend send arbitrary system prompts.
- Use non-streaming Chat Completions JSON output.
- Keep the current SQLite classroom architecture; no new persistent report table in this release.
- Every AI failure path must return a usable fallback report.

---

## File Structure

- Create `prototype/server/aiClient.js`
  - Responsibility: read AI environment config, call DeepSeek/OpenAI-compatible Chat Completions, normalize provider errors.
  - Public exports:
    - `readDeepSeekConfig(env = process.env): AiConfig`
    - `createAiError(code, message, cause = null): Error`
    - `requestChatCompletion(config, messages, options = {}): Promise<string>`

- Create `prototype/server/teacherAssistant.js`
  - Responsibility: build the sanitized class summary, build prompts, parse/validate model JSON, generate fallback reports.
  - Public exports:
    - `buildTeacherAssistantPayload(db, classId): AssistantPayload`
    - `buildTeacherAssistantMessages(payload): Array<{ role: string, content: string }>`
    - `parseAssistantJson(text): AssistantReport`
    - `buildFallbackAssistantReport(payload, reason): AssistantResponse`
    - `generateTeacherAssistantReport(db, teacherId, classId, options = {}): Promise<AssistantResponse>`

- Modify `prototype/server/app.js`
  - Add import for `generateTeacherAssistantReport`.
  - Add `POST /api/teacher/classes/:id/assistant-report` after the existing overview route.

- Create `prototype/server/teacherAssistant.test.mjs`
  - Unit tests for sanitization, fallback behavior, JSON parsing, and mocked DeepSeek success/failure.

- Modify `prototype/server/app.test.mjs`
  - Integration tests for teacher permissions and endpoint response shape.

- Modify `prototype/src/apiClient.js`
  - Add `assistantReport(classId)`.

- Modify `prototype/src/App.jsx`
  - Add state for AI assistant result/loading/error.
  - Add click handler for generating a report.
  - Replace the current static teacher assistant block with a report renderer.

- Modify `prototype/src/styles.css`
  - Add styles for AI report sections, source badges, loading/error states.

- Modify `prototype/scripts/verify-ui.mjs`
  - Add smoke assertion that the fallback AI assistant path renders when no key is configured.

- Modify `docs/classroom-deployment.md`
  - Add DeepSeek environment variables and failure-mode note.

---

### Task 1: Add DeepSeek AI Client Boundary

**Files:**
- Create: `prototype/server/aiClient.js`
- Test: `prototype/server/teacherAssistant.test.mjs`

**Interfaces:**
- Produces:
  - `readDeepSeekConfig(env = process.env)` returns:
    ```js
    {
      enabled: Boolean,
      apiKey: String,
      baseUrl: String,
      model: String,
      timeoutMs: Number
    }
    ```
  - `requestChatCompletion(config, messages, options = {})` returns assistant text content.
  - Throws errors with `error.code` in `AI_DISABLED`, `AI_HTTP`, `AI_TIMEOUT`, `AI_RESPONSE`.

- [ ] **Step 1: Write failing config tests**

Add to `prototype/server/teacherAssistant.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readDeepSeekConfig } from "./aiClient.js";

test("readDeepSeekConfig disables AI when key is missing", () => {
  const config = readDeepSeekConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.baseUrl, "https://api.deepseek.com");
  assert.equal(config.model, "deepseek-v4-flash");
  assert.equal(config.timeoutMs, 15000);
});

test("readDeepSeekConfig reads DeepSeek env overrides", () => {
  const config = readDeepSeekConfig({
    DEEPSEEK_API_KEY: "sk-test",
    DEEPSEEK_BASE_URL: "https://example.test",
    DEEPSEEK_MODEL: "deepseek-v4-pro",
    AI_REQUEST_TIMEOUT_MS: "3000",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.apiKey, "sk-test");
  assert.equal(config.baseUrl, "https://example.test");
  assert.equal(config.model, "deepseek-v4-pro");
  assert.equal(config.timeoutMs, 3000);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm.cmd test -- server/teacherAssistant.test.mjs`

Expected: FAIL with module not found for `./aiClient.js`.

- [ ] **Step 3: Implement `prototype/server/aiClient.js`**

Create:

```js
export function readDeepSeekConfig(env = process.env) {
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS ?? 15000);
  return {
    enabled: Boolean(env.DEEPSEEK_API_KEY),
    apiKey: env.DEEPSEEK_API_KEY ?? "",
    baseUrl: env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000,
  };
}

export function createAiError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.cause = cause;
  return error;
}

export async function requestChatCompletion(config, messages, options = {}) {
  if (!config.enabled) {
    throw createAiError("AI_DISABLED", "DEEPSEEK_API_KEY 未配置");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw createAiError("AI_HTTP", `DeepSeek 请求失败：${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw createAiError("AI_RESPONSE", "DeepSeek 返回内容为空");
    }
    return content;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createAiError("AI_TIMEOUT", "DeepSeek 请求超时", error);
    }
    if (error?.code?.startsWith?.("AI_")) throw error;
    throw createAiError("AI_RESPONSE", "DeepSeek 返回解析失败", error);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `npm.cmd test -- server/teacherAssistant.test.mjs`

Expected: PASS for both config tests.

- [ ] **Step 5: Commit**

```bash
git add prototype/server/aiClient.js prototype/server/teacherAssistant.test.mjs
git commit -m "Add DeepSeek AI client boundary"
```

---

### Task 2: Build Sanitized Teacher Assistant Service

**Files:**
- Create/Modify: `prototype/server/teacherAssistant.js`
- Test: `prototype/server/teacherAssistant.test.mjs`

**Interfaces:**
- Consumes: `readDeepSeekConfig`, `requestChatCompletion`.
- Produces:
  - `buildTeacherAssistantPayload(db, classId)`
  - `buildFallbackAssistantReport(payload, reason)`
  - `parseAssistantJson(text)`
  - `generateTeacherAssistantReport(db, teacherId, classId, options = {})`

- [ ] **Step 1: Write failing sanitization and fallback tests**

Append to `prototype/server/teacherAssistant.test.mjs`:

```js
import { hashPassword } from "./auth.js";
import { createClass, createUser, addStudentToClass, migrate } from "./db.js";
import { buildTeacherAssistantPayload, buildFallbackAssistantReport } from "./teacherAssistant.js";
import Database from "better-sqlite3";

function makeMemoryDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

test("buildTeacherAssistantPayload includes teaching data and excludes secrets", async () => {
  const db = makeMemoryDb();
  const teacher = createUser(db, {
    username: "teacher-a",
    displayName: "张老师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const classRow = createClass(db, teacher.id, "计组一班");
  const student = createUser(db, {
    username: "2026001",
    displayName: "李同学",
    role: "student",
    passwordHash: await hashPassword("Student123!"),
    profile: { initialPassword: "Student123!" },
  });
  addStudentToClass(db, classRow.id, student.id);

  const payload = buildTeacherAssistantPayload(db, classRow.id);
  const serialized = JSON.stringify(payload);
  assert.equal(payload.className, "计组一班");
  assert.equal(payload.students[0].displayName, "李同学");
  assert.equal(payload.students[0].username, "2026001");
  assert.doesNotMatch(serialized, /password_hash/i);
  assert.doesNotMatch(serialized, /Student123!/);
  assert.doesNotMatch(serialized, /session/i);
  assert.doesNotMatch(serialized, /cookie/i);
});

test("buildFallbackAssistantReport returns usable report shape", async () => {
  const db = makeMemoryDb();
  const teacher = createUser(db, {
    username: "teacher-b",
    displayName: "王老师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const classRow = createClass(db, teacher.id, "空班");
  const payload = buildTeacherAssistantPayload(db, classRow.id);
  const response = buildFallbackAssistantReport(payload, "DEEPSEEK_API_KEY 未配置");
  assert.equal(response.source, "fallback");
  assert.equal(response.fallbackReason, "DEEPSEEK_API_KEY 未配置");
  assert.equal(Array.isArray(response.report.nextClassPlan), true);
  assert.equal(typeof response.report.teacherScript, "string");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd test -- server/teacherAssistant.test.mjs`

Expected: FAIL with module not found for `./teacherAssistant.js`.

- [ ] **Step 3: Implement service skeleton**

Create `prototype/server/teacherAssistant.js`:

```js
import { CHALLENGES } from "../src/platformLogic.js";
import { getClassOverview, listClassStudents, getStudentProgress, teacherOwnsClass } from "./db.js";
import { readDeepSeekConfig, requestChatCompletion } from "./aiClient.js";

const REPORT_KEYS = ["lessonFocus", "riskStudents", "groupingPlan", "commonMisconceptions", "nextClassPlan", "teacherScript"];

export function buildTeacherAssistantPayload(db, classId) {
  const overview = getClassOverview(db, classId);
  const students = listClassStudents(db, classId).map((student) => {
    const progress = getStudentProgress(db, student.id);
    const summary = overview.students.find((item) => item.id === student.id)?.summary ?? {};
    return {
      id: student.id,
      username: student.username,
      displayName: student.displayName,
      summary: {
        completionRate: summary.completionRate ?? 0,
        averageScore: summary.averageScore ?? 0,
        totalAttempts: summary.totalAttempts ?? 0,
        totalStudyMinutes: summary.totalStudyMinutes ?? 0,
        weakSpot: summary.weakSpot ?? "暂无数据",
      },
      progress: CHALLENGES.map((challenge) => {
        const record = progress[challenge.id] ?? {};
        return {
          challengeId: challenge.id,
          challengeTitle: challenge.title,
          status: record.status ?? "locked",
          attempts: record.attempts ?? 0,
          bestScore: record.bestScore ?? 0,
          errors: record.errors ?? [],
        };
      }),
    };
  });

  return {
    classId,
    className: db.prepare("SELECT name FROM classes WHERE id = ?").get(classId)?.name ?? `班级 ${classId}`,
    summary: overview.summary,
    challenges: CHALLENGES.map((challenge) => ({ id: challenge.id, title: challenge.title, goal: challenge.goal })),
    students,
  };
}

export function buildFallbackAssistantReport(payload, reason) {
  const students = payload.students ?? [];
  const atRisk = students
    .filter((student) => student.summary.completionRate < 60 || student.summary.averageScore < 70)
    .slice(0, 4);
  const focus = payload.summary?.weakSpot && payload.summary.weakSpot !== "暂无数据" ? payload.summary.weakSpot : "全加器进位逻辑";
  return {
    source: "fallback",
    generatedAt: new Date().toISOString(),
    report: {
      lessonFocus: students.length > 0 ? `建议下节课聚焦 ${focus}。` : "请先导入学生或等待学生提交后再生成报告。",
      riskStudents: atRisk.map((student) => ({
        studentId: student.id,
        name: student.displayName,
        reason: `完成率 ${student.summary.completionRate}%，平均分 ${student.summary.averageScore}`,
        suggestion: "先按参考结构完成一次，再独立重连并提交。",
      })),
      groupingPlan: students.length > 0 ? [
        { group: "基础巩固组", criteria: "完成率低于 60% 或平均分低于 70", activity: "复盘端口方向并重建参考结构" },
        { group: "提升挑战组", criteria: "完成率不低于 80% 且平均分不低于 85", activity: "尝试限时完成多位加法器或 ALU" },
      ] : [],
      commonMisconceptions: payload.summary?.weakSpot && payload.summary.weakSpot !== "暂无数据" ? [payload.summary.weakSpot] : [],
      nextClassPlan: students.length > 0 ? [
        "5 分钟复盘输入端、输出端和导线方向。",
        "8 分钟集中讲解班级高频错误。",
        "10 分钟让学生重连对应关卡并提交。",
      ] : [],
      teacherScript: students.length > 0
        ? `今天先围绕 ${focus} 做一次集中纠错，再让学生独立完成一次提交。`
        : "请先导入学生，学生完成至少一次提交后，助教会生成更具体的课堂建议。",
    },
    fallbackReason: reason,
  };
}
```

- [ ] **Step 4: Run tests and verify current tests pass**

Run: `npm.cmd test -- server/teacherAssistant.test.mjs`

Expected: PASS for config, sanitization, and fallback tests. `parseAssistantJson` and `generateTeacherAssistantReport` tests are added in Task 3.

- [ ] **Step 5: Commit**

```bash
git add prototype/server/teacherAssistant.js prototype/server/teacherAssistant.test.mjs
git commit -m "Add teacher assistant report fallback"
```

---

### Task 3: Parse AI JSON and Generate Reports

**Files:**
- Modify: `prototype/server/teacherAssistant.js`
- Test: `prototype/server/teacherAssistant.test.mjs`

**Interfaces:**
- Consumes: `buildTeacherAssistantPayload`, `buildTeacherAssistantMessages`, `requestChatCompletion`.
- Produces: `parseAssistantJson(text)` and `generateTeacherAssistantReport(db, teacherId, classId, options = {})`.

- [ ] **Step 1: Write failing AI parsing and generation tests**

Append:

```js
import { parseAssistantJson, generateTeacherAssistantReport } from "./teacherAssistant.js";

test("parseAssistantJson accepts markdown-wrapped JSON", () => {
  const report = parseAssistantJson("```json\n{\"lessonFocus\":\"全加器\",\"riskStudents\":[],\"groupingPlan\":[],\"commonMisconceptions\":[],\"nextClassPlan\":[\"复盘 Cout\"],\"teacherScript\":\"先讲 Cout。\"}\n```");
  assert.equal(report.lessonFocus, "全加器");
  assert.deepEqual(report.nextClassPlan, ["复盘 Cout"]);
});

test("generateTeacherAssistantReport returns ai source when client succeeds", async () => {
  const db = makeMemoryDb();
  const teacher = createUser(db, {
    username: "teacher-c",
    displayName: "赵老师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const classRow = createClass(db, teacher.id, "计组三班");
  const response = await generateTeacherAssistantReport(db, teacher.id, classRow.id, {
    env: { DEEPSEEK_API_KEY: "sk-test" },
    aiRequester: async () => JSON.stringify({
      lessonFocus: "全加器 Cout",
      riskStudents: [],
      groupingPlan: [],
      commonMisconceptions: ["Sum 和 Cout 混淆"],
      nextClassPlan: ["复盘端口", "重连全加器"],
      teacherScript: "先看 Cout 的来源。",
    }),
  });
  assert.equal(response.source, "ai");
  assert.equal(response.report.lessonFocus, "全加器 Cout");
  assert.equal(response.fallbackReason, null);
});

test("generateTeacherAssistantReport falls back when AI returns invalid JSON", async () => {
  const db = makeMemoryDb();
  const teacher = createUser(db, {
    username: "teacher-d",
    displayName: "钱老师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const classRow = createClass(db, teacher.id, "计组四班");
  const response = await generateTeacherAssistantReport(db, teacher.id, classRow.id, {
    env: { DEEPSEEK_API_KEY: "sk-test" },
    aiRequester: async () => "not json",
  });
  assert.equal(response.source, "fallback");
  assert.match(response.fallbackReason, /JSON/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd test -- server/teacherAssistant.test.mjs`

Expected: FAIL because `parseAssistantJson` and `generateTeacherAssistantReport` are not exported.

- [ ] **Step 3: Implement prompt, JSON parsing, and generation**

Append to `prototype/server/teacherAssistant.js`:

```js
export function buildTeacherAssistantMessages(payload) {
  return [
    {
      role: "system",
      content: [
        "你是计算机组成原理实训课的教师端智能助教。",
        "只根据给定班级数据生成教学建议，不编造不存在的学生行为。",
        "输出严格 JSON，不要 Markdown，不要解释。",
        "字段必须包含 lessonFocus, riskStudents, groupingPlan, commonMisconceptions, nextClassPlan, teacherScript。",
        "不要输出隐私敏感数据，不要使用惩罚性措辞。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify(payload),
    },
  ];
}

export function parseAssistantJson(text) {
  const trimmed = String(text ?? "").trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`AI JSON 解析失败：${error.message}`);
  }

  for (const key of REPORT_KEYS) {
    if (!(key in parsed)) throw new Error(`AI JSON 缺少字段：${key}`);
  }
  return {
    lessonFocus: String(parsed.lessonFocus ?? ""),
    riskStudents: Array.isArray(parsed.riskStudents) ? parsed.riskStudents : [],
    groupingPlan: Array.isArray(parsed.groupingPlan) ? parsed.groupingPlan : [],
    commonMisconceptions: Array.isArray(parsed.commonMisconceptions) ? parsed.commonMisconceptions : [],
    nextClassPlan: Array.isArray(parsed.nextClassPlan) ? parsed.nextClassPlan : [],
    teacherScript: String(parsed.teacherScript ?? ""),
  };
}

export async function generateTeacherAssistantReport(db, teacherId, classId, options = {}) {
  if (!teacherOwnsClass(db, teacherId, classId)) {
    const error = new Error("班级不存在");
    error.statusCode = 404;
    throw error;
  }
  const payload = buildTeacherAssistantPayload(db, classId);
  const config = readDeepSeekConfig(options.env ?? process.env);
  if (!config.enabled) {
    return buildFallbackAssistantReport(payload, "DEEPSEEK_API_KEY 未配置");
  }

  try {
    const aiRequester = options.aiRequester ?? requestChatCompletion;
    const text = await aiRequester(config, buildTeacherAssistantMessages(payload), options);
    return {
      source: "ai",
      generatedAt: new Date().toISOString(),
      report: parseAssistantJson(text),
      fallbackReason: null,
    };
  } catch (error) {
    return buildFallbackAssistantReport(payload, error.message ?? "DeepSeek 调用失败");
  }
}
```

- [ ] **Step 4: Run tests and verify pass**

Run: `npm.cmd test -- server/teacherAssistant.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prototype/server/teacherAssistant.js prototype/server/teacherAssistant.test.mjs
git commit -m "Generate DeepSeek teacher assistant reports"
```

---

### Task 4: Add Teacher Assistant API Endpoint

**Files:**
- Modify: `prototype/server/app.js`
- Modify: `prototype/server/app.test.mjs`

**Interfaces:**
- Consumes: `generateTeacherAssistantReport(db, teacherId, classId, options)`.
- Produces: `POST /api/teacher/classes/:id/assistant-report`.

- [ ] **Step 1: Write failing API tests**

Append to `prototype/server/app.test.mjs` in the existing teacher integration test after overview assertions:

```js
    result = await request(baseUrl, `/api/teacher/classes/${classId}/assistant-report`, {
      method: "POST",
    }, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.source, "fallback");
    assert.equal(result.body.fallbackReason, "DEEPSEEK_API_KEY 未配置");
    assert.equal(typeof result.body.report.lessonFocus, "string");
```

Add a cross-role assertion in the unauthenticated/cross-role test after student login:

```js
    result = await request(baseUrl, `/api/teacher/classes/${classId}/assistant-report`, {
      method: "POST",
    }, studentJar);
    assert.equal(result.response.status, 403);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd test -- server/app.test.mjs`

Expected: FAIL with 404 for `/assistant-report`.

- [ ] **Step 3: Implement route**

Modify `prototype/server/app.js` imports:

```js
import { generateTeacherAssistantReport } from "./teacherAssistant.js";
```

Add after `/api/teacher/classes/:id/overview`:

```js
  app.post("/api/teacher/classes/:id/assistant-report", requireRole("teacher"), async (req, res, next) => {
    try {
      const classId = Number(req.params.id);
      const report = await generateTeacherAssistantReport(db, req.user.id, classId);
      res.json(report);
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
      next(error);
    }
  });
```

- [ ] **Step 4: Run tests and verify pass**

Run: `npm.cmd test -- server/app.test.mjs server/teacherAssistant.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prototype/server/app.js prototype/server/app.test.mjs
git commit -m "Expose teacher assistant report API"
```

---

### Task 5: Connect Frontend API and Teacher Dashboard State

**Files:**
- Modify: `prototype/src/apiClient.js`
- Modify: `prototype/src/App.jsx`

**Interfaces:**
- Consumes: `api.assistantReport(classId)`.
- Produces:
  - `assistantReport` React state.
  - `assistantLoading` React state.
  - `assistantError` React state.
  - `generateAssistantReport()` click handler.

- [ ] **Step 1: Add frontend API method**

Modify `prototype/src/apiClient.js`:

```js
  assistantReport: (classId) => apiRequest(`/api/teacher/classes/${classId}/assistant-report`, { method: "POST" }),
```

Place it after `classOverview`.

- [ ] **Step 2: Add React state and handler**

In `prototype/src/App.jsx`, near existing teacher state:

```js
  const [assistantReport, setAssistantReport] = useState(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
```

Add handler near `refreshClassOverview`:

```js
  async function generateAssistantReport() {
    if (!selectedTeacherClassId) {
      setAssistantError("请先选择班级");
      return;
    }
    setAssistantLoading(true);
    setAssistantError("");
    try {
      const result = await api.assistantReport(selectedTeacherClassId);
      setAssistantReport(result);
    } catch (error) {
      setAssistantError(error.message);
    } finally {
      setAssistantLoading(false);
    }
  }
```

In the existing class selection click handler inside `.teacher-class`, reset the current report before loading a different class:

```js
onClick={() => {
  setSelectedTeacherClassId(item.id);
  setAssistantReport(null);
  setAssistantError("");
  refreshClassOverview(item.id);
}}
```

- [ ] **Step 3: Run build and verify compilation**

Run: `npm.cmd run build`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add prototype/src/apiClient.js prototype/src/App.jsx
git commit -m "Connect teacher assistant report API"
```

---

### Task 6: Render AI Report in Teacher Dashboard

**Files:**
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`

**Interfaces:**
- Consumes: `assistantReport`, `assistantLoading`, `assistantError`, `assistant` local fallback summary.
- Produces: visible AI report sections and fallback reason.

- [ ] **Step 1: Add renderer helper**

In `prototype/src/App.jsx`, add inside `App()` before `renderTeacherStudioDashboard()`:

```jsx
  function renderAssistantReportPanel(assistant) {
    const report = assistantReport?.report;
    if (!report) {
      return (
        <>
          <div className="teacher-assistant-focus">
            <strong>{assistant.focus}</strong>
          </div>
          <div className="teacher-assistant-actions">
            {assistant.nextActions.map((item) => (
              <p key={item}><CheckCircle size={16} weight="fill" /> {item}</p>
            ))}
          </div>
        </>
      );
    }

    return (
      <div className="teacher-ai-report">
        <div className="teacher-ai-meta">
          <span className={assistantReport.source === "ai" ? "ai-source-badge" : "ai-source-badge fallback"}>
            {assistantReport.source === "ai" ? "DeepSeek 生成" : "本地降级建议"}
          </span>
          <small>{new Date(assistantReport.generatedAt).toLocaleString()}</small>
        </div>
        {assistantReport.fallbackReason ? <p className="teacher-ai-warning">{assistantReport.fallbackReason}</p> : null}
        <section>
          <strong>下节课重点</strong>
          <p>{report.lessonFocus}</p>
        </section>
        <section>
          <strong>重点关注学生</strong>
          {(report.riskStudents ?? []).length > 0 ? report.riskStudents.map((studentItem, index) => (
            <p key={`${studentItem.studentId ?? index}-${studentItem.name ?? "student"}`}>
              {studentItem.name ?? "学生"}：{studentItem.reason ?? "需要关注"}。{studentItem.suggestion ?? ""}
            </p>
          )) : <p>暂无重点风险学生。</p>}
        </section>
        <section>
          <strong>分层辅导</strong>
          {(report.groupingPlan ?? []).map((item, index) => (
            <p key={`${item.group ?? "group"}-${index}`}>{item.group ?? "分组"}：{item.activity ?? item.criteria ?? ""}</p>
          ))}
        </section>
        <section>
          <strong>共性错误</strong>
          {(report.commonMisconceptions ?? []).map((item) => <p key={item}>{item}</p>)}
        </section>
        <section>
          <strong>课堂安排</strong>
          {(report.nextClassPlan ?? []).map((item) => <p key={item}>{item}</p>)}
        </section>
        <section>
          <strong>教师讲解提示</strong>
          <p>{report.teacherScript}</p>
        </section>
      </div>
    );
  }
```

- [ ] **Step 2: Replace static assistant body**

In the `.teacher-assistant-panel` section, keep the existing header and risk-list, then add controls after the header:

```jsx
                <div className="teacher-assistant-toolbar">
                  <button className="primary-button" disabled={!selectedTeacherClassId || assistantLoading} onClick={generateAssistantReport} type="button">
                    {assistantLoading ? "生成中..." : "生成 AI 助教建议"}
                  </button>
                </div>
                {assistantError ? <p className="teacher-ai-warning">{assistantError}</p> : null}
                {renderAssistantReportPanel(assistant)}
```

Remove the old inline `.teacher-assistant-focus` and `.teacher-assistant-actions` block from this section to avoid duplicate content.

- [ ] **Step 3: Add styles**

Append near existing teacher assistant CSS:

```css
.teacher-assistant-toolbar {
  display: flex;
  gap: 10px;
  justify-content: flex-start;
  margin-top: 12px;
}

.teacher-ai-report {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.teacher-ai-report section {
  background: #ffffff;
  border: 1px solid rgba(75, 92, 117, 0.14);
  border-radius: 8px;
  display: grid;
  gap: 6px;
  padding: 10px 12px;
}

.teacher-ai-report p {
  color: var(--muted-text);
  line-height: 1.55;
  margin: 0;
}

.teacher-ai-meta {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-source-badge {
  background: rgba(36, 148, 95, 0.12);
  border-radius: 999px;
  color: #24734d;
  font-size: 12px;
  font-weight: 900;
  padding: 4px 9px;
}

.ai-source-badge.fallback,
.teacher-ai-warning {
  background: rgba(230, 163, 35, 0.12);
  color: #8a5a08;
}

.teacher-ai-warning {
  border: 1px solid rgba(230, 163, 35, 0.22);
  border-radius: 8px;
  margin: 10px 0 0;
  padding: 10px 12px;
}
```

- [ ] **Step 4: Run build**

Run: `npm.cmd run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prototype/src/App.jsx prototype/src/styles.css
git commit -m "Render DeepSeek teacher assistant report"
```

---

### Task 7: Update UI Smoke and Deployment Docs

**Files:**
- Modify: `prototype/scripts/verify-ui.mjs`
- Modify: `docs/classroom-deployment.md`

**Interfaces:**
- Consumes: visible button text `生成 AI 助教建议`.
- Produces: smoke coverage for fallback path and docs for DeepSeek env vars.

- [ ] **Step 1: Add UI smoke checks**

In `prototype/scripts/verify-ui.mjs`, after teacher login and `assertVisible(page, text.teacherHeading);`, add:

```js
await assertVisible(page, "智能助教");
await page.getByRole("button", { name: "生成 AI 助教建议" }).click();
await assertVisible(page, "本地降级建议");
await assertVisible(page, "DEEPSEEK_API_KEY 未配置");
```

If multiple classes are already present and the button is disabled until a class is selected, place this block after `await selectClass(page, text.className);` later in the script.

- [ ] **Step 2: Update deployment docs**

Add to `docs/classroom-deployment.md` environment variable section:

```md
### DeepSeek 智能助教

可选环境变量：

- `DEEPSEEK_API_KEY`：DeepSeek API key。未配置时教师看板显示本地降级建议。
- `DEEPSEEK_BASE_URL`：默认 `https://api.deepseek.com`。
- `DEEPSEEK_MODEL`：默认 `deepseek-v4-flash`，可改为 `deepseek-v4-pro`。
- `AI_REQUEST_TIMEOUT_MS`：默认 `15000`。

课堂建议：先不把学生端自由问答开放给学生。教师端报告只发送班级学习摘要，不发送密码、session、cookie 或学生笔记全文。
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm.cmd test
npm.cmd run build
node scripts/verify-ui.mjs
```

Expected:

- `npm.cmd test`: all tests pass.
- `npm.cmd run build`: Vite build exits 0.
- `node scripts/verify-ui.mjs`: prints `UI smoke check passed`.

- [ ] **Step 4: Commit**

```bash
git add prototype/scripts/verify-ui.mjs docs/classroom-deployment.md
git commit -m "Document DeepSeek teacher assistant setup"
```

---

### Task 8: Final Verification and Cleanup

**Files:**
- No required code changes unless verification exposes issues.

**Interfaces:**
- Consumes all previous tasks.
- Produces final verified branch state.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm.cmd test
npm.cmd run build
node scripts/verify-ui.mjs
```

Expected:

- 0 test failures.
- Vite build exits 0.
- UI smoke prints `UI smoke check passed`.

- [ ] **Step 2: Inspect git status**

Run:

```bash
git status --short
```

Expected: empty output. If verification produced screenshots or local data changes, inspect them and do not commit generated artifacts unless they are intentionally tracked.

- [ ] **Step 3: Manual classroom check**

Start or restart the production server with existing local env:

```bash
npm run server
```

Open `http://127.0.0.1:8787/`, log in as a teacher, select a class, and verify:

- The teacher dashboard still loads.
- “智能助教” panel shows local summary before AI generation.
- Clicking “生成 AI 助教建议” shows fallback when `DEEPSEEK_API_KEY` is absent.
- With `DEEPSEEK_API_KEY` configured, the same button shows a report with all six sections.

- [ ] **Step 4: Commit only if fixes were needed**

If Step 1-3 required code changes, stage the concrete files changed by those fixes. For this plan those are expected to be one or more of `prototype/server/aiClient.js`, `prototype/server/teacherAssistant.js`, `prototype/server/app.js`, `prototype/server/teacherAssistant.test.mjs`, `prototype/server/app.test.mjs`, `prototype/src/apiClient.js`, `prototype/src/App.jsx`, `prototype/src/styles.css`, `prototype/scripts/verify-ui.mjs`, or `docs/classroom-deployment.md`:

```bash
git add prototype/server/aiClient.js prototype/server/teacherAssistant.js prototype/server/app.js prototype/server/teacherAssistant.test.mjs prototype/server/app.test.mjs prototype/src/apiClient.js prototype/src/App.jsx prototype/src/styles.css prototype/scripts/verify-ui.mjs docs/classroom-deployment.md
git commit -m "Stabilize DeepSeek teacher assistant"
```

If no code changes were needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage:
  - DeepSeek config: Task 1 and Task 7.
  - Sanitized summary: Task 2.
  - Fixed backend prompt and JSON parsing: Task 3.
  - Teacher-only API permission: Task 4.
  - Frontend AI/fallback states: Task 5 and Task 6.
  - Error handling and fallback: Task 1, Task 2, Task 3, Task 6.
  - Tests and smoke: Task 4, Task 7, Task 8.
- Placeholder scan: this plan intentionally contains no unfinished markers or unspecified “add tests” steps.
- Type consistency: `AssistantResponse` shape is consistently `{ source, generatedAt, report, fallbackReason }`; frontend renderer consumes that shape directly.
