# Classroom Mission Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.
>
> **Review 2026-07-17:** 计划评审通过，已记录以下调整。按顺序执行 Task 1-10，每步严格遵循 red-green TDD。

## Review Notes（实施前必读）

1. **Task 2 边界：延迟加入学生** — 草稿创建时快照现有班级成员，之后加入的学生在 `enterStudent` 或 `findCurrentForStudent` 时补建状态（用 INSERT OR IGNORE，不能只用 UPDATE）。详见 Task 2 Step 4 中 `enterStudent` 的修改。

2. **Task 3 兼容性：`recordStudentAttempt`** — 新增 `options` 参数默认 `{}`，现有调用方（`app.js:324`, `seedDemoClassroom.js:116`）无需修改即可兼容。必须加测试覆盖"不带 options 时 INSERT 写入 NULL"。

3. **Task 4 依赖注入：`requireRole`** — `requireRole` 是 `createApp()` 内部闭包函数，不导出。传递给 `createClassroomSessionRouter({ service, requireRole })` 作为依赖。不要在 app.js 中新增导出。

4. **Task 6 接口膨胀：LabPage props** — 课堂状态（paused, submitClassroom, classroomSession）通过一个合并的 `classroomLabViewModel` 对象传入，不逐 prop 添加。

5. **Task 8 截图路径：** 统一保存到 `prototype/qa-artifacts/`（已在 `.gitignore` 中）。

6. **Task 9 前置依赖：** Task 9 依赖 Task 8 创建的 `qa:classroom` 和 `qa:classroom-load` 命令，必须顺序执行。

**Goal:** Build a reliable classroom mission loop in which teachers can run a four-stage computer data-flow session and students can discover, resume, complete, and review it through a game-inspired dual-role interface.

**Architecture:** Keep teaching media, 3D, animation, and draft canvas state on the client. Add a versioned shared mission definition, a SQLite repository, a deterministic service layer, and thin Express routes for server-owned session state, limited evidence regrading, rewards, and reports. React hooks own polling and retry behavior; focused student and teacher components render the approved “bright industrial circuit lab” visual language without expanding App.jsx further.

**Tech Stack:** React 19, Express 5, better-sqlite3, Node test runner, React Flow, Three.js, Phosphor Icons, standalone Playwright, CSS.

## Global Constraints

- Student and teacher experiences have equal product priority.
- Target Windows 10/11 classroom PCs: four-core x86-64 CPU, 8 GB memory, integrated graphics, 1366×768, supported stable Edge.
- Keep SQLite, Express, React, and the existing grading logic; add no WebSocket, SSE, queue, or new runtime dependency.
- Images, 3D, animation, hints, canvas drafts, and live simulation stay client-side; the server stores only mission metadata, bounded grading rules, session state, evidence, rewards, and frozen reports.
- Teacher and student session polling interval is 15 seconds and runs only while the relevant page is visible.
- A submission body is limited to 64 KB; normalized circuit evidence is limited to 256 edges.
- The teacher dashboard must not show a public leaderboard.
- Use existing Manrope, Newsreader, Phosphor Icons, and the current navy/blue/teal/gold/danger tokens.
- Browser QA uses one standalone headless Chromium process and one worker; do not use the in-app browser.
- Preserve the current 3D overview, eight-step assembly, bus relationships, hardware builder, and semantic static fallback.
- Every behavior change follows red-green TDD and ends in an independently reviewable commit.

## File Structure

Create these focused modules:

- prototype/src/shared/classroomMissionDefinitions.js — immutable mission metadata, versions, stages, and configuration validation.
- prototype/server/classroomSessionRepository.js — SQLite reads and writes only.
- prototype/server/classroomMissionGrading.js — bounded evidence validation and reuse of existing authoritative graders.
- prototype/server/classroomSessionService.js — permissions, state transitions, time accounting, rewards, idempotency, and report freezing.
- prototype/server/classroomSessionRoutes.js — Express request parsing and response mapping.
- prototype/src/classroomSessionState.js — structured client errors, pending submission persistence, and view-model helpers.
- prototype/src/hooks/useClassroomSession.js — student discovery, enter, polling, submit, and retry.
- prototype/src/hooks/useTeacherSession.js — teacher setup, control, overview polling, and report loading.
- prototype/src/components/classroom/student/*.jsx — student mission card, HUD, pause overlay, and settlement.
- prototype/src/components/classroom/teacher/*.jsx — setup, live dashboard, student grid, and report.
- prototype/src/classroom.css — classroom-specific layout and visual tokens layered after styles.css.
- prototype/scripts/verify-classroom.mjs — two-context teacher/student Playwright flow.
- prototype/scripts/verify-classroom-load.mjs — 150-student bounded API load gate.

Modify these integration points:

- prototype/server/db.js — schema migration and busy timeout.
- prototype/server/app.js — mount classroom routes and delegate classroom submissions.
- prototype/server/submissionValidation.js — accept classroom clientSubmissionId while preserving ordinary practice compatibility.
- prototype/src/apiClient.js — structured errors and classroom endpoints.
- prototype/src/App.jsx — compose hooks and pass classroom view models; do not add business rules.
- prototype/src/components/StudentHome.jsx — current mission entry and motherboard route map.
- prototype/src/components/LabPage.jsx — mission HUD, pause state, and settlement around existing workspaces.
- prototype/src/components/TeacherDashboard.jsx — session setup and command-center region.
- prototype/src/main.jsx — import classroom.css.
- prototype/package.json — classroom QA scripts.
- prototype/AGENTS.md and docs/classroom-deployment.md — durable QA and operations guidance.

---

### Task 1: Versioned Mission Definition

**Files:**
- Create: prototype/src/shared/classroomMissionDefinitions.js
- Create: prototype/src/shared/classroomMissionDefinitions.test.mjs

**Interfaces:**
- Produces: getClassroomMission(templateKey, templateVersion), getLatestClassroomMission(templateKey), validateClassroomSessionConfig(input).
- Consumers: repository snapshots, service validation, student and teacher view models.

- [ ] **Step 1: Write the failing mission-definition tests**

~~~javascript
import test from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES } from "../platformLogic.js";
import {
  getClassroomMission,
  getLatestClassroomMission,
  validateClassroomSessionConfig,
} from "./classroomMissionDefinitions.js";

test("computer data-flow mission keeps four stable stages backed by real challenges", () => {
  const mission = getClassroomMission("computer-data-flow", 1);
  assert.deepEqual(
    mission.stages.map(({ id, challengeId }) => ({ id, challengeId })),
    [
      { id: "components", challengeId: "computer-components" },
      { id: "program-flow", challengeId: "program-flow" },
      { id: "instruction-data", challengeId: "instruction-data" },
      { id: "data-flow", challengeId: "data-flow" },
    ],
  );
  const challengeIds = new Set(CHALLENGES.map((item) => item.id));
  assert.equal(mission.stages.every((stage) => challengeIds.has(stage.challengeId)), true);
  assert.equal(Object.isFrozen(mission), true);
});

test("session configuration is normalized and bounded", () => {
  assert.deepEqual(validateClassroomSessionConfig({
    templateKey: "computer-data-flow",
    durationMinutes: 45,
    passScore: 80,
    allowMakeup: true,
  }), {
    templateKey: "computer-data-flow",
    templateVersion: 1,
    durationMinutes: 45,
    passScore: 80,
    allowMakeup: true,
  });
  assert.throws(() => validateClassroomSessionConfig({ templateKey: "missing", durationMinutes: 45, passScore: 80 }), /任务包/);
  assert.throws(() => validateClassroomSessionConfig({ templateKey: "computer-data-flow", durationMinutes: 9, passScore: 80 }), /10.*180/);
  assert.throws(() => validateClassroomSessionConfig({ templateKey: "computer-data-flow", durationMinutes: 45, passScore: 59 }), /60.*100/);
});

test("latest mission lookup resolves version one", () => {
  assert.equal(getLatestClassroomMission("computer-data-flow").version, 1);
});
~~~

- [ ] **Step 2: Run the target test and confirm the missing-module failure**

Run: <code>cd prototype; node --test src/shared/classroomMissionDefinitions.test.mjs</code>

Expected: FAIL with ERR_MODULE_NOT_FOUND for classroomMissionDefinitions.js.

- [ ] **Step 3: Add the immutable mission registry and validator**

~~~javascript
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

export const CLASSROOM_MISSIONS = deepFreeze({
  "computer-data-flow": {
    1: {
      key: "computer-data-flow",
      version: 1,
      title: "计算机五大部件与数据流",
      stages: [
        { id: "components", challengeId: "computer-components", title: "认识五大部件", grading: "participation" },
        { id: "program-flow", challengeId: "program-flow", title: "观察程序执行", grading: "circuit" },
        { id: "instruction-data", challengeId: "instruction-data", title: "区分指令与数据", grading: "circuit" },
        { id: "data-flow", challengeId: "data-flow", title: "完成综合数据流实训", grading: "circuit" },
      ],
    },
  },
});

export function getClassroomMission(templateKey, templateVersion) {
  const mission = CLASSROOM_MISSIONS[templateKey]?.[templateVersion];
  if (!mission) throw new Error("课堂任务包不存在");
  return mission;
}

export function getLatestClassroomMission(templateKey) {
  const versions = Object.keys(CLASSROOM_MISSIONS[templateKey] ?? {}).map(Number);
  if (versions.length === 0) throw new Error("课堂任务包不存在");
  return getClassroomMission(templateKey, Math.max(...versions));
}

export function validateClassroomSessionConfig(input = {}) {
  const mission = getLatestClassroomMission(String(input.templateKey ?? ""));
  const durationMinutes = Number(input.durationMinutes);
  const passScore = Number(input.passScore);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 180) {
    throw new Error("课堂限时必须是 10 到 180 分钟的整数");
  }
  if (!Number.isInteger(passScore) || passScore < 60 || passScore > 100) {
    throw new Error("及格分必须是 60 到 100 的整数");
  }
  return {
    templateKey: mission.key,
    templateVersion: mission.version,
    durationMinutes,
    passScore,
    allowMakeup: input.allowMakeup === true,
  };
}
~~~

- [ ] **Step 4: Run the target and full unit suites**

Run: <code>cd prototype; node --test src/shared/classroomMissionDefinitions.test.mjs</code>

Expected: 3 tests pass.

Run: <code>cd prototype; npm test</code>

Expected: all existing and new tests pass.

- [ ] **Step 5: Commit the mission registry**

~~~bash
git add prototype/src/shared/classroomMissionDefinitions.js prototype/src/shared/classroomMissionDefinitions.test.mjs
git commit -m "feat: add versioned classroom mission definition"
~~~

### Task 2: SQLite Schema and Repository

**Files:**
- Modify: prototype/server/db.js:14-111
- Create: prototype/server/classroomSessionRepository.js
- Create: prototype/server/classroomSessionRepository.test.mjs

**Interfaces:**
- Consumes: validated config and mission version from Task 1.
- Produces: createClassroomSessionRepository(db) with createDraft, getById, findCurrentForStudent, findActiveConflictsForClass, getStudentState, enterStudent, transition, findDuplicateAttempt, updateStudentAfterAttempt, freezeReport, and getOverview.

- [ ] **Step 1: Write failing migration and repository tests**

~~~javascript
import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword } from "./auth.js";
import { addStudentToClass, createClass, createUser, migrate, openDatabase } from "./db.js";
import { createClassroomSessionRepository } from "./classroomSessionRepository.js";

test("migration creates classroom tables and idempotency index", () => {
  const db = openDatabase(":memory:");
  migrate(db);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  assert.ok(tables.includes("classroom_sessions"));
  assert.ok(tables.includes("student_session_states"));
  const attemptColumns = db.prepare("PRAGMA table_info(challenge_attempts)").all().map((row) => row.name);
  assert.ok(attemptColumns.includes("session_id"));
  assert.ok(attemptColumns.includes("client_submission_id"));
  const indexes = db.prepare("PRAGMA index_list(challenge_attempts)").all().map((row) => row.name);
  assert.ok(indexes.includes("idx_attempts_student_submission"));
  db.close();
});

test("draft creation snapshots every current class member", async () => {
  const db = openDatabase(":memory:");
  migrate(db);
  const teacher = createUser(db, {
    username: "teacher-repo",
    displayName: "任课教师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const student = createUser(db, {
    username: "student-repo",
    displayName: "测试学生",
    role: "student",
    passwordHash: await hashPassword("Student123!"),
  });
  const classRow = createClass(db, teacher.id, "计组仓储测试班");
  addStudentToClass(db, classRow.id, student.id);
  const repository = createClassroomSessionRepository(db);
  const session = repository.createDraft({
    classId: classRow.id,
    teacherId: teacher.id,
    templateKey: "computer-data-flow",
    templateVersion: 1,
    title: "计算机五大部件与数据流",
    durationMinutes: 45,
    passScore: 80,
    allowMakeup: false,
    configJson: JSON.stringify({ durationMinutes: 45, passScore: 80, allowMakeup: false }),
  });
  assert.equal(session.status, "draft");
  assert.equal(repository.getStudentState(session.id, student.id).status, "not_started");
  // Late-joining student gets backfilled on enter
  const lateStudent = createUser(db, {
    username: "late-student",
    displayName: "迟到学生",
    role: "student",
    passwordHash: await hashPassword("Student123!"),
  });
  addStudentToClass(db, classRow.id, lateStudent.id);
  const entered = repository.enterStudent(session.id, lateStudent.id);
  assert.equal(entered.status, "in_progress");
  db.close();
});
~~~

- [ ] **Step 2: Run the repository test and confirm missing schema/module failures**

Run: <code>cd prototype; node --test server/classroomSessionRepository.test.mjs</code>

Expected: FAIL because the repository module and classroom tables do not exist.

- [ ] **Step 3: Extend migration without rewriting existing databases**

Add <code>db.pragma("busy_timeout = 5000")</code> after foreign keys, create the two tables from the approved spec, and add these compatibility operations after the existing ensureColumn calls:

~~~javascript
ensureColumn(db, "challenge_attempts", "session_id", "INTEGER REFERENCES classroom_sessions(id)");
ensureColumn(db, "challenge_attempts", "client_submission_id", "TEXT");
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_active_session_per_class
  ON classroom_sessions(class_id)
  WHERE status IN ('live', 'paused');

  CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_student_submission
  ON challenge_attempts(student_id, client_submission_id)
  WHERE client_submission_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_student_session_student
  ON student_session_states(student_id, session_id);
`);
~~~

Use the exact classroom_sessions and student_session_states columns from the approved design specification. Run migration twice in the test to prove idempotency.

- [ ] **Step 4: Implement a statement-owned repository**

The factory must return this exact method surface:

~~~javascript
export function createClassroomSessionRepository(db) {
  return {
    createDraft,
    getById,
    findCurrentForStudent,
    findActiveConflictsForClass,
    getStudentState,
    enterStudent,
    transition,
    findDuplicateAttempt,
    updateStudentAfterAttempt,
    freezeReport,
    getOverview,
  };

  function createDraft(input) {
    return db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO classroom_sessions
          (class_id, teacher_id, template_key, template_version, title, status,
           duration_minutes, pass_score, allow_makeup, config_json)
        VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
      `).run(
        input.classId,
        input.teacherId,
        input.templateKey,
        input.templateVersion,
        input.title,
        input.durationMinutes,
        input.passScore,
        input.allowMakeup ? 1 : 0,
        input.configJson,
      );
      const sessionId = Number(result.lastInsertRowid);
      db.prepare(`
        INSERT INTO student_session_states (session_id, student_id, status)
        SELECT ?, student_id, 'not_started'
        FROM class_members WHERE class_id = ?
      `).run(sessionId, input.classId);
      return getById(sessionId);
    })();
  }

  function getById(sessionId) {
    return db.prepare("SELECT * FROM classroom_sessions WHERE id = ?").get(sessionId) ?? null;
  }

  function findCurrentForStudent(studentId) {
    return db.prepare(`
      SELECT cs.*
      FROM classroom_sessions cs
      JOIN class_members cm ON cm.class_id = cs.class_id
      WHERE cm.student_id = ? AND cs.status IN ('live', 'paused')
      ORDER BY cs.id DESC LIMIT 1
    `).get(studentId) ?? null;
  }

  function findActiveConflictsForClass(classId, excludeSessionId = null) {
    return db.prepare(`
      SELECT DISTINCT u.id AS student_id, u.display_name, cs.id AS session_id, cs.title
      FROM class_members target
      JOIN class_members other ON other.student_id = target.student_id
      JOIN classroom_sessions cs
        ON cs.class_id = other.class_id AND cs.status IN ('live', 'paused')
      JOIN users u ON u.id = target.student_id
      WHERE target.class_id = ? AND (? IS NULL OR cs.id <> ?)
      ORDER BY u.display_name, u.id
    `).all(classId, excludeSessionId, excludeSessionId);
  }

  function getStudentState(sessionId, studentId) {
    return db.prepare(`
      SELECT * FROM student_session_states WHERE session_id = ? AND student_id = ?
    `).get(sessionId, studentId) ?? null;
  }

  function enterStudent(sessionId, studentId) {
    db.prepare(`
      INSERT OR IGNORE INTO student_session_states (session_id, student_id, status)
      VALUES (?, ?, 'not_started')
    `).run(sessionId, studentId);
    db.prepare(`
      UPDATE student_session_states
      SET status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
          entered_at = COALESCE(entered_at, CURRENT_TIMESTAMP),
          last_activity_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND student_id = ?
    `).run(sessionId, studentId);
    return getStudentState(sessionId, studentId);
  }

  function transition(sessionId, expectedStatus, nextStatus, fields = {}) {
    const result = db.prepare(`
      UPDATE classroom_sessions
      SET status = ?, active_started_at = ?, accumulated_active_seconds = ?,
          paused_at = ?, ended_at = ?, report_json = COALESCE(?, report_json),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = ?
    `).run(
      nextStatus,
      fields.activeStartedAt ?? null,
      fields.accumulatedActiveSeconds ?? 0,
      fields.pausedAt ?? null,
      fields.endedAt ?? null,
      fields.reportJson ?? null,
      sessionId,
      expectedStatus,
    );
    return result.changes === 1 ? getById(sessionId) : null;
  }

  function findDuplicateAttempt(studentId, clientSubmissionId) {
    return db.prepare(`
      SELECT * FROM challenge_attempts
      WHERE student_id = ? AND client_submission_id = ?
    `).get(studentId, clientSubmissionId) ?? null;
  }

  function updateStudentAfterAttempt(input) {
    db.prepare(`
      UPDATE student_session_states
      SET status = ?, current_stage_index = ?, xp = ?, stars = ?, streak = ?,
          result_json = ?, last_activity_at = CURRENT_TIMESTAMP,
          completed_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND student_id = ?
    `).run(
      input.status,
      input.currentStageIndex,
      input.xp,
      input.stars,
      input.streak,
      JSON.stringify(input.result),
      input.completedAt,
      input.sessionId,
      input.studentId,
    );
    return getStudentState(input.sessionId, input.studentId);
  }

  function freezeReport(sessionId, report) {
    db.prepare(`
      UPDATE classroom_sessions SET report_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND report_json IS NULL
    `).run(JSON.stringify(report), sessionId);
    return getById(sessionId);
  }

  function getOverview(sessionId) {
    const session = getById(sessionId);
    const students = db.prepare(`
      SELECT sss.*, u.display_name, u.username
      FROM student_session_states sss
      JOIN users u ON u.id = sss.student_id
      WHERE sss.session_id = ?
      ORDER BY u.display_name, u.id
    `).all(sessionId);
    return { session, students };
  }
}
~~~

- [ ] **Step 5: Run repository, migration, and full tests**

Run: <code>cd prototype; node --test server/classroomSessionRepository.test.mjs</code>

Expected: both tests pass.

Run: <code>cd prototype; npm test</code>

Expected: all tests pass and the existing database API remains compatible.

- [ ] **Step 6: Commit schema and repository**

~~~bash
git add prototype/server/db.js prototype/server/classroomSessionRepository.js prototype/server/classroomSessionRepository.test.mjs
git commit -m "feat: persist classroom mission sessions"
~~~

### Task 3: Deterministic Grading, State Machine, Rewards, and Reports

**Files:**
- Create: prototype/server/classroomMissionGrading.js
- Create: prototype/server/classroomMissionGrading.test.mjs
- Create: prototype/server/classroomSessionService.js
- Create: prototype/server/classroomSessionService.test.mjs
- Modify: prototype/server/db.js:264-284

**Interfaces:**
- Consumes: repository methods from Task 2, mission definitions from Task 1, normalizeStudentAttemptPayload, and existing authoritative progress functions.
- Produces: createClassroomSessionService({ db, now }), returning createDraft, start, pause, resume, end, getStudentCurrent, enterStudent, submitAttempt, getTeacherOverview, and getReport.

- [ ] **Step 1: Write grading boundary tests**

Test these exact cases: participation evidence accepts only <code>{ completed: true }</code>; circuit evidence rejects more than 256 edges; serialized result larger than 64 KB is rejected; malformed edges are rejected; normalized circuit evidence is regraded by existing server logic and never trusts client score.

Run: <code>cd prototype; node --test server/classroomMissionGrading.test.mjs</code>

Expected: FAIL because classroomMissionGrading.js does not exist.

- [ ] **Step 2: Implement the bounded grading registry**

~~~javascript
import { LEARNING_ITEMS } from "../src/platformLogic.js";
import { normalizeStudentAttemptPayload } from "./submissionValidation.js";

const MAX_RESULT_BYTES = 64 * 1024;
const MAX_EDGES = 256;

export function gradeClassroomEvidence({ mission, stageIndex, payload, progress }) {
  const stage = mission.stages[stageIndex];
  if (!stage) throw classroomError("STAGE_MISMATCH", "课堂阶段不匹配", 409, false);
  const serializedBytes = Buffer.byteLength(JSON.stringify(payload ?? {}), "utf8");
  if (serializedBytes > MAX_RESULT_BYTES) {
    throw classroomError("SUBMISSION_TOO_LARGE", "提交证据超过 64 KB", 413, false);
  }
  if (stage.grading === "participation") {
    if (payload?.result?.completed !== true) {
      throw classroomError("INVALID_STAGE_EVIDENCE", "探索阶段缺少完成动作", 400, false);
    }
    return {
      challengeId: stage.challengeId,
      result: { score: 100, passed: true, errors: [], elapsedMinutes: Number(payload.result.elapsedMinutes ?? 0), completed: true },
    };
  }
  const edges = payload?.result?.edges;
  if (!Array.isArray(edges) || edges.length > MAX_EDGES) {
    throw classroomError("INVALID_STAGE_EVIDENCE", "电路证据必须包含不超过 256 条规范连线", 400, false);
  }
  return normalizeStudentAttemptPayload(
    { challengeId: stage.challengeId, result: payload.result },
    LEARNING_ITEMS,
    progress,
    true,
  );
}

export function classroomError(code, message, status = 400, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.retryable = retryable;
  return error;
}
~~~

- [ ] **Step 3: Write service tests before implementation**

Cover the exact transition matrix draft→live, live→paused, paused→live, live/paused→ended; reject all other transitions with INVALID_SESSION_TRANSITION. Add tests for active-time accumulation, automatic expiry on read, cross-class student active-session conflicts, first-attempt bonus, streak reset, one/two/three-star boundaries, fixed badges, duplicate clientSubmissionId, paused submission rejection, stage mismatch, transaction rollback when grading throws, and stable frozen report reads.

Run: <code>cd prototype; node --test server/classroomSessionService.test.mjs</code>

Expected: FAIL because classroomSessionService.js does not exist.

- [ ] **Step 4: Implement explicit transition and reward helpers**

~~~javascript
export const ALLOWED_TRANSITIONS = Object.freeze({
  draft: new Set(["live"]),
  live: new Set(["paused", "ended"]),
  paused: new Set(["live", "ended"]),
  ended: new Set(),
});

export function computeActiveSeconds(session, nowMs) {
  const stored = Number(session.accumulated_active_seconds ?? 0);
  if (session.status !== "live" || !session.active_started_at) return stored;
  return stored + Math.max(0, Math.floor((nowMs - Date.parse(session.active_started_at)) / 1000));
}

export function calculateRewards({ stageScores, firstAttemptPasses, stageAttempts, streak, passScore }) {
  const completedScores = stageScores.filter((score) => Number.isFinite(score));
  const average = completedScores.length
    ? completedScores.reduce((sum, score) => sum + score, 0) / completedScores.length
    : 0;
  const baseXp = completedScores.reduce((sum, score) => sum + score, 0);
  const firstAttemptXp = firstAttemptPasses.filter(Boolean).length * 20;
  const streakXp = [10, 20, 30].slice(0, Math.max(0, Math.min(3, streak))).reduce((sum, value) => sum + value, 0);
  const stars = completedScores.length < 4 ? 0
    : average >= 95 && stageAttempts.every((attempts) => attempts <= 2) ? 3
    : average >= 90 ? 2
    : average >= passScore ? 1
    : 0;
  return { xp: baseXp + firstAttemptXp + streakXp, stars, average: Math.round(average) };
}

export function calculateBadges(passedStageIds) {
  const passed = new Set(passedStageIds);
  return [
    ...(passed.has("components") ? ["部件识别者"] : []),
    ...(passed.has("instruction-data") && passed.has("data-flow") ? ["数据流侦探"] : []),
  ];
}
~~~

Implement createClassroomSessionService with injected <code>now = () => Date.now()</code>. Every public read first calls <code>expireIfNeeded(session)</code>. getReport throws <code>SESSION_NOT_ENDED</code> with HTTP 409 until report_json is frozen. Every mutation verifies teacher ownership or student membership before changing state. Before draft→live, call <code>findActiveConflictsForClass(session.class_id, session.id)</code>; if it returns students, throw <code>ACTIVE_SESSION_CONFLICT</code> with HTTP 409 and attach the conflicting student/session list. Submit runs duplicate detection, grading, attempt insertion, long-term progress update, student-session update, and reward calculation inside one better-sqlite3 transaction. End freezes both each student result_json and the class report_json inside one transaction.

- [ ] **Step 5: Make existing progress recording transaction-friendly**

Change recordStudentAttempt to accept an optional options object:

~~~javascript
export function recordStudentAttempt(db, studentId, challengeId, result, options = {}) {
  const run = () => {
    const before = getStudentProgress(db, studentId);
    const next = recordAttempt(before, challengeId, result);
    const errors = (result.errors ?? []).map((error) => error.type ?? String(error));
    db.prepare(`
      INSERT INTO challenge_attempts
        (student_id, challenge_id, score, passed, errors_json, result_json,
         elapsed_minutes, session_id, client_submission_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId,
      challengeId,
      Number(result.score ?? 0),
      result.passed ? 1 : 0,
      JSON.stringify(errors),
      JSON.stringify(result),
      Number(result.elapsedMinutes ?? 0),
      options.sessionId ?? null,
      options.clientSubmissionId ?? null,
    );
    saveStudentProgress(db, studentId, next);
    return next;
  };
  return options.inTransaction ? run() : db.transaction(run)();
}
~~~

> **兼容性要求：** 现有调用方 `app.js:324` 和 `seedDemoClassroom.js:116` 不传 `options` 时应继续正常工作。Task 3 的测试必须单独验证：不带 options 调用时 `session_id` 和 `client_submission_id` 列写入 NULL，现有测试用例不受影响。

- [ ] **Step 6: Run focused and full service tests**

Run: <code>cd prototype; node --test server/classroomMissionGrading.test.mjs server/classroomSessionService.test.mjs</code>

Expected: all grading and service tests pass.

Run: <code>cd prototype; npm test</code>

Expected: all tests pass.

- [ ] **Step 7: Commit deterministic classroom rules**

~~~bash
git add prototype/server/classroomMissionGrading.js prototype/server/classroomMissionGrading.test.mjs prototype/server/classroomSessionService.js prototype/server/classroomSessionService.test.mjs prototype/server/db.js
git commit -m "feat: add deterministic classroom session rules"
~~~

### Task 4: Thin Classroom HTTP Routes and Integration Coverage

**Files:**
- Create: prototype/server/classroomSessionRoutes.js
- Modify: prototype/server/app.js:46-392
- Modify: prototype/server/app.test.mjs

**Interfaces:**
- Consumes: createClassroomSessionService from Task 3.
- Produces: all approved teacher and student classroom endpoints with structured errors.

- [ ] **Step 1: Add a failing end-to-end API test**

Extend makeServer to expose the service through createApp. Add one test that logs in a teacher and student, creates a class, imports the student, creates/starts a session, discovers and enters it, submits stage one twice with the same clientSubmissionId, pauses/rejects submission, resumes, completes the remaining stages with reference evidence, ends the session, and reads the frozen report. Assert ownership 404, cross-role 403, invalid transition 409, report-before-end SESSION_NOT_ENDED, duplicate XP stability, and SESSION_PAUSED.

Run: <code>cd prototype; node --test server/app.test.mjs</code>

Expected: the new test fails with 404 on the first classroom route.

- [ ] **Step 2: Create and mount a route factory**

~~~javascript
import { Router } from "express";

export function createClassroomSessionRouter({ service, requireRole }) {
  const router = Router();

  router.post("/teacher/classes/:classId/sessions", requireRole("teacher"), (req, res, next) => {
    try {
      const session = service.createDraft({
        teacherId: req.user.id,
        classId: Number(req.params.classId),
        config: req.body,
      });
      res.status(201).json({ session });
    } catch (error) {
      next(error);
    }
  });

  for (const action of ["start", "pause", "resume", "end"]) {
    router.post(`/teacher/sessions/:id/${action}`, requireRole("teacher"), (req, res, next) => {
      try {
        const result = service[action]({ teacherId: req.user.id, sessionId: Number(req.params.id) });
        res.json(action === "end" ? result : { session: result });
      } catch (error) {
        next(error);
      }
    });
  }

  router.get("/teacher/sessions/:id/overview", requireRole("teacher"), (req, res, next) => {
    try {
      res.json(service.getTeacherOverview({ teacherId: req.user.id, sessionId: Number(req.params.id) }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/teacher/sessions/:id/report", requireRole("teacher"), (req, res, next) => {
    try {
      res.json({ report: service.getReport({ teacherId: req.user.id, sessionId: Number(req.params.id) }) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/student/classroom/current", requireRole("student"), (req, res, next) => {
    try {
      res.json(service.getStudentCurrent({ studentId: req.user.id }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/student/classroom/:sessionId/enter", requireRole("student"), (req, res, next) => {
    try {
      res.json(service.enterStudent({ studentId: req.user.id, sessionId: Number(req.params.sessionId) }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
~~~

Mount at <code>/api</code> from createApp. <strong>requireRole 不导出</strong>（它是 createApp 内部闭包）。直接从 createApp 传入 createClassroomSessionRouter 作为依赖参数 `{ service, requireRole }`，不在 app.js 中新增 export。

- [ ] **Step 3: Delegate active classroom submissions**

In POST /api/student/attempts, first ask the service for an active session. Ordinary practice keeps the current normalize-and-save path. Active classroom submissions require a non-empty clientSubmissionId and call service.submitAttempt; return <code>{ progress, summary, classroomSession }</code>. The client cannot supply a trusted sessionId, stage, XP, stars, or badge.

- [ ] **Step 4: Map structured errors once**

Change the final Express error handler so classroom errors return:

~~~javascript
if (error?.code && error?.status) {
  return res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable === true,
    },
  });
}
~~~

Preserve existing non-classroom error behavior below this branch.

- [ ] **Step 5: Run API and full tests**

Run: <code>cd prototype; node --test server/app.test.mjs</code>

Expected: all API tests pass.

Run: <code>cd prototype; npm test</code>

Expected: all tests pass.

- [ ] **Step 6: Commit the HTTP slice**

~~~bash
git add prototype/server/classroomSessionRoutes.js prototype/server/app.js prototype/server/app.test.mjs
git commit -m "feat: expose classroom mission APIs"
~~~

### Task 5: Client Contract, Pending Submission Persistence, and Hooks

**Files:**
- Modify: prototype/src/apiClient.js
- Create: prototype/src/classroomSessionState.js
- Create: prototype/src/classroomSessionState.test.mjs
- Create: prototype/src/hooks/useClassroomSession.js
- Create: prototype/src/hooks/useTeacherSession.js

**Interfaces:**
- Produces: ApiError, pendingSubmissionKey, readPendingSubmission, writePendingSubmission, clearPendingSubmission, buildClassroomViewModel, useClassroomSession, and useTeacherSession.
- Consumers: App.jsx and focused classroom components.

- [ ] **Step 1: Write failing pure client-state tests**

Cover structured ApiError fields, key isolation by user/session/stage, malformed localStorage JSON recovery, pending request preservation after retryable failure, clearing only after success, and view-model handling for null/paused/ended session states.

Run: <code>cd prototype; node --test src/classroomSessionState.test.mjs</code>

Expected: FAIL because classroomSessionState.js does not exist.

- [ ] **Step 2: Implement structured API errors and endpoint methods**

~~~javascript
export class ApiError extends Error {
  constructor({ status, code, message, retryable = false }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}
~~~

In apiRequest, when response is not OK and body.error is an object, throw ApiError with response status and the server fields. Add:

~~~javascript
currentClassroom: () => apiRequest("/api/student/classroom/current"),
enterClassroom: (sessionId) => apiRequest(`/api/student/classroom/${sessionId}/enter`, { method: "POST" }),
createClassroomSession: (classId, payload) => apiRequest(`/api/teacher/classes/${classId}/sessions`, { method: "POST", body: JSON.stringify(payload) }),
startClassroomSession: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/start`, { method: "POST" }),
pauseClassroomSession: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/pause`, { method: "POST" }),
resumeClassroomSession: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/resume`, { method: "POST" }),
endClassroomSession: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/end`, { method: "POST" }),
classroomOverview: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/overview`),
classroomReport: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/report`),
~~~

- [ ] **Step 3: Implement deterministic pending-submission helpers**

~~~javascript
export function pendingSubmissionKey({ userId, sessionId, stageId }) {
  return `classroom:pending:${userId}:${sessionId}:${stageId}`;
}

export function readPendingSubmission(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return value?.clientSubmissionId && value?.payload ? value : null;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writePendingSubmission(storage, key, payload) {
  storage.setItem(key, JSON.stringify(payload));
}

export function clearPendingSubmission(storage, key) {
  storage.removeItem(key);
}
~~~

- [ ] **Step 4: Implement visibility-aware hooks**

useClassroomSession accepts <code>{ userId, enabled, apiClient = api, storage = localStorage }</code>. It loads current state immediately, polls every 15,000 ms only when document.visibilityState is visible, enters idempotently, submits with crypto.randomUUID, retains the exact request on network failure, retries once on online, and stops retrying on SESSION_PAUSED, SESSION_ENDED, or STAGE_MISMATCH.

useTeacherSession accepts <code>{ classId, enabled, apiClient = api }</code>. It creates and controls sessions, polls only a live/paused selected session every 15,000 ms while visible, keeps stale overview data on error, exposes lastUpdatedAt, and never resets filters or selection.

- [ ] **Step 5: Run client-state and full tests**

Run: <code>cd prototype; node --test src/classroomSessionState.test.mjs</code>

Expected: all client-state tests pass.

Run: <code>cd prototype; npm test</code>

Expected: all tests pass.

- [ ] **Step 6: Commit client state and hooks**

~~~bash
git add prototype/src/apiClient.js prototype/src/classroomSessionState.js prototype/src/classroomSessionState.test.mjs prototype/src/hooks/useClassroomSession.js prototype/src/hooks/useTeacherSession.js
git commit -m "feat: add resilient classroom client state"
~~~

### Task 6: Student Mission Route, HUD, Pause, and Settlement

**Files:**
- Create: prototype/src/components/classroom/student/CurrentMissionCard.jsx
- Create: prototype/src/components/classroom/student/MissionHud.jsx
- Create: prototype/src/components/classroom/student/MissionPauseOverlay.jsx
- Create: prototype/src/components/classroom/student/MissionSettlement.jsx
- Modify: prototype/src/components/StudentHome.jsx
- Modify: prototype/src/components/LabPage.jsx
- Modify: prototype/src/App.jsx:445-1000
- Create: prototype/src/classroom.css
- Modify: prototype/src/main.jsx

**Interfaces:**
- Consumes: useClassroomSession result and existing routeGroups/progress.
- Produces: a motherboard route home, instrument HUD, non-destructive pause overlay, and engineering-report settlement.

- [ ] **Step 1: Add failing view-model tests**

Extend classroomSessionState.test.mjs to assert that current mission maps stage index to stage title/challengeId, remainingSeconds never goes negative, paused state disables run/submit but preserves canvas, ended state exposes frozen result, and locked route nodes include textual prerequisites.

Run: <code>cd prototype; node --test src/classroomSessionState.test.mjs</code>

Expected: new assertions fail before view-model implementation.

- [ ] **Step 2: Implement focused student components**

CurrentMissionCard renders mission title, stage progress, remaining time, save state, and exactly one primary continue/enter action. MissionHud renders stage, remaining time, save state, XP, stars, and streak as an engineering instrument strip. MissionPauseOverlay uses role=status, displays “教师已暂停”, and does not unmount children. MissionSettlement renders badge, score metrics, strength, weakness, review, optimize-again, and return actions.

All components receive plain props and contain no fetch, timer, storage, reward, or grading logic.

- [ ] **Step 3: Refactor the home route into the approved board**

Replace fixed 270×320 horizontal cards with chapter regions and compact route nodes. Keep the existing course metadata and click behavior. Current, completed, available, and locked states must each expose icon plus Chinese text. Do not render the student personal name in the main home area.

Use this structural contract:

~~~jsx
<main className="mission-home">
  <section className="mission-route-board" aria-label="课程电路路线">
    <header className="mission-channel-bar">{currentMissionCard}</header>
    <div className="mission-route-canvas">{chapterRegions}</div>
  </section>
  <aside className="mission-brief-panel">{currentTaskBrief}</aside>
</main>
~~~

- [ ] **Step 4: Wrap existing lab canvases without replacing them**

LabPage keeps OverviewExplodedView, CircuitFlowCanvas, MachineNumberPanel, MemorySystemPanel, and MobileLabFallback. Add MissionHud above the active workspace, pass disabled to run/submit controls while paused, overlay MissionPauseOverlay without resetting lab state, and replace the normal completion panel with MissionSettlement only when the classroom session is ended.

> **接口约定：** 课堂相关状态（`paused`, `submitClassroom`, `classroomSession`）通过一个合并的 `classroomLabViewModel` prop 传入 LabPage，不逐个 prop 添加。LabPage 自身不调用 `useClassroomSession` hook。

- [ ] **Step 5: Add the approved low-cost visual system**

Import classroom.css after styles.css. Define:

~~~css
:root {
  --classroom-instrument: #102a46;
  --classroom-instrument-ink: #eff9ff;
  --classroom-data: var(--teal);
  --classroom-address: var(--blue);
  --classroom-control: var(--gold);
  --classroom-power: var(--danger);
}

.mission-home {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 288px;
  gap: 18px;
  min-height: calc(100vh - 96px);
}

.mission-channel-bar {
  min-height: 64px;
}

.classroom-lab-grid {
  display: grid;
  grid-template-columns: 240px minmax(720px, 1fr) 300px;
  gap: 16px;
}

@media (max-width: 1180px) {
  .classroom-lab-grid,
  .mission-home {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mission-route-node,
  .classroom-signal {
    animation: none !important;
    transition: none !important;
  }
}
~~~

Use no continuous background particles, no full-screen video, no heavy blur, and no new decorative asset unless a measured slot and optimized original WebP are approved.

- [ ] **Step 6: Keep App.jsx as composition only**

Instantiate useClassroomSession near role data, pass its view model and actions to StudentHome and LabPage, and remove any classroom timer, transition, reward, retry, or grading branch from App.jsx.

- [ ] **Step 7: Run tests, build, and focused standalone UI smoke**

Run: <code>cd prototype; npm test</code>

Expected: all tests pass.

Run: <code>cd prototype; npm run build</code>

Expected: Vite build succeeds without a common-entry chunk warning above 500 KB.

Run: <code>cd prototype; npm run qa:ui</code>

Expected: student home, 3D, React Flow labs, records, and refresh flow pass with no page errors.

- [ ] **Step 8: Commit the student experience**

~~~bash
git add prototype/src/components/classroom/student prototype/src/components/StudentHome.jsx prototype/src/components/LabPage.jsx prototype/src/App.jsx prototype/src/classroom.css prototype/src/main.jsx prototype/src/classroomSessionState.test.mjs
git commit -m "feat: add game-inspired student classroom mission UI"
~~~

### Task 7: Teacher Session Setup and Classroom Command Center

**Files:**
- Create: prototype/src/components/classroom/teacher/SessionSetupPanel.jsx
- Create: prototype/src/components/classroom/teacher/LiveSessionDashboard.jsx
- Create: prototype/src/components/classroom/teacher/SessionStudentGrid.jsx
- Create: prototype/src/components/classroom/teacher/SessionReportPanel.jsx
- Modify: prototype/src/components/TeacherDashboard.jsx
- Modify: prototype/src/App.jsx
- Modify: prototype/src/classroom.css

**Interfaces:**
- Consumes: useTeacherSession state/actions and selectedTeacherClassId.
- Produces: setup, state controls, stage heatmap, bottleneck rail, filtered student queue, and frozen report.

- [ ] **Step 1: Add failing teacher view-model tests**

Add buildTeacherSessionViewModel tests for not-started, live, paused, stale overview, ended report, stage buckets, repeated-error alerts, inactive students, and no-public-ranking output.

Run: <code>cd prototype; node --test src/classroomSessionState.test.mjs</code>

Expected: new teacher assertions fail.

- [ ] **Step 2: Implement the setup and control components**

SessionSetupPanel exposes only fixed mission selection, integer duration 10–180, pass score 60–100, and allowMakeup. LiveSessionDashboard always shows status, authoritative remaining time, last update, manual refresh, and correctly grouped start/pause/resume/end controls. End requires a confirmation dialog with the session title and “结束后不可恢复”.

- [ ] **Step 3: Implement heatmap and student queue**

SessionStudentGrid groups not_started, in_progress, completed, and needs_help. Filters are stage, help requirement, and last activity. Each row shows student display name, stage, state text, last activity, and repeated error. Selecting a row opens an in-context side panel for event trail, first error type, hint level, and latest submission; it must not navigate away.

- [ ] **Step 4: Integrate the command-center region**

TeacherDashboard keeps class selection, import, student detail, and AI assistant. Insert the classroom command center above the general student table when a class is selected. The first-screen order is summary, stage heatmap, bottleneck alerts, student queue. Do not add a score rank column.

- [ ] **Step 5: Add dense but readable teacher layout**

At 1366×768 use one 248-pixel alert rail and a flexible main region. Reuse the same surface, border, radius, focus, and state tokens as the student UI. Polling updates only changed content; do not replace the entire panel with skeletons after first load.

- [ ] **Step 6: Run tests, build, and teacher smoke**

Run: <code>cd prototype; npm test</code>

Expected: all tests pass.

Run: <code>cd prototype; npm run build</code>

Expected: build succeeds.

Run: <code>cd prototype; npm run qa:ui</code>

Expected: teacher empty/imported/detail states and student flows pass with no page errors.

- [ ] **Step 7: Commit the teacher experience**

~~~bash
git add prototype/src/components/classroom/teacher prototype/src/components/TeacherDashboard.jsx prototype/src/App.jsx prototype/src/classroom.css prototype/src/classroomSessionState.test.mjs
git commit -m "feat: add teacher classroom command center"
~~~

### Task 8: Classroom Playwright Flow and 150-Student Load Gate

**Files:**
- Create: prototype/scripts/verify-classroom.mjs
- Create: prototype/scripts/verify-classroom-load.mjs
- Modify: prototype/package.json

**Interfaces:**
- Consumes: completed API and UI slices.
- Produces: qa:classroom and qa:classroom-load release gates.

- [ ] **Step 1: Add package scripts that initially fail**

~~~json
"qa:classroom": "node scripts/run-browser-qa.mjs scripts/verify-classroom.mjs",
"qa:classroom-load": "node scripts/verify-classroom-load.mjs"
~~~

Run: <code>cd prototype; npm run qa:classroom</code>

Expected: FAIL because verify-classroom.mjs does not exist.

- [ ] **Step 2: Implement one-browser, two-context classroom flow**

Launch one headless Edge/Chromium process. Create teacher and student browser contexts. Use a temporary DATABASE_PATH through the existing browser-QA runner. Execute: teacher creates/imports/starts; student discovers/enters; student completes stage one; refresh resumes at stage two; duplicate request leaves XP unchanged; teacher pauses and student sees pause; teacher resumes; student completes remaining stages; teacher sees stage update within 15 seconds; teacher ends; student sees frozen settlement; no-WebGL context completes stage one static path. Collect pageerror from both pages and assert both arrays are empty.

- [ ] **Step 3: Capture fixed visual evidence**

Use viewport 1366×768 and save these exact files under <strong>`prototype/qa-artifacts/`</strong>（已在 `.gitignore` 中，不进入版本控制）：

- classroom-student-route.png
- classroom-student-workbench.png
- classroom-student-settlement.png
- classroom-teacher-command-center.png
- classroom-student-no-webgl.png

Assert <code>document.documentElement.scrollWidth === document.documentElement.clientWidth</code> on each state. Assert the main canvas bounding box is at least 720 pixels wide in the workbench screenshot.

- [ ] **Step 4: Implement the bounded API load script**

Create an in-process app with <code>:memory:</code> SQLite, seed one teacher, one class, 150 students, and one live session. Log in each student once, prepare unique clientSubmissionId values, then submit valid stage-one evidence with at most 30 concurrent promises. Record status and elapsed time for every response. Assert 150 success responses, zero 5xx, zero SQLITE_BUSY text, and P95 at or below 2,000 ms. Close server and database in finally.

- [ ] **Step 5: Run both new gates**

Run: <code>cd prototype; npm run qa:classroom</code>

Expected: classroom flow passes and writes five screenshots.

Run: <code>cd prototype; npm run qa:classroom-load</code>

Expected: 150/150 succeed, zero 5xx/SQLITE_BUSY, P95 ≤ 2000 ms.

- [ ] **Step 6: Commit classroom QA**

~~~bash
git add prototype/scripts/verify-classroom.mjs prototype/scripts/verify-classroom-load.mjs prototype/package.json
git commit -m "test: add classroom mission release gates"
~~~

### Task 9: Performance, Accessibility, and Regression Closure

**Files:**
- Modify: prototype/scripts/verify-ui.mjs
- Modify: prototype/scripts/verify-performance.mjs
- Modify: prototype/scripts/verify-3d.mjs
- Modify: prototype/scripts/verify-asset-budget.mjs
- Modify: prototype/src/classroom.css
- Modify: prototype/design-qa.md

**Interfaces:**
- Consumes: student and teacher UI from Tasks 6–7.
- Produces: measurable low-end, keyboard, reduced-motion, and visual acceptance evidence.

- [ ] **Step 1: Add failing layout and keyboard assertions**

In verify-ui.mjs set 1366×768 before student and teacher classroom captures. Assert no horizontal page overflow, no intersection between left/manual, canvas, and diagnostic bounding boxes, visible focus after keyboard navigation, and textual state labels for locked/active/completed/help states.

Run: <code>cd prototype; npm run qa:ui</code>

Expected: at least one new assertion fails before CSS correction.

- [ ] **Step 2: Add reduced-motion and low-performance coverage**

Create a context with reducedMotion: reduce. Assert no element matching classroom animated signal selectors has a non-zero infinite animation. Verify run, single-step, submit, grading, and settlement still work. In the performance script keep device scale factor 1 and assert no more than 12 visible moving signal elements.

- [ ] **Step 3: Preserve 3D regression gates**

Keep overview, automatic explosion, eight-step assembly, part selection, bus relationships, hardware builder, and no-WebGL fallback checks. Re-enter and leave 3D ten times and assert no increasing WebGL context, timer, listener, or unhandled error count.

- [ ] **Step 4: Enforce asset and bundle budgets**

The asset script rejects any new classroom decorative image above 300 KB and classroom first-screen image total above 1 MB. Build output must keep Three.js, React Flow, and teacher analytics out of the common entry. No new runtime dependency is allowed.

- [ ] **Step 5: Record source-versus-implementation review**

Update design-qa.md with the selected approved direction, the five classroom screenshots, viewport, visible differences, corrections made, and the final pass. Do not place audit screenshots or QA artifacts in Git.

- [ ] **Step 6: Run the complete visual and performance matrix**

Run:

~~~bash
cd prototype
npm run qa:assets
npm run build
npm run qa:ui
npm run qa:3d
npm run qa:performance
npm run qa:classroom
npm run qa:classroom-load
~~~

Expected: every command exits 0; no in-app browser is opened.

- [ ] **Step 7: Commit quality closure**

~~~bash
git add prototype/scripts/verify-ui.mjs prototype/scripts/verify-performance.mjs prototype/scripts/verify-3d.mjs prototype/scripts/verify-asset-budget.mjs prototype/src/classroom.css prototype/design-qa.md
git commit -m "test: close classroom visual and performance gates"
~~~

### Task 10: Deployment Guidance and Final Verification

**Files:**
- Modify: docs/classroom-deployment.md
- Modify: prototype/AGENTS.md

**Interfaces:**
- Produces: operator guidance and a clean, verified branch ready for review.

- [ ] **Step 1: Document classroom operations**

Document the fixed mission package, 15-second polling, 150-student gate, temporary-database QA requirement, backup before migration, session pause/end behavior, no-background-job expiry rule, rollback procedure, and how to recognize SESSION_PAUSED, SESSION_ENDED, SQLITE_BUSY, and stale-dashboard states.

- [ ] **Step 2: Record durable prototype rules**

Keep standalone Playwright, one Chromium/one worker, 1366×768 low-end target, equal student/teacher priority, approved game-reference matrix, no copyrighted game assets, and latest-spec-wins rules in AGENTS.md.

- [ ] **Step 3: Run the final release matrix from a clean process**

Run:

~~~bash
cd prototype
npm test
npm run qa:assets
npm run build
npm run qa:ui
npm run qa:3d
npm run qa:performance
npm run qa:classroom
npm run qa:classroom-load
git diff --check
~~~

Expected: every command exits 0. npm test reports zero failures; all browser scripts report zero page errors; load QA reports 150/150, zero 5xx, zero SQLITE_BUSY, and P95 ≤ 2000 ms.

- [ ] **Step 4: Inspect repository state**

Run: <code>git status --short</code>

Expected: only the deployment and AGENTS documentation changes remain before the final commit; QA artifacts, temporary databases, browser profiles, and screenshots are absent.

- [ ] **Step 5: Commit operations documentation**

~~~bash
git add docs/classroom-deployment.md prototype/AGENTS.md
git commit -m "docs: add classroom mission operations guide"
~~~

- [ ] **Step 6: Confirm clean handoff**

Run: <code>git status --short</code>

Expected: no output.

