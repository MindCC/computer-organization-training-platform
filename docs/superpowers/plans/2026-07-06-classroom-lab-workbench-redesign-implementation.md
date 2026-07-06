# Classroom Lab Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current classroom prototype into a cleaner classroom lab workbench with a student route map, teacher-only dashboard, settings-based student import, realtime lab diagnostics, and demo-ready classroom data.

**Architecture:** Keep the current React/Vite/Express/SQLite architecture. Split new presentation and teaching metadata into focused modules while leaving existing validation, React Flow, API, and persistence boundaries intact. Implement the redesign in increments so each step remains usable in class.

**Tech Stack:** React, Vite, Phosphor Icons, React Flow via existing `CircuitFlowCanvas`, Node/Express, better-sqlite3, Node test runner, Playwright smoke script.

## Global Constraints

- Preserve current backend APIs and database tables unless a task explicitly adds a script-only seed path.
- Do not copy full CircuitVerse, MakeCode, CREATOR, or Open edX behavior; borrow only interaction patterns that fit the classroom workflow.
- Student import, CSV template, and export actions belong in teacher settings, not teacher dashboard home.
- Student first screen is a usable route map, not a marketing/hero page.
- Teacher first screen is a data dashboard, not an import/setup page.
- Reuse current validation and simulation modules for realtime diagnostics; do not create a second judging rule set.
- Keep current React Flow workbench and hardware game logic working.
- Use Phosphor Icons already installed in the project.
- Verification commands: `npm.cmd test`, `npm.cmd run build`, `node scripts/verify-ui.mjs`.

---

## File Structure

- Create `prototype/src/courseRoute.js`
  - Owns route map grouping, chapter labels, status aggregation helpers, and compact route-card metadata.
- Create `prototype/src/courseRoute.test.mjs`
  - Covers grouping and next-recommendation behavior.
- Create `prototype/src/realtimeDiagnostics.js`
  - Owns realtime diagnostic summaries derived from `getCircuitChallenge`, `gradeConnections`, and `simulateChallenge`.
- Create `prototype/src/realtimeDiagnostics.test.mjs`
  - Covers pass/fail test rows and structural issue summaries.
- Create `prototype/server/seedDemoClassroom.js`
  - Script-only demo data generator using existing DB helpers.
- Create or extend `prototype/server/demoData.test.mjs`
  - Verifies generated classes, students, progress, attempts, and teacher overview compatibility.
- Modify `prototype/package.json`
  - Adds `seed:demo`.
- Modify `prototype/src/App.jsx`
  - Wires route map, teacher dashboard/settings split, realtime diagnostics panel, and empty-state actions.
- Modify `prototype/src/styles.css`
  - Adds classroom workbench visual system, route map, compact teacher dashboard, and settings layout.
- Modify `prototype/scripts/verify-ui.mjs`
  - Extends smoke coverage for route map, teacher settings import placement, and realtime diagnostics.

---

### Task 1: Course Route Metadata And Recommendation Helpers

**Files:**
- Create: `prototype/src/courseRoute.js`
- Create: `prototype/src/courseRoute.test.mjs`
- Modify: `prototype/package.json` only if test glob does not already include `src/*.test.mjs`

**Interfaces:**
- Consumes: `CHALLENGES`, `LEARNING_ITEMS`, current progress shape from `platformLogic.js`.
- Produces:
  - `COURSE_ROUTE_GROUPS: Array<{ id: string, title: string, description: string, challengeIds: string[] }>`
  - `buildCourseRouteGroups(challenges, progress): Array<{ id, title, description, items }>`
  - `findNextRecommendedChallenge(challenges, progress): { id: string, title: string } | null`

- [ ] **Step 1: Write failing tests**

Create `prototype/src/courseRoute.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES, buildInitialLearningProgress } from "./platformLogic.js";
import { buildCourseRouteGroups, findNextRecommendedChallenge } from "./courseRoute.js";

test("course route groups every challenge exactly once", () => {
  const progress = buildInitialLearningProgress();
  const groups = buildCourseRouteGroups(CHALLENGES, progress);
  const groupedIds = groups.flatMap((group) => group.items.map((item) => item.id));

  assert.deepEqual([...new Set(groupedIds)].sort(), CHALLENGES.map((item) => item.id).sort());
  assert.ok(groups.some((group) => group.id === "overview"));
  assert.ok(groups.some((group) => group.id === "logic"));
  assert.ok(groups.some((group) => group.id === "storage"));
});

test("course route recommends the first in-progress or unlocked challenge", () => {
  const progress = buildInitialLearningProgress();
  progress["computer-components"].status = "completed";
  progress["program-flow"].status = "in-progress";

  const next = findNextRecommendedChallenge(CHALLENGES, progress);

  assert.equal(next.id, "program-flow");
  assert.equal(next.title, "程序运行流程");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/courseRoute.test.mjs` from `prototype`.

Expected: FAIL with module-not-found for `./courseRoute.js`.

- [ ] **Step 3: Implement `courseRoute.js`**

Create `prototype/src/courseRoute.js`:

```js
const ROUTE_GROUP_DEFINITIONS = [
  {
    id: "overview",
    title: "第一章 计算机概述",
    description: "先建立整机、程序、指令与数据流的整体图景。",
    challengeIds: ["computer-components", "program-flow", "instruction-data"],
  },
  {
    id: "logic",
    title: "基础逻辑门",
    description: "用与、或、非、异或理解二进制信号如何形成判断。",
    challengeIds: ["data-flow", "and-gate", "or-gate", "not-gate", "xor-gate"],
  },
  {
    id: "adder",
    title: "加法器与 ALU",
    description: "从半加器、全加器到多位加法和最小运算核心。",
    challengeIds: ["half-adder", "full-adder", "machine-number", "multi-adder", "mux", "alu"],
  },
  {
    id: "storage",
    title: "存储系统",
    description: "观察地址、主存、MDR 和数据总线之间的协作。",
    challengeIds: ["memory-address"],
  },
  {
    id: "hardware",
    title: "硬件配置挑战",
    description: "在预算、速度、容量之间做真实取舍。",
    challengeIds: [
      "game-office-pc",
      "game-student-laptop",
      "game-lab-workstation",
      "game-storage-upgrade",
      "game-video-editing",
      "game-database-server",
    ],
  },
];

export const COURSE_ROUTE_GROUPS = ROUTE_GROUP_DEFINITIONS;

export function buildCourseRouteGroups(challenges, progress = {}) {
  const challengeMap = new Map(challenges.map((challenge) => [challenge.id, challenge]));

  return COURSE_ROUTE_GROUPS.map((group) => ({
    ...group,
    items: group.challengeIds
      .map((id) => {
        const challenge = challengeMap.get(id);
        const record = progress[id] ?? {};
        return {
          id,
          title: challenge?.title ?? hardwareGameTitle(id),
          description: challenge?.objective ?? group.description,
          status: record.status ?? "not-started",
          bestScore: record.bestScore ?? 0,
          attempts: record.attempts ?? 0,
          estimatedMinutes: challenge?.estimatedMinutes ?? 8,
        };
      }),
  }));
}

export function findNextRecommendedChallenge(challenges, progress = {}) {
  const orderedIds = COURSE_ROUTE_GROUPS.flatMap((group) => group.challengeIds);
  const challengeMap = new Map(challenges.map((challenge) => [challenge.id, challenge]));

  for (const id of orderedIds) {
    const record = progress[id] ?? {};
    if (record.status === "in-progress") {
      return challengeMap.get(id) ?? { id, title: hardwareGameTitle(id) };
    }
  }

  for (const id of orderedIds) {
    const record = progress[id] ?? {};
    if (record.status !== "completed") {
      return challengeMap.get(id) ?? { id, title: hardwareGameTitle(id) };
    }
  }

  return null;
}

function hardwareGameTitle(id) {
  return {
    "game-office-pc": "办公电脑",
    "game-student-laptop": "学生笔记本",
    "game-lab-workstation": "实验室工作站",
    "game-storage-upgrade": "存储升级",
    "game-video-editing": "视频剪辑电脑",
    "game-database-server": "数据库服务器",
  }[id] ?? id;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test src/courseRoute.test.mjs`.

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add prototype/src/courseRoute.js prototype/src/courseRoute.test.mjs
git commit -m "Add course route helpers"
```

---

### Task 2: Student Route Map Home

**Files:**
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Test: `prototype/scripts/verify-ui.mjs`

**Interfaces:**
- Consumes: `buildCourseRouteGroups`, `findNextRecommendedChallenge`.
- Produces: Student home route map with chapter grouping and direct navigation.

- [ ] **Step 1: Add route map smoke expectations**

Modify `prototype/scripts/verify-ui.mjs` so the student smoke checks the home page after login:

```js
await expect(page.getByText("课程路线地图")).toBeVisible();
await expect(page.getByText("第一章 计算机概述")).toBeVisible();
await expect(page.getByText("基础逻辑门")).toBeVisible();
await expect(page.getByText("下一步建议")).toBeVisible();
```

Expected after running now: FAIL because the current home page does not expose this route-map copy.

- [ ] **Step 2: Import route helpers**

In `prototype/src/App.jsx`, add:

```js
import { buildCourseRouteGroups, findNextRecommendedChallenge } from "./courseRoute.js";
```

Add memoized values near the existing `summary` and `focusChallenge` memos:

```js
const routeGroups = useMemo(() => buildCourseRouteGroups(CHALLENGES, progress), [progress]);
const nextRecommendedChallenge = useMemo(
  () => findNextRecommendedChallenge(CHALLENGES, progress),
  [progress],
);
```

- [ ] **Step 3: Replace student home main content with route map**

In `renderHome`, keep the existing top-level auth/navigation shell. Replace the large marketing-style hero body with:

```jsx
<section className="route-map-page">
  <header className="route-map-header">
    <div>
      <span className="eyebrow">今日学习</span>
      <h1>课程路线地图</h1>
      <p>按课堂顺序完成概述、逻辑门、加法器、存储系统和硬件配置挑战。</p>
    </div>
    <div className="next-step-card">
      <span>下一步建议</span>
      <strong>{nextRecommendedChallenge?.title ?? "全部完成"}</strong>
      <button
        className="primary-button"
        onClick={() => {
          if (!nextRecommendedChallenge) return;
          if (nextRecommendedChallenge.id.startsWith("game-")) {
            setSelectedHardwareCaseId(nextRecommendedChallenge.id);
            changeView("hardware-game");
            return;
          }
          setSelectedChallengeId(nextRecommendedChallenge.id);
          changeView("lab");
        }}
        type="button"
      >
        进入实验
      </button>
    </div>
  </header>

  <div className="route-map-layout">
    <div className="route-map-groups">
      {routeGroups.map((group) => (
        <section className="route-map-group" key={group.id}>
          <div className="route-map-group-heading">
            <div>
              <h2>{group.title}</h2>
              <p>{group.description}</p>
            </div>
            <span>{group.items.filter((item) => item.status === "completed").length}/{group.items.length}</span>
          </div>
          <div className="route-map-cards">
            {group.items.map((item) => (
              <button
                className={`route-card ${item.status}`}
                key={item.id}
                onClick={() => {
                  if (item.id.startsWith("game-")) {
                    setSelectedHardwareCaseId(item.id);
                    changeView("hardware-game");
                    return;
                  }
                  setSelectedChallengeId(item.id);
                  changeView("lab");
                }}
                type="button"
              >
                <strong>{item.title}</strong>
                <small>{item.description}</small>
                <span>{item.bestScore}/100 · {item.attempts} 次 · {item.estimatedMinutes} 分钟</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>

    <aside className="route-map-aside">
      <section>
        <strong>学习状态</strong>
        <p>完成率 {summary.completionRate}% · 平均分 {summary.averageScore}</p>
      </section>
      <section>
        <strong>建议复习</strong>
        <p>{summary.weakSpot}</p>
      </section>
      <section>
        <strong>最近笔记</strong>
        <p>{notes[0]?.content ?? "完成一次实验后可以记录复盘。"}</p>
      </section>
    </aside>
  </div>
</section>
```

- [ ] **Step 4: Add route map styles**

Append focused styles to `prototype/src/styles.css`:

```css
.route-map-page {
  display: grid;
  gap: 18px;
}

.route-map-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 18px;
  align-items: stretch;
}

.route-map-header h1 {
  margin: 8px 0;
  font-size: clamp(2rem, 4vw, 3.1rem);
  line-height: 1;
}

.route-map-header p,
.route-map-group-heading p,
.route-card small,
.route-map-aside p {
  color: var(--muted);
}

.next-step-card,
.route-map-group,
.route-map-aside section {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--shadow-soft);
}

.next-step-card {
  display: grid;
  gap: 10px;
  padding: 18px;
}

.route-map-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 18px;
  align-items: start;
}

.route-map-groups {
  display: grid;
  gap: 14px;
}

.route-map-group {
  padding: 18px;
}

.route-map-group-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.route-map-group-heading h2 {
  margin: 0 0 4px;
}

.route-map-group-heading span {
  min-width: 54px;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--teal-soft);
  color: var(--teal);
  font-weight: 800;
  text-align: center;
}

.route-map-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.route-card {
  display: grid;
  gap: 7px;
  min-height: 128px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.route-card.completed {
  border-color: rgba(43, 169, 142, 0.32);
  background: rgba(229, 247, 241, 0.72);
}

.route-card.in-progress {
  border-color: rgba(40, 109, 232, 0.32);
  background: rgba(238, 245, 247, 0.9);
}

.route-card span {
  align-self: end;
  color: var(--navy);
  font-size: 0.82rem;
  font-weight: 800;
}

.route-map-aside {
  display: grid;
  gap: 12px;
}

.route-map-aside section {
  padding: 16px;
}

@media (max-width: 1100px) {
  .route-map-header,
  .route-map-layout {
    grid-template-columns: 1fr;
  }

  .route-map-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .route-map-cards {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run smoke and tests**

Run:

```bash
npm.cmd test
npm.cmd run build
node scripts/verify-ui.mjs
```

Expected: all pass. If `verify-ui.mjs` needs selector updates for the new home, update selectors only for changed UI copy.

- [ ] **Step 6: Commit**

```bash
git add prototype/src/App.jsx prototype/src/styles.css prototype/scripts/verify-ui.mjs
git commit -m "Redesign student route map home"
```

---

### Task 3: Teacher Dashboard Home And Settings Split

**Files:**
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `prototype/scripts/verify-ui.mjs`

**Interfaces:**
- Consumes: existing `classOverview`, `teacherClasses`, `selectedTeacherClassId`, `csvImportText`, import/export handlers.
- Produces:
  - Teacher dashboard home without CSV import form.
  - Teacher settings modal/page section that owns CSV template, import, export, and setup instructions.

- [ ] **Step 1: Add smoke expectations**

In `prototype/scripts/verify-ui.mjs`, after teacher login and navigation to teacher dashboard:

```js
await expect(page.getByText("班级学情管理")).toBeVisible();
await expect(page.getByText("学生导入")).not.toBeVisible();
await page.getByRole("button", { name: "课堂设置" }).click();
await expect(page.getByText("学生导入")).toBeVisible();
await expect(page.getByText("下载学生导入模板")).toBeVisible();
```

Expected before implementation: FAIL if import still appears on dashboard or settings copy is missing.

- [ ] **Step 2: Move dashboard empty state to action-first card**

In `renderTeacherStudioDashboard`, keep summary metrics and student table. Replace empty `students.length === 0` copy with:

```jsx
{students.length === 0 ? (
  <div className="teacher-empty-action">
    <strong>还没有学生数据</strong>
    <p>请先到课堂设置导入学生，或使用演示数据检查看板效果。</p>
    <button className="primary-button" onClick={() => setShowSettings(true)} type="button">
      打开课堂设置
    </button>
  </div>
) : null}
```

- [ ] **Step 3: Ensure settings owns import/export**

In the settings modal section for teachers, make the import area the only CSV input surface:

```jsx
{auth.user?.role === "teacher" ? (
  <section className="settings-block teacher-import-settings">
    <div>
      <span className="eyebrow">学生导入</span>
      <h3>{selectedClass?.name ?? "请先创建或选择班级"}</h3>
      <p>CSV 列顺序固定为：学号、姓名、初始密码。导入会新增学生或更新同学号学生信息。</p>
    </div>
    <a className="ghost-button" download="student-import-template.csv" href={studentImportTemplateHref}>
      下载学生导入模板
    </a>
    <textarea
      aria-label="学生导入 CSV"
      value={csvImportText}
      onChange={(event) => setCsvImportText(event.target.value)}
      placeholder="学号,姓名,初始密码"
    />
    <button className="primary-button" disabled={!selectedTeacherClassId} onClick={importStudentsToClass} type="button">
      导入学生
    </button>
  </section>
) : null}
```

Keep export in settings:

```jsx
{selectedTeacherClassId ? (
  <a className="ghost-button" href={`/api/teacher/classes/${selectedTeacherClassId}/export.csv`}>
    导出当前班级 CSV
  </a>
) : (
  <p className="empty-state">请选择班级后再导出。</p>
)}
```

- [ ] **Step 4: Add teacher dashboard/settings styles**

Add:

```css
.teacher-empty-action {
  display: grid;
  gap: 10px;
  padding: 18px;
  border: 1px dashed rgba(40, 109, 232, 0.34);
  border-radius: var(--radius-md);
  background: rgba(238, 245, 247, 0.72);
}

.teacher-empty-action p {
  margin: 0;
  color: var(--muted);
}

.teacher-import-settings textarea {
  min-height: 150px;
  resize: vertical;
}
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm.cmd test
npm.cmd run build
node scripts/verify-ui.mjs
```

Expected: all pass; teacher dashboard smoke confirms import moved to settings.

- [ ] **Step 6: Commit**

```bash
git add prototype/src/App.jsx prototype/src/styles.css prototype/scripts/verify-ui.mjs
git commit -m "Move teacher import workflow to settings"
```

---

### Task 4: Realtime Lab Diagnostics Panel

**Files:**
- Create: `prototype/src/realtimeDiagnostics.js`
- Create: `prototype/src/realtimeDiagnostics.test.mjs`
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `prototype/scripts/verify-ui.mjs`

**Interfaces:**
- Consumes:
  - `getCircuitChallenge(challengeId)`
  - `connections`
  - `inputState`
  - `simulateChallenge(challengeId, inputState)`
  - current `feedback`
- Produces:
  - `buildRealtimeDiagnostics({ challengeId, connections, inputState, feedback }): { status, summary, testRows, issues }`

- [ ] **Step 1: Write failing tests**

Create `prototype/src/realtimeDiagnostics.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildRealtimeDiagnostics } from "./realtimeDiagnostics.js";

test("realtime diagnostics reports waiting state before connections", () => {
  const result = buildRealtimeDiagnostics({
    challengeId: "and-gate",
    connections: [],
    inputState: { a: 1, b: 1 },
    feedback: null,
  });

  assert.equal(result.status, "needs-work");
  assert.equal(result.testRows.length > 0, true);
  assert.ok(result.issues.some((item) => item.type === "结构缺失"));
});

test("realtime diagnostics exposes current output for a logic gate", () => {
  const result = buildRealtimeDiagnostics({
    challengeId: "and-gate",
    connections: ["输入A->与门", "输入B->与门", "与门->输出Y"],
    inputState: { a: 1, b: 1 },
    feedback: { passed: true, errors: [] },
  });

  assert.equal(result.status, "passed");
  assert.ok(result.testRows.some((row) => row.label.includes("当前输出")));
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test src/realtimeDiagnostics.test.mjs`.

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement diagnostics helper**

Create `prototype/src/realtimeDiagnostics.js`:

```js
import { getCircuitChallenge } from "./circuit/challengeCircuitModel.js";
import { gradeConnections, simulateChallenge } from "./platformLogic.js";

export function buildRealtimeDiagnostics({ challengeId, connections = [], inputState = {}, feedback = null }) {
  const circuitModel = getCircuitChallenge(challengeId);
  const simulation = simulateChallenge(challengeId, inputState);
  const structural = circuitModel
    ? gradeConnections(challengeId, connections)
    : { passed: Boolean(feedback?.passed), errors: feedback?.errors ?? [] };
  const errors = feedback?.errors?.length ? feedback.errors : structural.errors ?? [];
  const status = structural.passed || feedback?.passed ? "passed" : "needs-work";

  return {
    status,
    summary: status === "passed" ? "当前结构满足本关目标。" : "当前结构仍需调整，请先检查缺失连接和端口方向。",
    testRows: buildTestRows(simulation),
    issues: errors.length
      ? errors.map((error) => ({
        type: error.type ?? "结构缺失",
        message: error.message ?? String(error),
      }))
      : status === "passed"
        ? []
        : [{ type: "结构缺失", message: "请先完成本关必要连接。" }],
  };
}

function buildTestRows(simulation) {
  if (!simulation?.outputs) {
    return [{ label: "当前输出", expected: "等待输入", actual: "未知", passed: false }];
  }

  return Object.entries(simulation.outputs).map(([key, value]) => ({
    label: `当前输出 ${key}`,
    expected: "随输入变化",
    actual: String(value),
    passed: value !== "unknown",
  }));
}
```

- [ ] **Step 4: Add panel to lab inspector**

In `prototype/src/App.jsx`, import:

```js
import { buildRealtimeDiagnostics } from "./realtimeDiagnostics.js";
```

Add memo:

```js
const realtimeDiagnostics = useMemo(
  () => buildRealtimeDiagnostics({
    challengeId: currentChallenge.id,
    connections,
    inputState,
    feedback,
  }),
  [currentChallenge.id, connections, inputState, feedback],
);
```

Inside `.lab-studio-inspector`, add:

```jsx
<section className={`realtime-diagnostics ${realtimeDiagnostics.status}`}>
  <strong>实时数据流检测</strong>
  <p>{realtimeDiagnostics.summary}</p>
  <div className="diagnostic-test-list">
    {realtimeDiagnostics.testRows.map((row) => (
      <div className={row.passed ? "passed" : "needs-work"} key={row.label}>
        <span>{row.label}</span>
        <small>实际：{row.actual}</small>
      </div>
    ))}
  </div>
  {realtimeDiagnostics.issues.length ? (
    <div className="diagnostic-issues">
      {realtimeDiagnostics.issues.slice(0, 3).map((issue) => (
        <span key={`${issue.type}-${issue.message}`}>{issue.type}</span>
      ))}
    </div>
  ) : null}
</section>
```

- [ ] **Step 5: Add panel styles**

```css
.realtime-diagnostics {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.86);
}

.realtime-diagnostics.passed {
  border-color: rgba(43, 169, 142, 0.28);
  background: rgba(229, 247, 241, 0.72);
}

.diagnostic-test-list {
  display: grid;
  gap: 8px;
}

.diagnostic-test-list div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(238, 245, 247, 0.86);
}

.diagnostic-issues {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.diagnostic-issues span {
  padding: 5px 8px;
  border-radius: 999px;
  color: var(--danger);
  background: var(--danger-soft);
  font-size: 0.78rem;
  font-weight: 800;
}
```

- [ ] **Step 6: Extend UI smoke**

In `verify-ui.mjs`, when entering at least one lab, assert:

```js
await expect(page.getByText("实时数据流检测")).toBeVisible();
await expect(page.getByText(/当前输出/)).toBeVisible();
```

- [ ] **Step 7: Verify**

Run:

```bash
npm.cmd test
npm.cmd run build
node scripts/verify-ui.mjs
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add prototype/src/realtimeDiagnostics.js prototype/src/realtimeDiagnostics.test.mjs prototype/src/App.jsx prototype/src/styles.css prototype/scripts/verify-ui.mjs
git commit -m "Add realtime lab diagnostics"
```

---

### Task 5: Demo Classroom Data And First-Use Entry Point

**Files:**
- Create: `prototype/server/seedDemoClassroom.js`
- Create: `prototype/server/demoData.test.mjs`
- Modify: `prototype/package.json`
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `docs/classroom-deployment.md`

**Interfaces:**
- Consumes: existing DB connection/migration helpers and teacher overview logic.
- Produces:
  - `npm run seed:demo`
  - Teacher settings entry explaining demo data.
  - Demo data compatible with teacher dashboard and export.

- [ ] **Step 1: Write demo data test**

Create `prototype/server/demoData.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrateDatabase } from "./migrate.js";
import { seedDemoClassroom } from "./seedDemoClassroom.js";
import { createApp } from "./app.js";

test("demo classroom seed creates classes, students, attempts, and dashboard data", async () => {
  const dir = mkdtempSync(join(tmpdir(), "demo-classroom-"));
  const databasePath = join(dir, "classroom.sqlite");
  migrateDatabase(databasePath);
  const result = seedDemoClassroom({ databasePath, teacherUsername: "demo.teacher" });

  assert.equal(result.classesCreated, 2);
  assert.equal(result.studentsCreated >= 30, true);
  assert.equal(result.attemptsCreated > 0, true);

  const app = createApp({ databasePath });
  assert.equal(typeof app, "function");
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test server/demoData.test.mjs`.

Expected: FAIL with module-not-found for `seedDemoClassroom.js`.

- [ ] **Step 3: Implement script**

Create `prototype/server/seedDemoClassroom.js` using existing database helpers. If helper names differ, import from the actual server modules but keep this exported interface:

```js
export function seedDemoClassroom({ databasePath, teacherUsername = "teacher" }) {
  // Open DB, find or create teacher, create two classes, create 30-50 students,
  // insert challenge_attempts and student_progress rows for mixed outcomes.
  // Return counts: { classesCreated, studentsCreated, attemptsCreated }.
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const databasePath = process.env.DATABASE_PATH ?? "data/classroom.sqlite";
  const teacherUsername = process.env.TEACHER_USERNAME ?? "teacher";
  const result = seedDemoClassroom({ databasePath, teacherUsername });
  console.log(`Demo classroom ready: ${JSON.stringify(result)}`);
}
```

Implementation requirements:
- Use deterministic student usernames: `demo2026001` to `demo2026050`.
- Use default student password `Student123!`.
- Generate attempts across at least:
  - `and-gate`
  - `xor-gate`
  - `half-adder`
  - `full-adder`
  - `memory-address`
  - `game-office-pc`
  - `game-storage-upgrade`
- Generate both passed and failed attempts.
- Upsert behavior must be idempotent: running twice does not duplicate users.

- [ ] **Step 4: Add package script**

In `prototype/package.json`:

```json
"seed:demo": "node server/seedDemoClassroom.js"
```

- [ ] **Step 5: Add first-use settings entry**

In teacher settings area in `App.jsx`, add a first-use block:

```jsx
<section className="settings-block first-use-guide">
  <div>
    <span className="eyebrow">课堂首用</span>
    <h3>第一次上课建议按这 4 步走</h3>
  </div>
  <ol>
    <li>创建或选择班级。</li>
    <li>下载 CSV 模板并导入学生。</li>
    <li>用一个学生账号完成一次实验提交。</li>
    <li>回到教师看板查看完成率、高频错误和 AI 助教建议。</li>
  </ol>
  <p>演示环境可运行 npm run seed:demo 生成课堂样例数据。</p>
</section>
```

- [ ] **Step 6: Add styles**

```css
.first-use-guide ol {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 20px;
}

.first-use-guide li {
  color: var(--ink);
  line-height: 1.5;
}
```

- [ ] **Step 7: Update deployment docs**

In `docs/classroom-deployment.md`, add a demo section:

```md
## 演示数据

演示或验收环境可以运行：

```bash
npm run seed:demo
```

该脚本会生成演示班级、学生、实验提交和硬件配置挑战记录。生产课堂不需要运行该脚本；真实班级请使用教师设置里的 CSV 导入。
```
```

- [ ] **Step 8: Verify**

Run:

```bash
npm.cmd run seed:demo
npm.cmd test
npm.cmd run build
node scripts/verify-ui.mjs
```

Expected:
- `seed:demo` prints counts.
- Tests pass.
- Build passes.
- Smoke passes and teacher dashboard has non-empty demo stats when using demo DB.

- [ ] **Step 9: Commit**

```bash
git add prototype/server/seedDemoClassroom.js prototype/server/demoData.test.mjs prototype/package.json prototype/src/App.jsx prototype/src/styles.css docs/classroom-deployment.md
git commit -m "Add demo classroom first-use flow"
```

---

## Final Verification

- [ ] Run complete test suite:

```bash
cd prototype
npm.cmd test
```

Expected: all tests pass.

- [ ] Run production build:

```bash
cd prototype
npm.cmd run build
```

Expected: Vite build succeeds.

- [ ] Run UI smoke:

```bash
cd prototype
node scripts/verify-ui.mjs
```

Expected: UI smoke check passed.

- [ ] Manual classroom script:

1. Log in as teacher.
2. Confirm dashboard first screen shows metrics and no CSV import textarea.
3. Open classroom settings.
4. Confirm CSV template, import box, export link, and first-use guide are visible.
5. Log in as student.
6. Confirm route map is the first screen.
7. Enter a logic-gate lab.
8. Confirm realtime diagnostics are visible.
9. Submit a lab and confirm teacher dashboard updates.
10. Open hardware challenge and confirm scoring still works.

Expected: no console errors, no mojibake on the touched screens, no overlapping text at 1366x768 and mobile width.

## Plan Self-Review

- Spec coverage:
  - Student route map: Task 1 and Task 2.
  - Teacher dashboard/settings split: Task 3.
  - Realtime data-flow diagnostics: Task 4.
  - Demo data and first-use flow: Task 5.
  - Hardware challenge remains covered by existing page and smoke; no new rewrite needed in this plan.
- Placeholder scan:
  - No placeholder markers or unspecified task steps.
- Type consistency:
  - `buildCourseRouteGroups`, `findNextRecommendedChallenge`, and `buildRealtimeDiagnostics` signatures are defined before use.
  - `seedDemoClassroom` return counts are defined before tests consume them.
