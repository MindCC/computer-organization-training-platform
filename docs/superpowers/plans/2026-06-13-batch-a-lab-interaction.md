# Batch A Lab Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the student lab from click-to-connect wiring into a more Turing Complete-like drag-wire interaction while preserving the current full-screen layout, placement grading, and Chinese teaching feedback.

**Architecture:** Keep the wire interaction logic in focused helpers instead of growing `src/App.jsx` further. Introduce a small interaction state machine for wire dragging, render a live preview line in the lab canvas, and only commit a connection when the drag ends on a valid endpoint. Reuse the existing connection normalization and grading rules so behavior changes stay localized.

**Tech Stack:** React 19, Vite, Playwright smoke check, Node test runner

---

### Task 1: Define Drag-Wire Behavior in Pure Logic

**Files:**
- Modify: `D:\workspace\zcyl_training\prototype\src\labWiring.test.mjs`
- Modify: `D:\workspace\zcyl_training\prototype\src\labWiring.js`
- Test: `D:\workspace\zcyl_training\prototype\src\labWiring.test.mjs`

- [ ] **Step 1: Write the failing test**

Add tests for:
- starting a drag from one endpoint produces a pending wire state
- ending a drag on a valid counterpart creates the normalized connection
- ending a drag on empty space cancels without changing connections
- dragging back to the same endpoint cancels instead of creating a self-loop

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/labWiring.test.mjs`
Expected: FAIL because the new drag helpers do not exist yet

- [ ] **Step 3: Write minimal implementation**

Add focused helpers in `src/labWiring.js`:
- `beginWireDrag(endpoint)`
- `completeWireDrag(challenge, currentConnections, startEndpoint, endEndpoint)`
- `cancelWireDrag()`

Keep them pure and make them reuse `normalizeConnectionLabels(...)` and `toggleConnectionByLabels(...)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/labWiring.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/labWiring.js src/labWiring.test.mjs
git commit -m "feat: add drag wire state helpers"
```

### Task 2: Replace Click Wiring with Drag Wiring in the Lab Canvas

**Files:**
- Modify: `D:\workspace\zcyl_training\prototype\src\App.jsx`
- Modify: `D:\workspace\zcyl_training\prototype\src\styles.css`
- Test: `D:\workspace\zcyl_training\prototype\src\labWiring.test.mjs`

- [ ] **Step 1: Write the failing test**

Extend the wiring tests or add a minimal interaction-level assertion around the helper output so the new drag flow is the only way to create a pending wire preview state.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test`
Expected: FAIL in the updated wiring test coverage

- [ ] **Step 3: Write minimal implementation**

In `src/App.jsx`:
- replace the current `activeEndpoint` click workflow with a `wireDrag` state object
- start drag on pointer down from anchors and floating pins
- update pointer position while dragging
- complete the wire only when pointer up lands on a valid endpoint
- cancel on escape, background release, or self-target

In `src/styles.css`:
- add a dedicated preview line style distinct from committed lines
- add hover/drag states for endpoints so students can see legal targets

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/styles.css src/labWiring.js src/labWiring.test.mjs
git commit -m "feat: add drag wire interaction"
```

### Task 3: Update Browser Verification for Drag Wiring

**Files:**
- Modify: `D:\workspace\zcyl_training\prototype\scripts\verify-ui.mjs`
- Modify: `D:\workspace\zcyl_training\prototype\design-qa.md`
- Test: `D:\workspace\zcyl_training\prototype\scripts\verify-ui.mjs`

- [ ] **Step 1: Write the failing test**

Update the smoke script expectation so it no longer clicks two endpoints directly. Make it simulate a drag-wire gesture and fail if the new interaction does not produce a connection chip.

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:QA_ARTIFACT_DIR=\"$env:TEMP\\zcyl-training-qa\"; node scripts/verify-ui.mjs`
Expected: FAIL until the script matches the new interaction

- [ ] **Step 3: Write minimal implementation**

Update `scripts/verify-ui.mjs` to:
- create a placed component
- perform a drag-wire gesture from an anchor to a floating pin
- assert preview/connection success through the resulting chip or line state

Then update `design-qa.md` so the verified interaction description matches the new lab behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:QA_ARTIFACT_DIR=\"$env:TEMP\\zcyl-training-qa\"; node scripts/verify-ui.mjs`
Expected: `UI smoke check passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-ui.mjs design-qa.md
git commit -m "test: cover drag wire lab interaction"
```

### Task 4: Final Batch-A-Phase-1 Verification

**Files:**
- Verify only: `D:\workspace\zcyl_training\prototype`

- [ ] **Step 1: Run full automated checks**

Run: `npm.cmd test`
Expected: all tests pass

- [ ] **Step 2: Run browser smoke verification**

Run: `$env:QA_ARTIFACT_DIR=\"$env:TEMP\\zcyl-training-qa\"; node scripts/verify-ui.mjs`
Expected: `UI smoke check passed`

- [ ] **Step 3: Record residual work**

Document the next Batch A follow-ups after drag wiring:
- wire deletion and rerouting affordance
- stronger illegal-target hints
- component expand/internal-structure linkage
- further extraction of lab state from `src/App.jsx`

- [ ] **Step 4: Commit**

```bash
git status --short
```

Expected: clean working tree or only intentional follow-up docs
