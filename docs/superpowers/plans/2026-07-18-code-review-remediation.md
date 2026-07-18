# Code Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复代码审核发现的发布门禁、课堂闭环、跨班授权、CSRF、密码数据和登录限流问题，并恢复可信的浏览器验收矩阵。

**Architecture:** 保持 React/Vite/Express/SQLite 和现有 API 路径不变。通用安全逻辑抽为可单测纯函数，资源归属校验集中在 service，课堂 Hook 负责 UUID 幂等提交和服务端状态回写，Playwright 只允许 API 准备隔离数据、核心验收必须经过页面交互。

**Tech Stack:** React 19.2, Express 5.2, better-sqlite3 12.11, Node test runner, Vite 6.4, Playwright 1.61.

## Global Constraints

- 保持现有公开 API 路径、SQLite 表结构和课堂状态枚举兼容。
- 不引入新的运行时依赖。
- 所有行为改动遵循 red-green TDD。
- 浏览器 QA 使用一个 headless Chromium、一个 worker、动态端口和临时 SQLite。
- 普通课堂 Windows 10/11 电脑仍满足 150 学生、P95 不超过 2000ms、零 `SQLITE_BUSY`。
- 不修改或提交未跟踪的 `prototype/src/circuit/faultInjection.js` 与对应测试。

## File Structure

- Create `prototype/server/security.js`: 同源校验、登录失败窗口和资料敏感字段清理纯函数。
- Create `prototype/server/security.test.mjs`: 安全纯函数的确定性回归测试。
- Modify `prototype/server/app.js`: 中间件顺序、限流调用、资料清理和课堂提交组合。
- Modify `prototype/server/db.js`: 用户资料清理、密码状态更新和兼容迁移。
- Modify `prototype/server/assignmentService.js`: 作业和班级成员授权边界。
- Modify `prototype/server/assignmentRoutes.js`: 只调用经过授权的 service 接口。
- Modify `prototype/server/assignment.test.mjs`: 双教师、双班、双学生 IDOR 回归。
- Modify `prototype/server/classroomSessionService.js`: 提供教师授权的学生回放读取。
- Modify `prototype/server/classroomSessionRoutes.js`: 回放路由不再直接访问 `service.db`。
- Modify `prototype/server/app.test.mjs`: CSRF、密码资料、回放与备份回归。
- Modify `prototype/src/classroomSessionState.js`: 服务端课堂状态合并纯函数。
- Modify `prototype/src/classroomSessionState.test.mjs`: 阶段立即推进和结束状态测试。
- Modify `prototype/src/hooks/useClassroomSession.js`: 使用合并函数更新完整课堂视图模型。
- Modify `prototype/src/App.jsx`: 活动课堂提交委派与普通练习兼容。
- Modify `prototype/src/components/LabPage.jsx`: 固定 Hook 顺序并在暂停时禁止状态变更。
- Modify `prototype/scripts/run-browser-qa.mjs`: 修复 verifier Set 语法。
- Modify `prototype/scripts/verify-classroom.mjs`: 真实双 context UI 流程。
- Modify `docs/superpowers/plans/2026-07-15-classroom-mission-loop-implementation.md`: 记录实际完成与复验结果。

---

### Task 1: Restore the Shared Browser QA Runner

**Files:**
- Modify: `prototype/scripts/run-browser-qa.mjs:8-14`

**Interfaces:**
- Consumes: verifier path passed as `process.argv[2]`.
- Produces: syntactically valid runner accepting exactly UI, 3D, performance, and classroom verifiers.

- [ ] **Step 1: Confirm the syntax failure**

Run:

```powershell
cd prototype
node --check scripts/run-browser-qa.mjs
```

Expected: FAIL at line 13 with `SyntaxError: missing ) after argument list`.

- [ ] **Step 2: Fix the Set terminator**

Replace the verifier declaration with:

```javascript
const allowedVerifiers = new Set([
  "scripts/verify-ui.mjs",
  "scripts/verify-3d.mjs",
  "scripts/verify-performance.mjs",
  "scripts/verify-classroom.mjs",
]);
```

- [ ] **Step 3: Verify syntax and unsupported verifier behavior**

Run:

```powershell
node --check scripts/run-browser-qa.mjs
node scripts/run-browser-qa.mjs scripts/not-allowed.mjs
```

Expected: first exits 0; second exits non-zero with `Unsupported verifier` before creating servers.

- [ ] **Step 4: Commit the release-gate fix**

```powershell
git add prototype/scripts/run-browser-qa.mjs
git commit -m "fix: restore browser qa runner"
```

---

### Task 2: Put Security Middleware First and Repair Login Throttling

**Files:**
- Create: `prototype/server/security.js`
- Create: `prototype/server/security.test.mjs`
- Modify: `prototype/server/app.js:54-175`
- Modify: `prototype/server/app.test.mjs`

**Interfaces:**
- Produces: `isTrustedRequestOrigin(req, publicBaseUrl): boolean`.
- Produces: `createLoginFailureTracker({ maxFailures, windowMs, maxEntries, now }): { check, recordFailure, clear }`.
- Consumers: `createApp()` middleware and login route.

- [ ] **Step 1: Write failing security unit tests**

Add `server/security.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { createLoginFailureTracker, isTrustedRequestOrigin } from "./security.js";

test("origin comparison rejects prefix lookalikes and accepts exact origin", () => {
  const req = { protocol: "https", headers: { host: "school.example", origin: "https://school.example.evil" } };
  assert.equal(isTrustedRequestOrigin(req, "https://school.example"), false);
  req.headers.origin = "https://school.example";
  assert.equal(isTrustedRequestOrigin(req, "https://school.example"), true);
});

test("login failure window restarts after expiry", () => {
  let clock = 1_000;
  const tracker = createLoginFailureTracker({ maxFailures: 2, windowMs: 100, maxEntries: 10, now: () => clock });
  tracker.recordFailure("student");
  tracker.recordFailure("student");
  assert.equal(tracker.check("student").blocked, true);
  clock += 101;
  assert.equal(tracker.check("student").blocked, false);
  assert.equal(tracker.recordFailure("student").remaining, 1);
});

test("login failure tracker stays bounded", () => {
  const tracker = createLoginFailureTracker({ maxFailures: 5, windowMs: 60_000, maxEntries: 2, now: () => 1_000 });
  tracker.recordFailure("a"); tracker.recordFailure("b"); tracker.recordFailure("c");
  assert.equal(tracker.size(), 2);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```powershell
node --test server/security.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `security.js`.

- [ ] **Step 3: Implement the pure security helpers**

Create `server/security.js`:

```javascript
export function isTrustedRequestOrigin(req, publicBaseUrl = "") {
  const source = req.headers.origin || req.headers.referer;
  if (!source) return true;
  try {
    const expected = new URL(publicBaseUrl || `${req.protocol}://${req.headers.host}`);
    return new URL(source).origin === expected.origin;
  } catch {
    return false;
  }
}

export function createLoginFailureTracker({ maxFailures = 5, windowMs = 60_000, maxEntries = 1_000, now = Date.now } = {}) {
  const records = new Map();
  function current(key) {
    const record = records.get(key);
    if (record && now() - record.since >= windowMs) {
      records.delete(key);
      return null;
    }
    return record ?? null;
  }
  function trim() {
    while (records.size > maxEntries) records.delete(records.keys().next().value);
  }
  return {
    check(key) {
      const record = current(key);
      const elapsed = record ? now() - record.since : 0;
      return { blocked: Boolean(record && record.count >= maxFailures), retryAfterMs: record ? Math.max(0, windowMs - elapsed) : 0 };
    },
    recordFailure(key) {
      const record = current(key) ?? { count: 0, since: now() };
      record.count += 1;
      records.set(key, record);
      trim();
      return { remaining: Math.max(0, maxFailures - record.count) };
    },
    clear(key) { records.delete(key); },
    size() { return records.size; },
  };
}
```

- [ ] **Step 4: Add failing API coverage for middleware order**

In `server/app.test.mjs`, create a classroom or assignment POST with a valid session cookie and header `Origin: https://attacker.example`; configure `PUBLIC_BASE_URL` through `createApp({ publicBaseUrl: "http://127.0.0.1" })` rather than mutating the process environment. Assert status 403. The current router-first order must return a business response instead.

- [ ] **Step 5: Move middleware before all routers and inject configuration**

In `createApp`, order setup as:

```javascript
app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "1mb" }));
app.use(loadSession(db));
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    if (options.logger || process.env.NODE_ENV !== "test") {
      const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
      const line = `[${level}] ${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms user=${req.user?.username ?? "-"}`;
      (options.logger ?? console.log)(line);
    }
  });
  next();
});
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!isTrustedRequestOrigin(req, options.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "")) {
    return res.status(403).json({ error: "跨站请求被拒绝" });
  }
  next();
});
app.use("/api", createClassroomSessionRouter({ service: sessionService, requireRole }));
app.use("/api", createAssignmentRouter({ service: assignmentService, requireRole }));
```

Replace the local Map logic with one tracker instance and keep existing response text/status codes.

- [ ] **Step 6: Run focused and full server tests**

Run:

```powershell
node --test server/security.test.mjs server/app.test.mjs
npm test
```

Expected: all tests pass; cross-origin classroom/assignment POST returns 403.

- [ ] **Step 7: Commit the middleware and throttling fix**

```powershell
git add prototype/server/security.js prototype/server/security.test.mjs prototype/server/app.js prototype/server/app.test.mjs
git commit -m "fix: enforce csrf and durable login throttling"
```

---

### Task 3: Remove Recoverable Initial Passwords

**Files:**
- Modify: `prototype/server/security.js`
- Modify: `prototype/server/security.test.mjs`
- Modify: `prototype/server/db.js:26-260`
- Modify: `prototype/server/app.js:187-259,444-471`
- Modify: `prototype/server/app.test.mjs`
- Modify: `prototype/server/demoData.test.mjs`
- Modify: `prototype/server/seedDemoClassroom.js:70-90`

**Interfaces:**
- Produces: `sanitizeProfile(profile): object` removing the top-level `initialPassword` field at the user-profile boundary.

- [ ] **Step 1: Add failing profile and migration tests**

Extend `server/security.test.mjs`:

```javascript
test("sanitizeProfile removes recoverable password fields", () => {
  assert.deepEqual(
    sanitizeProfile({ initialPassword: "Student123!", goal: "完成课程", mustChangePassword: true }),
    { goal: "完成课程", mustChangePassword: true },
  );
});
```

Extend `server/app.test.mjs` to import a student, read `users.profile_json`, call `/api/auth/me`, and assert serialized results do not contain `initialPassword`. For a file-backed temporary database, call `/api/admin/backup` and assert the downloaded bytes do not contain the known plaintext password.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
node --test server/security.test.mjs server/app.test.mjs
```

Expected: profile/backup assertions fail because the current import persists `initialPassword`.

- [ ] **Step 3: Implement profile sanitization and compatibility cleanup**

Add to `security.js`:

```javascript
export function sanitizeProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const { initialPassword: _discarded, ...safe } = source;
  return safe;
}
```

Use it in `sanitizeUser`, `createUser`, `updateUserProfile`, and a migration transaction that rewrites only user profiles containing `initialPassword`. New imports and demo seeds use:

```javascript
profile: { goal: "完成计算机概述到运算器关卡", mode: "强引导模式", mustChangePassword: true }
```

After password change, merge:

```javascript
{ mustChangePassword: false, passwordChangedAt: new Date().toISOString() }
```

- [ ] **Step 4: Verify profile, backup, and demo seed behavior**

Run:

```powershell
node --test server/security.test.mjs server/app.test.mjs server/demoData.test.mjs
npm test
```

Expected: all pass; no test fixture or database profile contains `initialPassword`.

- [ ] **Step 5: Commit the password-data fix**

```powershell
git add prototype/server/security.js prototype/server/security.test.mjs prototype/server/db.js prototype/server/app.js prototype/server/app.test.mjs prototype/server/demoData.test.mjs prototype/server/seedDemoClassroom.js
git commit -m "fix: remove recoverable initial passwords"
```

---

### Task 4: Enforce Assignment Ownership and Membership

**Files:**
- Modify: `prototype/server/assignmentService.js`
- Modify: `prototype/server/assignmentRoutes.js`
- Modify: `prototype/server/assignment.test.mjs`

**Interfaces:**
- Produces service methods:
  - `getTeacherAssignmentDetail({ teacherId, assignmentId })`
  - `listTeacherSubmissions({ teacherId, assignmentId })`
  - `getStudentAssignmentDetail({ studentId, assignmentId })`
- Existing `saveDraft` and `submitStudentAnswers` gain membership validation without changing route shapes.

- [ ] **Step 1: Write dual-class IDOR API tests**

Create teacher A/class A/student A and teacher B/class B/student B. Publish one assignment per class. Assert:

```javascript
assert.equal((await request(baseUrl, `/api/teacher/assignments/${assignmentB}`, {}, teacherAJar)).status, 404);
assert.equal((await request(baseUrl, `/api/teacher/assignments/${assignmentB}/submissions`, {}, teacherAJar)).status, 404);
assert.equal((await request(baseUrl, `/api/student/assignments/${assignmentB}`, {}, studentAJar)).status, 404);
assert.equal((await request(baseUrl, `/api/student/assignments/${assignmentB}/draft`, postAnswers, studentAJar)).status, 404);
assert.equal((await request(baseUrl, `/api/student/assignments/${assignmentB}/submit`, postAnswers, studentAJar)).status, 404);
```

Also assert teacher A's student analytics exclude submissions from class B when the student belongs to both teachers' classes.

- [ ] **Step 2: Run assignment tests and confirm RED**

Run:

```powershell
node --test server/assignment.test.mjs
```

Expected: cross-class detail, submissions, draft or submit assertions return 200 instead of 404.

- [ ] **Step 3: Add centralized membership helpers**

Inside `createAssignmentService`, add:

```javascript
function assertStudentCanAccess(assignment, studentId) {
  const member = db.prepare(`
    SELECT 1 FROM class_members
    WHERE class_id = ? AND student_id = ?
  `).get(assignment.class_id, studentId);
  if (!member || assignment.status !== "published") {
    throw Object.assign(new Error("作业不存在"), { status: 404 });
  }
}
```

Every teacher resource lookup calls `assertTeacherOwns`; every student lookup/save/submit calls `assertStudentCanAccess`. Restrict student analytics query by joining `assignments` to classes owned by the requesting teacher and the selected class when supplied.

- [ ] **Step 4: Make routes call authorized service methods only**

Replace direct repository and unscoped detail access with:

```javascript
service.getTeacherAssignmentDetail({ teacherId: req.user.id, assignmentId: Number(req.params.id) });
service.listTeacherSubmissions({ teacherId: req.user.id, assignmentId: Number(req.params.id) });
service.getStudentAssignmentDetail({ studentId: req.user.id, assignmentId: Number(req.params.id) });
```

- [ ] **Step 5: Run assignment and full tests**

Run:

```powershell
node --test server/assignment.test.mjs
npm test
```

Expected: all same-class flows remain 200/201 and all cross-class accesses return 404.

- [ ] **Step 6: Commit the assignment authorization fix**

```powershell
git add prototype/server/assignmentService.js prototype/server/assignmentRoutes.js prototype/server/assignment.test.mjs
git commit -m "fix: enforce assignment resource ownership"
```

---

### Task 5: Authorize Classroom Student Replay

**Files:**
- Modify: `prototype/server/classroomSessionService.js`
- Modify: `prototype/server/classroomSessionRoutes.js:55-60`
- Modify: `prototype/server/app.test.mjs`

**Interfaces:**
- Produces: `getStudentReplay({ teacherId, sessionId, studentId }): replay`.
- Consumes: existing `assertTeacherOwns`, `repository.getStudentState`, and `buildStudentReplay`.

- [ ] **Step 1: Write a cross-teacher replay test**

In `server/app.test.mjs`, create sessions owned by two teachers. Submit one attempt in teacher B's session, then assert teacher A receives 404 from:

```javascript
`/api/teacher/sessions/${sessionB}/students/${studentB}/replay`
```

Assert teacher B receives 200 and the expected timeline.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
node --test server/app.test.mjs
```

Expected: teacher A currently receives 200.

- [ ] **Step 3: Move replay access into the service**

Import `buildStudentReplay` from `./classroomAnalytics.js`, expose `getStudentReplay` in the returned service object, and implement:

```javascript
getStudentReplay({ teacherId, sessionId, studentId }) {
  const session = repository.getById(sessionId);
  if (!session) throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
  assertTeacherOwns(session, teacherId);
  if (!repository.getStudentState(sessionId, studentId)) {
    throw classroomError("STUDENT_NOT_FOUND", "学生不存在", 404, false);
  }
  const rows = db.prepare(`
    SELECT * FROM challenge_attempts
    WHERE student_id = ? AND session_id = ? ORDER BY id ASC
  `).all(studentId, sessionId);
  return buildStudentReplay(sessionId, rows);
}
```

The route only parses IDs and calls this service method.

- [ ] **Step 4: Run app and full tests**

Run:

```powershell
node --test server/app.test.mjs
npm test
```

Expected: owner receives replay; other teacher receives structured 404.

- [ ] **Step 5: Commit the replay authorization fix**

```powershell
git add prototype/server/classroomSessionService.js prototype/server/classroomSessionRoutes.js prototype/server/app.test.mjs
git commit -m "fix: authorize classroom student replay"
```

---

### Task 6: Connect the Classroom UI Submission Loop

**Files:**
- Modify: `prototype/src/classroomSessionState.js`
- Modify: `prototype/src/classroomSessionState.test.mjs`
- Modify: `prototype/src/hooks/useClassroomSession.js`
- Modify: `prototype/src/App.jsx:497-505,780-787,864-869`
- Modify: `prototype/src/components/LabPage.jsx:26-73`
- Modify: `prototype/scripts/verify-classroom.mjs`

**Interfaces:**
- Produces: `mergeClassroomSubmission(viewModel, studentState): viewModel`.
- `classroomLabViewModel` contains `{ ...viewModel, submitAttempt }`.
- `persistStudentAttempt(challengeId, result)` delegates to classroom submit only when `viewModel.active && !viewModel.ended`.

- [ ] **Step 1: Write failing classroom state tests**

Add:

```javascript
test("submission response advances the current classroom stage immediately", () => {
  const mission = { stages: [{ id: "one" }, { id: "two" }] };
  const current = { active: true, stageIndex: 0, currentStage: mission.stages[0], mission };
  const next = mergeClassroomSubmission(current, {
    status: "in_progress", current_stage_index: 1, xp: 120, stars: 2, streak: 1,
  });
  assert.equal(next.stageIndex, 1);
  assert.equal(next.currentStage.id, "two");
  assert.equal(next.xp, 120);
});

test("completed submission clears the current stage", () => {
  const mission = { stages: [{ id: "one" }] };
  const next = mergeClassroomSubmission({ active: true, mission }, {
    status: "completed", current_stage_index: 1, xp: 100, stars: 1, streak: 1,
  });
  assert.equal(next.studentStatus, "completed");
  assert.equal(next.currentStage, null);
});
```

- [ ] **Step 2: Run client-state tests and confirm RED**

Run:

```powershell
node --test src/classroomSessionState.test.mjs
```

Expected: FAIL because `mergeClassroomSubmission` is not exported.

- [ ] **Step 3: Implement state merging and use it in both submit paths**

Implement:

```javascript
export function mergeClassroomSubmission(viewModel, studentState) {
  const stageIndex = studentState.current_stage_index ?? viewModel.stageIndex ?? 0;
  return {
    ...viewModel,
    stageIndex,
    currentStage: viewModel.mission?.stages?.[stageIndex] ?? null,
    studentStatus: studentState.status,
    xp: studentState.xp ?? viewModel.xp,
    stars: studentState.stars ?? viewModel.stars,
    streak: studentState.streak ?? viewModel.streak,
  };
}
```

Use it in the normal submit and online retry branches of `useClassroomSession`.

- [ ] **Step 4: Delegate active classroom attempts in App**

Change `persistStudentAttempt` to:

```javascript
async function persistStudentAttempt(challengeId, result) {
  if (auth.user?.role !== "student") return;
  try {
    const saved = classroomSession.viewModel.active && !classroomSession.viewModel.ended
      ? await classroomSession.submit({ challengeId, result })
      : await api.submitAttempt({ challengeId, result });
    if (saved.progress) setProgress({ ...buildInitialLearningProgress(), ...saved.progress });
  } catch (error) {
    setStatusMessage("提交已在本页记录，但同步服务器失败：" + error.message);
  }
}
```

Pass `{ ...classroomSession.viewModel, submitAttempt: classroomSession.submit }` as the single `classroomLabViewModel` prop.

- [ ] **Step 5: Fix Hook ordering and pause behavior**

Move the keyboard `useEffect` before the `cl?.ended` return. Its handler begins with:

```javascript
if (cl?.paused || cl?.ended) return;
```

Remove the unused `disabled` variable. Keep settlement rendering after the effect so every render calls the same Hooks.

- [ ] **Step 6: Add a browser assertion before implementation is considered green**

In `verify-classroom.mjs`, after the student enters through the UI, complete the first-stage UI action and poll `/api/student/classroom/current` only as an assertion until `current_stage_index === 1`. Do not POST `/api/student/attempts` from the QA script.

- [ ] **Step 7: Run client, API, build, and classroom QA**

Run:

```powershell
node --test src/classroomSessionState.test.mjs server/app.test.mjs
npm run build
npm run qa:classroom
```

Expected: the UI action advances the server stage and HUD without waiting 15 seconds; no Hook error is captured.

- [ ] **Step 8: Commit the classroom UI loop**

```powershell
git add prototype/src/classroomSessionState.js prototype/src/classroomSessionState.test.mjs prototype/src/hooks/useClassroomSession.js prototype/src/App.jsx prototype/src/components/LabPage.jsx prototype/scripts/verify-classroom.mjs
git commit -m "fix: connect classroom ui submission loop"
```

---

### Task 7: Make Classroom Playwright a True Two-Role Flow

**Files:**
- Modify: `prototype/scripts/verify-classroom.mjs`
- Modify: `docs/superpowers/plans/2026-07-15-classroom-mission-loop-implementation.md`

**Interfaces:**
- Consumes: existing teacher and student UI labels and isolated server from `run-browser-qa.mjs`.
- Produces: one-browser/two-context verification with screenshots under `qa-artifacts` and zero page errors.

- [ ] **Step 1: Replace lifecycle API actions with page actions**

Retain API use only for deterministic class/student setup. Use these exact UI controls for the lifecycle:

```javascript
await teacherPage.getByRole("button", { name: "创建草稿" }).click();
await teacherPage.getByRole("button", { name: "开始课堂" }).click();
await studentPage.getByRole("button", { name: "继续任务" }).click();
await studentPage.getByRole("button", { name: "分步组装" }).click();
for (let step = 1; step < 8; step += 1) {
  await studentPage.getByRole("button", { name: "下一步 ▶" }).click();
}
await studentPage.getByRole("button", { name: "完成探索" }).click();
await teacherPage.getByRole("button", { name: "暂停" }).click();
await teacherPage.getByRole("button", { name: "恢复" }).click();
await teacherPage.getByRole("button", { name: "结束课堂" }).click();
await teacherPage.getByRole("button", { name: "确认结束" }).click();
```

Each locator must resolve to one visible element. Wait on visible status text or a GET assertion with a bounded polling deadline; do not use arbitrary timeouts as the primary wait.

- [ ] **Step 2: Assert both UI and server state at each boundary**

After every action, assert the visible status text. Use GET endpoints only to confirm server state, including idempotent stage advancement and frozen report creation.

- [ ] **Step 3: Run the classroom gate twice**

Run:

```powershell
npm run qa:classroom
npm run qa:classroom
```

Expected: both runs exit 0 with isolated data and no page errors or horizontal overflow.

- [ ] **Step 4: Record implementation evidence in the existing plan**

Append a dated section containing exact test counts, browser roles, load metrics, and commands executed. Mark only actually verified steps `[x]`; leave unrelated future work unchecked.

- [ ] **Step 5: Commit the trusted classroom gate**

```powershell
git add prototype/scripts/verify-classroom.mjs docs/superpowers/plans/2026-07-15-classroom-mission-loop-implementation.md
git commit -m "test: verify classroom through real ui"
```

---

### Task 8: Run the Full Release Matrix

**Files:**
- Review: all files changed by Tasks 1-7
- Review: `prototype/AGENTS.md`
- Review: `docs/superpowers/specs/2026-07-18-code-review-remediation-design.md`

**Interfaces:**
- Produces: fresh evidence for every acceptance criterion.

- [ ] **Step 1: Inspect scope and whitespace**

Run:

```powershell
git status --short
git diff --check
git diff --stat HEAD~7..HEAD
```

Expected: only planned files plus the user's pre-existing untracked fault-injection files; no `dist`, database, QA artifact, or browser profile is tracked.

- [ ] **Step 2: Run unit/API tests and production build**

Run:

```powershell
cd prototype
npm test
npm run build
npm run qa:assets
```

Expected: zero tests fail, build exits 0, all raster files remain under budget.

- [ ] **Step 3: Run classroom load and all browser gates**

Run sequentially:

```powershell
npm run qa:classroom-load
npm run qa:ui
npm run qa:3d
npm run qa:performance
npm run qa:classroom
```

Expected: 150/150 submissions, zero `SQLITE_BUSY`, P95 at most 2000ms; every browser gate exits 0 with one Chromium worker.

- [ ] **Step 4: Re-check security acceptance**

Run:

```powershell
node --test server/security.test.mjs server/assignment.test.mjs server/app.test.mjs
rg -n "initialPassword" server src -g "*.js" -g "*.jsx" -g "*.mjs"
```

Expected: security tests pass; remaining `initialPassword` occurrences exist only in deliberate migration/test fixtures and never in production profile creation or response shaping.

- [ ] **Step 5: Final repository inspection**

Run:

```powershell
git status --short --branch
git log --oneline -10
```

Expected: planned commits are present; user-owned untracked fault-injection files remain untouched.
