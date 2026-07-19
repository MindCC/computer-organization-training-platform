# Quest Learning Map Platform Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the isolated login card and unclear first-entry dashboards with a role-guided engineering-adventure experience built around a shared quest map, actionable missions, teacher interventions, and purposeful GSAP motion.

**Architecture:** Keep authentication, classroom, assignment, progress, and submission APIs unchanged. Derive student and teacher quest view models through pure functions, render them through focused React components, and isolate GSAP setup behind motion hooks that respect reduced-motion preferences and clean up on unmount.

**Tech Stack:** React 19, Vite 6, Node test runner, Playwright, Phosphor Icons, GSAP, `@gsap/react`, existing Express/SQLite APIs.

## Global Constraints

- Primary acceptance viewport: 1366 x 768; mobile acceptance viewport: 390 x 844.
- Minimum interactive target: 40 px desktop and 44 px mobile.
- Preserve the existing authentication payload `{ username, password }` and all classroom lifecycle/API contracts.
- Use the selected "Quest Learning Map" direction: professional engineering adventure, not childish fantasy or neon cyberpunk.
- Use deep aubergine/charcoal navigation, light violet/parchment work surfaces, amber primary actions, teal verified success, and red only for actionable errors.
- Do not add points economy, currency, store, leaderboard, avatar system, or social competition.
- Do not copy EduCoder, Lanqiao, or game assets.
- GSAP motion must explain state, prefer transform/opacity, clean up on unmount, and respect `prefers-reduced-motion`.
- Core navigation, route selection, laboratory controls, and submission must work without GSAP or WebGL.
- Preserve unrelated and pre-existing worktree changes; never reset or overwrite them blindly.

---

## File structure

**Create**

- `prototype/src/questExperience.js` — pure student quest, role-entry, settlement, and first-use derivation.
- `prototype/src/questExperience.test.mjs` — unit coverage for student quest and role-entry models.
- `prototype/src/teacherQuest.js` — pure teacher route aggregation, setup checklist, and intervention grouping.
- `prototype/src/teacherQuest.test.mjs` — unit coverage for teacher quest derivation.
- `prototype/src/motion/questMotion.js` — pure reduced-motion-safe animation configuration.
- `prototype/src/motion/questMotion.test.mjs` — animation policy tests without a browser.
- `prototype/src/motion/useQuestMotion.js` — scoped React/GSAP hooks and lifecycle cleanup.
- `prototype/src/components/auth/LoginPortal.jsx` — role-guided login screen.
- `prototype/src/components/quest/QuestMap.jsx` — shared student route visualization.
- `prototype/src/components/quest/CurrentQuestPanel.jsx` — single dominant student action.
- `prototype/src/components/quest/FirstUseGuide.jsx` — skippable, persisted presentational guide.
- `prototype/src/components/quest/QuestSettlement.jsx` — non-blocking pass and unlock feedback.
- `prototype/src/components/teacher/TeacherQuestOverview.jsx` — cohort route visualization.
- `prototype/src/components/teacher/TeacherSetupChecklist.jsx` — persistent first-class setup path.
- `prototype/src/components/teacher/InterventionGroups.jsx` — actionable blocker groups.

**Modify**

- `prototype/package.json` and `prototype/package-lock.json` — add `gsap` and `@gsap/react`.
- `prototype/src/App.jsx` — integrate login portal, route view models, settlement state, and role-specific quest surfaces.
- `prototype/src/components/StudentHome.jsx` — replace card-wall route UI with quest composition.
- `prototype/src/components/TeacherDashboard.jsx` — place quest overview and interventions above supporting reports while preserving current behavior.
- `prototype/src/styles.css` — add the selected visual tokens, layouts, focus states, motion fallbacks, and responsive reflow.
- `prototype/scripts/verify-ui.mjs` — verify login guidance, student route, teacher setup/interventions, mobile layout, and reduced-motion behavior.
- `prototype/AGENTS.md` — record the approved Quest Learning Map direction without staging unrelated existing edits unless explicitly reviewed.

---

### Task 1: GSAP dependency and motion policy

**Files:**
- Modify: `prototype/package.json`
- Modify: `prototype/package-lock.json`
- Create: `prototype/src/motion/questMotion.js`
- Create: `prototype/src/motion/questMotion.test.mjs`
- Create: `prototype/src/motion/useQuestMotion.js`

**Interfaces:**
- Produces: `motionPolicy(reducedMotion)`, `questEntrance(reducedMotion)`, `questUnlock(reducedMotion)`, and `useQuestMotion(scopeRef, animationFactory, dependencies)`.
- Consumes: browser `prefers-reduced-motion`, GSAP core, and `@gsap/react`.

- [ ] **Step 1: Write the failing motion policy tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { motionPolicy, questEntrance, questUnlock } from "./questMotion.js";

test("reduced motion removes travel and scale", () => {
  assert.deepEqual(motionPolicy(true), { enabled: false, duration: 0.01 });
  assert.deepEqual(questEntrance(true), { autoAlpha: 1, x: 0, y: 0, duration: 0.01 });
  assert.deepEqual(questUnlock(true), { autoAlpha: 1, scale: 1, duration: 0.01 });
});

test("default motion uses transform and opacity only", () => {
  assert.deepEqual(motionPolicy(false), { enabled: true, duration: 0.55 });
  assert.deepEqual(questEntrance(false), { autoAlpha: 0, y: 18, duration: 0.55, ease: "power2.out" });
  assert.deepEqual(questUnlock(false), { autoAlpha: 0, scale: 0.9, duration: 0.5, ease: "back.out(1.4)" });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd prototype; node --test src/motion/questMotion.test.mjs`

Expected: FAIL because `src/motion/questMotion.js` does not exist.

- [ ] **Step 3: Install the runtime packages**

Run: `cd prototype; npm install gsap @gsap/react`

Expected: `package.json` and `package-lock.json` contain both dependencies and npm exits 0.

- [ ] **Step 4: Implement the pure motion policy**

```js
export function motionPolicy(reducedMotion) {
  return reducedMotion
    ? { enabled: false, duration: 0.01 }
    : { enabled: true, duration: 0.55 };
}

export function questEntrance(reducedMotion) {
  return reducedMotion
    ? { autoAlpha: 1, x: 0, y: 0, duration: 0.01 }
    : { autoAlpha: 0, y: 18, duration: 0.55, ease: "power2.out" };
}

export function questUnlock(reducedMotion) {
  return reducedMotion
    ? { autoAlpha: 1, scale: 1, duration: 0.01 }
    : { autoAlpha: 0, scale: 0.9, duration: 0.5, ease: "back.out(1.4)" };
}
```

- [ ] **Step 5: Implement the scoped React hook**

```js
import { useEffect, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function useQuestMotion(scopeRef, animationFactory, dependencies = []) {
  const reducedMotion = useReducedMotion();
  useGSAP(
    () => animationFactory({ gsap, reducedMotion }),
    { scope: scopeRef, dependencies: [reducedMotion, ...dependencies], revertOnUpdate: true },
  );
  return reducedMotion;
}
```

- [ ] **Step 6: Run focused tests and the production build**

Run: `cd prototype; node --test src/motion/questMotion.test.mjs; npm run build`

Expected: two motion tests PASS and the Vite production build exits 0.

- [ ] **Step 7: Commit**

```bash
git add prototype/package.json prototype/package-lock.json prototype/src/motion
git commit -m "feat: add reduced-motion-safe quest animation primitives"
```

---

### Task 2: Student quest and role-entry view models

**Files:**
- Create: `prototype/src/questExperience.js`
- Create: `prototype/src/questExperience.test.mjs`
- Modify: `prototype/src/courseRoute.js`
- Modify: `prototype/src/courseRoute.test.mjs`

**Interfaces:**
- Consumes: `buildCourseRouteGroups(challenges, progress)` and `findNextRecommendedChallenge(challenges, progress)`.
- Produces: `buildRoleEntryCopy(role)`, `buildStudentQuestModel(routeGroups, recommended, progress)`, `buildFirstUseSteps(progress)`, and `buildQuestSettlement(challengeId, result, routeGroups)`.

- [ ] **Step 1: Write failing quest-model tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFirstUseSteps,
  buildQuestSettlement,
  buildRoleEntryCopy,
  buildStudentQuestModel,
} from "./questExperience.js";

const groups = [{
  id: "logic",
  title: "基础逻辑门",
  description: "从信号开始",
  items: [
    { id: "and-gate", title: "与门", status: "completed", bestScore: 100, attempts: 1, estimatedMinutes: 8 },
    { id: "half-adder", title: "半加器", status: "in-progress", bestScore: 70, attempts: 2, estimatedMinutes: 12 },
    { id: "full-adder", title: "全加器", status: "locked", bestScore: 0, attempts: 0, estimatedMinutes: 15 },
  ],
}];

test("role copy guides each account type without changing credentials", () => {
  assert.equal(buildRoleEntryCopy("student").usernameLabel, "学号");
  assert.equal(buildRoleEntryCopy("teacher").usernameLabel, "教师账号");
  assert.equal(buildRoleEntryCopy("student").submitLabel, "登录并继续学习");
});

test("student quest marks one current stage and a real lock requirement", () => {
  const model = buildStudentQuestModel(groups, { id: "half-adder", title: "半加器" }, {});
  assert.equal(model.current.id, "half-adder");
  assert.equal(model.stages.filter((stage) => stage.isCurrent).length, 1);
  assert.equal(model.stages.find((stage) => stage.id === "full-adder").unlockRequirement, "完成「半加器」后解锁");
});

test("first-use steps derive completion from real progress", () => {
  const steps = buildFirstUseSteps({ "and-gate": { attempts: 1, status: "completed" } });
  assert.equal(steps[0].completed, true);
  assert.equal(steps[2].completed, true);
});

test("settlement names the verified stage and next unlock", () => {
  const settlement = buildQuestSettlement("half-adder", { passed: true, score: 92 }, groups);
  assert.equal(settlement.title, "半加器已通过");
  assert.equal(settlement.nextTitle, "全加器");
  assert.equal(settlement.score, 92);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd prototype; node --test src/questExperience.test.mjs`

Expected: FAIL because `questExperience.js` does not exist.

- [ ] **Step 3: Implement the view-model functions**

```js
export function buildRoleEntryCopy(role = "student") {
  return role === "teacher"
    ? { usernameLabel: "教师账号", usernamePlaceholder: "请输入教师账号", submitLabel: "登录并进入指挥台", help: "首次登录后可创建或选择班级" }
    : { usernameLabel: "学号", usernamePlaceholder: "请输入教师发放的学号", submitLabel: "登录并继续学习", help: "账号由任课教师统一发放" };
}

export function buildStudentQuestModel(routeGroups = [], recommended, progress = {}) {
  const stages = routeGroups.flatMap((group) => group.items.map((item) => ({ ...item, groupId: group.id, groupTitle: group.title })));
  const currentId = recommended?.id ?? stages.find((stage) => stage.status !== "completed" && stage.status !== "locked")?.id ?? stages.at(-1)?.id;
  return {
    chapters: routeGroups,
    stages: stages.map((stage, index) => {
      const previous = stages[index - 1];
      return {
        ...stage,
        isCurrent: stage.id === currentId,
        unlockRequirement: stage.status === "locked" && previous ? `完成「${previous.title}」后解锁` : "",
        record: progress[stage.id] ?? {},
      };
    }),
    current: stages.find((stage) => stage.id === currentId) ?? null,
  };
}

export function buildFirstUseSteps(progress = {}) {
  const records = Object.values(progress);
  const hasAttempt = records.some((record) => Number(record?.attempts) > 0);
  const hasPass = records.some((record) => record?.status === "completed");
  return [
    { id: "inspect", label: "查看当前任务", completed: hasAttempt || hasPass },
    { id: "open", label: "进入实验工作台", completed: hasAttempt || hasPass },
    { id: "submit", label: "提交一次评测", completed: hasAttempt },
  ];
}

export function buildQuestSettlement(challengeId, result = {}, routeGroups = []) {
  const stages = routeGroups.flatMap((group) => group.items);
  const index = stages.findIndex((stage) => stage.id === challengeId);
  const stage = stages[index];
  const next = stages[index + 1];
  if (!result.passed || !stage) return null;
  return { challengeId, title: `${stage.title}已通过`, verified: "评测条件已全部满足", score: Number(result.score ?? 100), nextId: next?.id ?? null, nextTitle: next?.title ?? "课程路线", errors: result.errors ?? [] };
}
```

- [ ] **Step 4: Extend course-route items with normalized locked state and labels**

Update `buildRouteItem` so every item returns `status`, `statusLabel`, `estimatedLabel`, and a stable `sequence` index supplied by the caller. Keep existing fields unchanged for current consumers.

```js
function routeStatusLabel(status) {
  return { completed: "已完成", "in-progress": "进行中", locked: "未解锁", "not-started": "未开始", unlocked: "未开始" }[status] ?? "未开始";
}
```

- [ ] **Step 5: Run focused route and quest tests**

Run: `cd prototype; node --test src/courseRoute.test.mjs src/questExperience.test.mjs`

Expected: all existing route tests and the four new quest tests PASS.

- [ ] **Step 6: Commit**

```bash
git add prototype/src/courseRoute.js prototype/src/courseRoute.test.mjs prototype/src/questExperience.js prototype/src/questExperience.test.mjs
git commit -m "feat: derive student quest and role entry models"
```

---

### Task 3: Role-guided login portal

**Files:**
- Create: `prototype/src/components/auth/LoginPortal.jsx`
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `prototype/scripts/verify-ui.mjs`

**Interfaces:**
- Consumes: `loginForm`, `setLoginForm`, `loginError`, `handleLogin`, and `buildRoleEntryCopy(role)`.
- Produces: `<LoginPortal />` with a local `student | teacher` presentation role and unchanged login submission.

- [ ] **Step 1: Add failing browser assertions before changing JSX**

Add to the beginning of `verify-ui.mjs`, before teacher login:

```js
await assertVisible(page, "装配知识，运行你的第一台计算机");
await assertVisible(page, "学生入口");
await assertVisible(page, "教师入口");
assert.equal(await page.locator(".login-portal").count(), 1);
assert.equal(await page.locator(".login-card").count(), 0);
```

- [ ] **Step 2: Run UI QA and verify the new assertion fails**

Run: `cd prototype; npm run qa:ui`

Expected: FAIL because `.login-portal` and the new heading do not exist.

- [ ] **Step 3: Implement `LoginPortal`**

```jsx
import { useRef, useState } from "react";
import { Cpu, GraduationCap, PresentationChart, Route } from "@phosphor-icons/react";
import { buildRoleEntryCopy } from "../../questExperience.js";
import { questEntrance } from "../../motion/questMotion.js";
import { useQuestMotion } from "../../motion/useQuestMotion.js";

export function LoginPortal({ loginForm, setLoginForm, loginError, onSubmit }) {
  const [role, setRole] = useState("student");
  const rootRef = useRef(null);
  const copy = buildRoleEntryCopy(role);
  useQuestMotion(rootRef, ({ gsap, reducedMotion }) => {
    gsap.fromTo("[data-login-reveal]", questEntrance(reducedMotion), { autoAlpha: 1, y: 0, duration: reducedMotion ? 0.01 : 0.55, stagger: reducedMotion ? 0 : 0.08 });
  }, []);

  return (
    <main className="login-portal" ref={rootRef}>
      <section className="login-story" data-login-reveal>
        <span className="login-kicker"><Cpu size={18} /> COMPUTER LAB · 01</span>
        <h1>装配知识，运行你的第一台计算机</h1>
        <p>沿着课程地图完成逻辑门、加法器、存储系统与整机配置挑战。</p>
        <ol className="login-route"><li><Route />领取课堂任务</li><li><GraduationCap />进入工程工作台</li><li><PresentationChart />验证并提交成果</li></ol>
      </section>
      <form className="login-form-panel" data-login-reveal onSubmit={onSubmit}>
        <span className="eyebrow">组成原理实训平台</span>
        <h2>进入你的实训工作台</h2>
        <div className="login-role-tabs" role="tablist" aria-label="登录身份">
          <button aria-selected={role === "student"} className={role === "student" ? "active" : ""} onClick={() => setRole("student")} role="tab" type="button">学生入口</button>
          <button aria-selected={role === "teacher"} className={role === "teacher" ? "active" : ""} onClick={() => setRole("teacher")} role="tab" type="button">教师入口</button>
        </div>
        <label className="form-row"><span>{copy.usernameLabel}</span><input autoComplete="username" placeholder={copy.usernamePlaceholder} value={loginForm.username} onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))} /></label>
        <label className="form-row"><span>密码</span><input autoComplete="current-password" type="password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} /></label>
        {loginError ? <p aria-live="polite" className="form-error">{loginError}</p> : null}
        <button className="primary-button" type="submit">{copy.submitLabel}</button>
        <small>{copy.help} · 登录遇到问题请联系任课教师</small>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Replace `renderLogin()` in `App.jsx`**

Import `LoginPortal` and return it from `renderLogin` with the existing state and submit handler. Do not change `handleLogin` or the API payload.

```jsx
return <LoginPortal loginForm={loginForm} setLoginForm={setLoginForm} loginError={loginError} onSubmit={handleLogin} />;
```

- [ ] **Step 5: Add login layout and mobile reflow CSS**

Define `.login-portal` as a two-column full-height grid, `.login-story` as the aubergine narrative surface, `.login-form-panel` as the light form surface, and switch to one column below 780 px. Ensure the form action remains within 844 px height and all tab/input/button targets are at least 44 px on mobile.

- [ ] **Step 6: Run unit, build, and browser checks**

Run: `cd prototype; node --test src/questExperience.test.mjs src/motion/questMotion.test.mjs; npm run build; npm run qa:ui`

Expected: focused tests PASS, build exits 0, and UI QA reaches teacher login.

- [ ] **Step 7: Commit**

```bash
git add prototype/src/App.jsx prototype/src/components/auth/LoginPortal.jsx prototype/src/styles.css prototype/scripts/verify-ui.mjs
git commit -m "feat: redesign login as a guided role portal"
```

---

### Task 4: Student quest map and first-use guidance

**Files:**
- Create: `prototype/src/components/quest/QuestMap.jsx`
- Create: `prototype/src/components/quest/CurrentQuestPanel.jsx`
- Create: `prototype/src/components/quest/FirstUseGuide.jsx`
- Modify: `prototype/src/components/StudentHome.jsx`
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `prototype/scripts/verify-ui.mjs`

**Interfaces:**
- Consumes: `buildStudentQuestModel`, `buildFirstUseSteps`, existing `routeGroups`, `nextRecommendedChallenge`, `progress`, and `navigateToChallenge`.
- Produces: a single-current-stage route, one dominant action, and a dismissible presentational guide stored under `zcyl:quest-guide-dismissed:<userId>`.

- [ ] **Step 1: Add failing student-home assertions**

```js
await assertVisible(page, "课程探索地图");
await assertVisible(page, "当前任务");
assert.equal(await page.locator(".quest-stage[aria-current='step']").count(), 1);
assert.equal(await page.locator(".quest-primary-action").count(), 1);
```

- [ ] **Step 2: Run UI QA and verify failure**

Run: `cd prototype; npm run qa:ui`

Expected: FAIL because quest map selectors do not exist.

- [ ] **Step 3: Implement `QuestMap` and `CurrentQuestPanel`**

`QuestMap` renders semantic buttons from `model.stages`, sets `aria-current="step"` on the current stage, disables locked nodes, exposes each lock requirement in visible copy, and calls `onSelect(stage.id)`. `CurrentQuestPanel` renders objective, estimated time, attempts, completion condition, and exactly one `.quest-primary-action`.

```jsx
export function QuestMap({ model, onSelect }) {
  return <section aria-label="课程探索地图" className="quest-map"><div className="quest-track">{model.stages.map((stage, index) => <div className="quest-segment" key={stage.id}><button aria-current={stage.isCurrent ? "step" : undefined} className={`quest-stage ${stage.status} ${stage.isCurrent ? "current" : ""}`} disabled={stage.status === "locked"} onClick={() => onSelect(stage.id)} type="button"><span className="quest-stage-index">{String(index + 1).padStart(2, "0")}</span><strong>{stage.title}</strong><small>{stage.statusLabel ?? stage.status}</small>{stage.unlockRequirement ? <span className="quest-lock-reason">{stage.unlockRequirement}</span> : null}</button>{index < model.stages.length - 1 ? <span aria-hidden="true" className="quest-connector" /> : null}</div>)}</div></section>;
}

export function CurrentQuestPanel({ stage, record, onEnter }) {
  if (!stage) return null;
  return <section className="current-quest-panel"><div><span className="eyebrow">当前任务</span><h1>{stage.title}</h1><p>{stage.description}</p><div className="quest-facts"><span>预计 {stage.estimatedLabel ?? `${stage.estimatedMinutes} 分钟`}</span><span>{record?.attempts ?? 0} 次尝试</span><span>通过全部评测条件</span></div></div><button className="primary-button quest-primary-action" onClick={onEnter} type="button">{record?.status === "in-progress" ? "继续实验" : "进入当前关卡"}</button></section>;
}
```

- [ ] **Step 4: Implement the first-use guide**

Render the three derived steps, a visible `跳过引导` button, and persist only dismissal. Never mark a real step complete from local storage.

- [ ] **Step 5: Rewrite `StudentHome` composition**

Build the model once, then render `CurrentQuestPanel`, `QuestMap`, `FirstUseGuide`, recent feedback, and notes in that priority. Preserve the active classroom `CurrentMissionCard` entry action above the map.

- [ ] **Step 6: Add quest layout, states, focus, and mobile route CSS**

Desktop shows the current route segment and mission in the first 768 px. Mobile turns the route into a bounded horizontal track with scroll snapping and no document-level horizontal overflow. Completed/current/locked states use label, shape, and color.

- [ ] **Step 7: Run focused and browser verification**

Run: `cd prototype; node --test src/courseRoute.test.mjs src/questExperience.test.mjs; npm run build; npm run qa:ui`

Expected: unit tests PASS, one current stage exists, and desktop/mobile UI checks pass.

- [ ] **Step 8: Commit**

```bash
git add prototype/src/App.jsx prototype/src/components/StudentHome.jsx prototype/src/components/quest prototype/src/styles.css prototype/scripts/verify-ui.mjs
git commit -m "feat: turn student home into a guided quest map"
```

---

### Task 5: Non-blocking evaluation settlement

**Files:**
- Create: `prototype/src/components/quest/QuestSettlement.jsx`
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `prototype/scripts/verify-ui.mjs`

**Interfaces:**
- Consumes: `buildQuestSettlement(challengeId, result, routeGroups)` inside `persistStudentAttempt` and hardware submission.
- Produces: `questSettlement` state and `<QuestSettlement settlement onContinue onReview />`.

- [ ] **Step 1: Add a failing browser assertion to the successful student submission flow**

```js
await page.getByRole("button", { name: "提交检测" }).click();
await assertVisible(page, "已通过");
assert.equal(await page.locator(".quest-settlement").count(), 1);
await page.getByRole("button", { name: "继续下一关" }).click();
```

- [ ] **Step 2: Run UI QA and verify failure**

Run: `cd prototype; npm run qa:ui`

Expected: FAIL because `.quest-settlement` is not rendered for ordinary practice.

- [ ] **Step 3: Implement settlement component with scoped unlock motion**

```jsx
import { useRef } from "react";
import { ArrowRight, SealCheck } from "@phosphor-icons/react";
import { questUnlock } from "../../motion/questMotion.js";
import { useQuestMotion } from "../../motion/useQuestMotion.js";

export function QuestSettlement({ settlement, onContinue, onReview }) {
  const rootRef = useRef(null);
  useQuestMotion(rootRef, ({ gsap, reducedMotion }) => {
    if (settlement) gsap.fromTo(".quest-settlement-card", questUnlock(reducedMotion), { autoAlpha: 1, scale: 1, duration: reducedMotion ? 0.01 : 0.5 });
  }, [settlement?.challengeId]);
  if (!settlement) return null;
  return <section aria-live="polite" className="quest-settlement" ref={rootRef}><div className="quest-settlement-card"><SealCheck size={42} weight="fill" /><span className="eyebrow">评测结算</span><h2>{settlement.title}</h2><p>{settlement.verified}</p><strong>{settlement.score} 分</strong><p>{settlement.nextTitle ? `已解锁：${settlement.nextTitle}` : "课程路线已完成"}</p><div><button className="ghost-button" onClick={onReview} type="button">复盘本关</button><button className="primary-button" onClick={onContinue} type="button">继续下一关 <ArrowRight /></button></div></div></section>;
}
```

- [ ] **Step 4: Wire settlement state in `App.jsx`**

Create `const [questSettlement, setQuestSettlement] = useState(null)`. In ordinary and hardware persistence paths, build settlement immediately from the verified local result. `onReview` closes the settlement and stays in the lab; `onContinue` closes it and navigates to `nextId` or home.

- [ ] **Step 5: Add overlay, focus, and reduced-motion CSS**

The settlement must not trap users, must keep both actions keyboard reachable, and must switch to an immediate visible state under `prefers-reduced-motion: reduce`.

- [ ] **Step 6: Run verification and commit**

Run: `cd prototype; node --test src/questExperience.test.mjs src/motion/questMotion.test.mjs; npm run build; npm run qa:ui`

Expected: settlement appears after a pass, the continue action works, and all commands exit 0.

```bash
git add prototype/src/App.jsx prototype/src/components/quest/QuestSettlement.jsx prototype/src/styles.css prototype/scripts/verify-ui.mjs
git commit -m "feat: add purposeful quest evaluation settlement"
```

---

### Task 6: Teacher cohort route, setup checklist, and interventions

**Files:**
- Create: `prototype/src/teacherQuest.js`
- Create: `prototype/src/teacherQuest.test.mjs`
- Create: `prototype/src/components/teacher/TeacherQuestOverview.jsx`
- Create: `prototype/src/components/teacher/TeacherSetupChecklist.jsx`
- Create: `prototype/src/components/teacher/InterventionGroups.jsx`
- Modify: `prototype/src/components/TeacherDashboard.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `prototype/scripts/verify-ui.mjs`

**Interfaces:**
- Consumes: `routeGroups`, `classOverview.students`, `teacherClasses`, selected class, and `teacherSession.viewModel`.
- Produces: `buildTeacherQuestModel(routeGroups, students)`, `buildTeacherSetupSteps(context)`, and `buildInterventionGroups(students)`.

- [ ] **Step 1: Write failing teacher model tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildInterventionGroups, buildTeacherQuestModel, buildTeacherSetupSteps } from "./teacherQuest.js";

const routes = [{ id: "logic", items: [{ id: "and-gate", title: "与门" }, { id: "half-adder", title: "半加器" }] }];
const students = [
  { id: 1, displayName: "甲", progress: { "and-gate": { status: "completed", attempts: 1 }, "half-adder": { status: "in-progress", attempts: 4, errors: ["carry", "carry"] } } },
  { id: 2, displayName: "乙", progress: {} },
];

test("teacher quest aggregates reached and completed students", () => {
  const model = buildTeacherQuestModel(routes, students);
  assert.deepEqual(model.stages[0], { id: "and-gate", title: "与门", reached: 1, completed: 1, completionRate: 50, blocker: "暂无集中卡点" });
});

test("setup checklist follows real class state", () => {
  const steps = buildTeacherSetupSteps({ hasClass: true, studentCount: 2, hasMission: false, hasStartedSession: false });
  assert.deepEqual(steps.map((step) => step.completed), [true, true, false, false]);
});

test("interventions group not-entered and repeated failures", () => {
  const groups = buildInterventionGroups(students);
  assert.equal(groups.find((group) => group.id === "not-entered").students[0].displayName, "乙");
  assert.equal(groups.find((group) => group.id === "repeated-failure").students[0].displayName, "甲");
});
```

- [ ] **Step 2: Run and verify failure**

Run: `cd prototype; node --test src/teacherQuest.test.mjs`

Expected: FAIL because `teacherQuest.js` does not exist.

- [ ] **Step 3: Implement pure aggregation without invented metrics**

Count only statuses and errors present in existing student records. Use `暂无集中卡点` when evidence is insufficient. Treat `attempts >= 3` with at least two recorded errors as repeated failure; do not infer disconnection without a live-session presence field.

- [ ] **Step 4: Implement the three teacher components**

`TeacherQuestOverview` renders stage reach/completion and one dominant blocker. `TeacherSetupChecklist` renders create/select class, import students, choose mission, start classroom from derived booleans. `InterventionGroups` renders only non-empty evidence-backed groups and routes `查看证据` to the existing student detail action.

- [ ] **Step 5: Recompose `TeacherStudioDashboard`**

Place classroom lifecycle action first, then setup checklist when incomplete, cohort quest route, intervention groups, assignments, supporting metrics/reports, and the existing student table. Preserve class creation, import, password reset, assistant report, session control, report, and CSV export behavior.

- [ ] **Step 6: Add failing and then passing browser assertions**

```js
await assertVisible(page, "班级探索进度");
await assertVisible(page, "首次开课");
assert.equal(await page.locator(".teacher-quest-overview").count(), 1);
assert.equal(await page.locator(".teacher-setup-checklist").count(), 1);
```

Run: `cd prototype; node --test src/teacherQuest.test.mjs; npm run build; npm run qa:ui`

Expected: all three model tests PASS and the browser finds both teacher quest surfaces.

- [ ] **Step 7: Commit**

```bash
git add prototype/src/teacherQuest.js prototype/src/teacherQuest.test.mjs prototype/src/components/teacher prototype/src/components/TeacherDashboard.jsx prototype/src/styles.css prototype/scripts/verify-ui.mjs
git commit -m "feat: add teacher cohort quest and intervention view"
```

---

### Task 7: Shared visual system, responsive shell, and motion integration

**Files:**
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `prototype/src/components/quest/QuestMap.jsx`
- Modify: `prototype/src/components/teacher/TeacherQuestOverview.jsx`
- Modify: `prototype/AGENTS.md`

**Interfaces:**
- Consumes: motion hooks, quest route nodes, teacher route nodes, existing sidebar/nav shell.
- Produces: consistent quest tokens, route focus motion, mobile reflow, and durable project guidance.

- [ ] **Step 1: Record the approved direction in `AGENTS.md`**

Add one bullet under durable preferences:

```md
- The approved platform-wide direction is the "Quest Learning Map": a professional engineering-adventure presentation with explicit maps, stages, mission objectives, evaluation settlement, and role-specific onboarding. Student and teacher experiences share progression language; the teacher view emphasizes cohort blockers and interventions.
```

Review the existing unstaged diff first and stage only the intended hunk when committing.

- [ ] **Step 2: Define and apply quest design tokens**

Add tokens for aubergine navigation, parchment/violet work surfaces, amber action, teal success, error red, border, focus, and route depth. Replace only shell/login/student/teacher selectors in scope; do not restyle laboratory controls unrelated to the approved redesign.

- [ ] **Step 3: Add route focus and unlock motion**

Use `useQuestMotion` with scoped selectors. On mount, focus the current route segment. On progress change, animate only the affected connector/node. Keep the first render useful before JS and keep reduced-motion behavior immediate.

- [ ] **Step 4: Complete responsive reflow**

At 1366 x 768, login, current student mission, and teacher lifecycle remain above the fold. At 390 x 844, the login stacks, the quest route remains inside its own bounded scroller, the bottom navigation does not cover actions, and `documentElement.scrollWidth <= clientWidth`.

- [ ] **Step 5: Verify keyboard and reduced-motion behavior**

Run the app with Playwright `reducedMotion: "reduce"`, tab through role tabs, login fields, route nodes, guide dismissal, teacher lifecycle action, and settlement actions. Confirm computed transforms are `none` or settled immediately after state changes.

- [ ] **Step 6: Run build and UI QA**

Run: `cd prototype; npm run build; npm run qa:ui`

Expected: build exits 0; desktop, mobile, keyboard, and reduced-motion checks pass.

- [ ] **Step 7: Commit**

```bash
git add prototype/src/App.jsx prototype/src/styles.css prototype/src/components/quest/QuestMap.jsx prototype/src/components/teacher/TeacherQuestOverview.jsx
git add -p prototype/AGENTS.md
git commit -m "feat: apply quest visual system and purposeful motion"
```

---

### Task 8: Full regression and visual acceptance

**Files:**
- Modify: `prototype/scripts/verify-ui.mjs`
- Modify: `prototype/design-qa.md`

**Interfaces:**
- Consumes: completed login, student, teacher, settlement, and motion surfaces.
- Produces: deterministic screenshots and a written QA record for desktop/mobile acceptance.

- [ ] **Step 1: Add final browser flow coverage**

Cover these exact paths in `verify-ui.mjs`:

1. Anonymous role guidance and failed-login recovery.
2. First-time teacher empty class and setup checklist.
3. Teacher class creation/import and quest distribution.
4. Returning student current mission and exactly one current route node.
5. Passing an ordinary experiment and continuing from settlement.
6. Mobile student and teacher layouts with no page overflow.
7. Reduced-motion context with no travel animation requirement.

- [ ] **Step 2: Run the complete unit and server suite**

Run: `cd prototype; npm test`

Expected: all unit and server tests PASS.

- [ ] **Step 3: Run production and asset gates**

Run: `cd prototype; npm run build; npm run qa:assets`

Expected: build and asset budget exit 0.

- [ ] **Step 4: Run UI and classroom browser flows**

Run: `cd prototype; npm run qa:ui; npm run qa:classroom`

Expected: both Playwright suites exit 0 and refresh screenshots in `prototype/qa-artifacts/`.

- [ ] **Step 5: Run classroom load gate**

Run: `cd prototype; npm run qa:classroom-load`

Expected: 150 students, at least 20 concurrent clients, P95 no more than 2000 ms, and zero `SQLITE_BUSY` errors.

- [ ] **Step 6: Inspect final screenshots**

Inspect login, student home, teacher empty/imported states, 1366 x 768 desktop, 390 x 844 mobile, and ordinary settlement. Record concrete pass/fail notes in `prototype/design-qa.md`; do not write subjective “looks good” acceptance.

- [ ] **Step 7: Commit**

```bash
git add prototype/scripts/verify-ui.mjs prototype/design-qa.md
git commit -m "test: verify quest learning map experience"
```

---

## Final acceptance checklist

- [ ] Login explains both roles and preserves the existing authentication contract.
- [ ] Student home exposes one current mission and one dominant action.
- [ ] Locked stages expose real prerequisites.
- [ ] A passing evaluation produces a non-blocking settlement and next unlock.
- [ ] Teacher home exposes cohort distribution, setup progress, and evidence-backed interventions.
- [ ] Classroom draft/start/pause/resume/end behavior still passes browser QA.
- [ ] Keyboard, reduced-motion, 1366 x 768, and 390 x 844 acceptance checks pass.
- [ ] No leaderboard, currency, store, decorative infinite motion, or copied third-party assets were added.
- [ ] Existing unrelated working-tree changes remain intact.
