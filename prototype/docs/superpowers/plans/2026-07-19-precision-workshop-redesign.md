# Precision Workshop Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the approved bright Precision Workshop direction across the existing application shell, with a useful and visually recognizable hardware assembly challenge.

**Architecture:** Preserve the existing React routes, API calls, and grading functions. Add a pure hardware-workbench view model for tested UI state, replace the hardware challenge's primitive Three.js primary surface with a generated raster plus semantic hotspots, and update shared CSS tokens/layout so student and teacher screens inherit the approved system.

**Tech Stack:** React 19, Vite 6, Node test runner, Phosphor Icons, Playwright QA, existing Express API.

## Global Constraints

- Preserve `src/circuit/faultInjection.js` and `src/circuit/faultInjection.test.mjs`; they are user-owned untracked files.
- No backend/API schema changes.
- No new UI/icon dependency.
- Primary acceptance viewport is 1366 ? 768; mobile acceptance is 390 ? 844 with no horizontal page overflow.
- Do not use primitive boxes, handcrafted SVG/CSS art, emoji, or generic placeholders as the hardware challenge's primary visual.
- Keep all current navigation, submission, teacher, assignment, and classroom-session behavior.

---

### Task 1: Tested hardware workbench view model

**Files:**
- Create: `src/hardwareWorkbench.js`
- Create: `src/hardwareWorkbench.test.mjs`

**Interfaces:**
- Consumes: `HARDWARE_PARTS`, a selection object, and the result from `gradeHardwareBuild`.
- Produces: `HARDWARE_WORKBENCH_CATEGORIES`, `buildHardwareWorkbenchModel(selection, result)`, and `hardwareSelectionProgress(selection)`.

- [ ] **Step 1: Write the failing test**

```js
test("workbench exposes recognizable categories and selected catalog state", () => {
  const model = buildHardwareWorkbenchModel(selection, gradeHardwareBuild("game-office-pc", selection));
  assert.deepEqual(model.categories.map((item) => item.id), ["cpu", "memory", "storage", "gpu"]);
  assert.equal(model.categories.find((item) => item.id === "memory").options.find((item) => item.selected).id, "mem-8");
  assert.equal(model.progress.selected, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/hardwareWorkbench.test.mjs`
Expected: FAIL because `src/hardwareWorkbench.js` does not exist.

- [ ] **Step 3: Implement the pure view model**

```js
export const HARDWARE_WORKBENCH_CATEGORIES = [
  { id: "cpu", label: "CPU", hotspot: { x: 42, y: 41 } },
  { id: "memory", label: "??", hotspot: { x: 59, y: 57 } },
  { id: "storage", label: "??", hotspot: { x: 69, y: 77 } },
  { id: "gpu", label: "??", hotspot: { x: 26, y: 76 } },
];
```

Build catalog entries from `HARDWARE_PARTS`, mark selected entries, expose selected count, budget state, and unmet requirement labels without mutating inputs.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/hardwareWorkbench.test.mjs`
Expected: PASS.

### Task 2: Interactive realistic assembly workbench

**Files:**
- Modify: `src/components/HardwareBuilderView.jsx`
- Modify: `src/components/HardwareGamePage.jsx`
- Modify: `src/styles.css`
- Modify: `scripts/verify-ui.mjs`

**Interfaces:**
- Consumes: `hardwareSelection`, `setHardwareSelection`, `preview`, `selectedCase`, and `src/assets/hardware-assembly-workbench.png`.
- Produces: semantic hotspot buttons, category tabs/cards, live progress/budget feedback, and the existing submit action.

- [ ] **Step 1: Add failing browser assertions**

```js
await page.locator(".hardware-workbench-image").waitFor({ state: "visible" });
assert.equal(await page.locator(".hardware-workbench-hotspot").count(), 4);
assert.equal(await page.locator(".hardware-workbench canvas").count(), 0);
await page.getByRole("button", { name: "????" }).click();
await page.getByRole("button", { name: /16GB ??/ }).click();
await assertVisible(page, "?? 4 / 4");
```

- [ ] **Step 2: Run browser QA to verify it fails**

Run: `npm run qa:ui`
Expected: FAIL because the workbench image and semantic hotspots are missing.

- [ ] **Step 3: Replace the primitive builder surface**

Import the generated raster, use `buildHardwareWorkbenchModel`, render four semantic hotspots over the image, and render a catalog card list whose buttons call:

```js
onPartChange((current) => ({ ...current, [categoryId]: part.id }));
```

Keep `HardwareGamePage` responsible for case selection, mission copy, business metrics, feedback, and submit. Remove the duplicated legacy part grid after the new catalog is connected.

- [ ] **Step 4: Run unit and browser tests**

Run: `node --test src/hardwareWorkbench.test.mjs`
Expected: PASS.

Run: `npm run qa:ui`
Expected: PASS including hardware image, hotspot selection, submission, and no page errors.

### Task 3: Precision Workshop shell and responsive navigation

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Modify: `scripts/verify-ui.mjs`

**Interfaces:**
- Consumes: current active view, existing navigation/profile behavior.
- Produces: compact desktop rail, tablet rail, mobile bottom navigation, and main-content-first responsive flow.

- [ ] **Step 1: Add failing responsive assertions**

```js
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(baseUrl, { waitUntil: "networkidle" });
assert.equal(await page.locator(".sidebar-nav").evaluate((node) => getComputedStyle(node).position), "fixed");
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
```

- [ ] **Step 2: Run UI QA to verify it fails**

Run: `npm run qa:ui`
Expected: FAIL because the mobile navigation currently stacks before main content.

- [ ] **Step 3: Implement shared shell tokens and responsive reflow**

Update tokens and shell CSS to match the selected mock. Keep desktop/tablet navigation as a compact navy rail and switch `.sidebar-nav` to a fixed bottom strip below 780px while hiding promo/meta content. Keep focus states and active labels visible.

- [ ] **Step 4: Run UI QA**

Run: `npm run qa:ui`
Expected: PASS at desktop and mobile viewports with no horizontal overflow.

### Task 4: Student and teacher surface unification

**Files:**
- Modify: `src/components/StudentHome.jsx`
- Modify: `src/components/TeacherDashboard.jsx`
- Modify: `src/styles.css`
- Modify: `scripts/verify-ui.mjs`

**Interfaces:**
- Consumes: existing student route groups and teacher overview/session data.
- Produces: consistent compact headers, metric cards, workbench surfaces, and unchanged actions.

- [ ] **Step 1: Add failing semantic/visual-contract assertions**

```js
await assertVisible(page, "????");
assert.equal(await page.locator(".route-map-overview .metric-card").count(), 4);
assert.equal(await page.locator(".teacher-studio-summary .metric-card").count(), 4);
```

- [ ] **Step 2: Run UI QA to verify it fails**

Run: `npm run qa:ui`
Expected: FAIL because the student metric cards do not yet share the workbench anatomy/copy.

- [ ] **Step 3: Apply the shared surface hierarchy**

Use existing data and handlers; only adjust markup classes/copy needed for the selected design. Preserve the course circuit-route structure, class selection, assignments, AI assistant, student table, and classroom command center.

- [ ] **Step 4: Run UI QA**

Run: `npm run qa:ui`
Expected: PASS.

### Task 5: Final verification and Product Design QA

**Files:**
- Create: `design-qa.md`
- Capture: `qa-artifacts/precision-workshop-desktop.png`
- Capture: `qa-artifacts/precision-workshop-mobile.png`

**Interfaces:**
- Consumes: selected source image and browser-rendered implementation.
- Produces: `design-qa.md` with `final result: passed`.

- [ ] **Step 1: Run fresh automated verification**

Run: `npm test`
Expected: all tests pass.

Run: `npm run build`
Expected: Vite build exits 0.

Run: `npm run qa:assets`
Expected: asset budget passes.

Run: `npm run qa:ui`
Expected: UI smoke passes and screenshots are created.

- [ ] **Step 2: Capture the current local implementation in the in-app browser**

Use the same authenticated hardware-challenge state as the source design, capture desktop and mobile states, test hotspot/category selection and submit, and check console errors.

- [ ] **Step 3: Compare source and implementation together**

Evaluate typography, spacing, tokens, image quality, copy, interaction states, desktop composition, and mobile reflow. Record every P0/P1/P2 finding in `design-qa.md`, fix it, and repeat the comparison.

- [ ] **Step 4: Pass the build gate**

`design-qa.md` must name the source image, implementation screenshots, viewport/state, full-view and focused comparison evidence, iteration history, remaining P3 notes, and end with exactly `final result: passed`.
