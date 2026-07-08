# Classroom Long-Term Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first PRD phase: stabilize current component split, add basic trustworthy submissions, enrich teacher student detail, improve local assistant fallback, and document the backup path.

**Architecture:** Keep the existing Express + SQLite + React/Vite architecture. Add focused server helpers for validation and analytics, keep React component extraction incremental, and preserve existing API response shapes while adding fields.

**Tech Stack:** React 19, Vite, Express 5, better-sqlite3, Node test runner, Playwright smoke script.

## Global Constraints

- Do not overwrite unrelated dirty work; inspect `git status --short` before edits.
- Do not commit `.hermes/` unless it becomes documented product code.
- Use TDD for behavior changes.
- Keep SQLite as the first database while preserving data-access boundaries.
- Do not send student passwords, session tokens, cookies, or full raw notes to AI.
- Run `npm.cmd test`, `npm.cmd run build`, and `node scripts/verify-ui.mjs` before final handoff.

---

### Task 1: Stabilize Current Component Split

**Files:**
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/components/HardwareGamePage.jsx`
- Modify: `prototype/src/components/MemorySystemPanel.jsx`
- Modify: `prototype/src/components/MachineNumberPanel.jsx`
- Modify: `prototype/src/components/MobileLabFallback.jsx`
- Modify: `prototype/src/styles.css`

**Interfaces:**
- Consumes: existing `App` state and callbacks.
- Produces: imported components that render the same UI as the previous inline code.

- [ ] **Step 1: Inspect dirty state**

Run: `git status --short`

Expected: Shows current uncommitted split files and no surprise unrelated files beyond `.hermes/`.

- [ ] **Step 2: Repair `App.jsx` structure**

Ensure the teacher detail JSX closes before `function renderHome()` starts:

```jsx
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderHome() {
    const recommended = nextRecommendedChallenge;
```

- [ ] **Step 3: Keep mobile fallback explicit**

Ensure React Flow circuit labs render `<MobileLabFallback />` only under mobile width and keep desktop React Flow unchanged.

- [ ] **Step 4: Run build**

Run: `npm.cmd run build`

Expected: Vite build exits 0.

### Task 2: Add Submission Trust Validation

**Files:**
- Create: `prototype/server/submissionValidation.js`
- Create/Modify Test: `prototype/server/submissionValidation.test.mjs`
- Modify: `prototype/server/app.js`

**Interfaces:**
- Produces: `normalizeStudentAttemptPayload(payload, learningItems): { ok: true, challengeId, result } | { ok: false, status, error }`
- Consumes: `LEARNING_ITEMS` and hardware game grading helpers.

- [ ] **Step 1: Write failing tests**

Add tests for rejecting score over 100, rejecting passed with low score, rejecting large payloads, and regrading hardware challenge selections.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test -- server/submissionValidation.test.mjs`

Expected: Fails because `submissionValidation.js` does not exist.

- [ ] **Step 3: Implement validator**

Implement score range, passed consistency, elapsed minutes range, errors shape, result payload size, and hardware challenge regrading.

- [ ] **Step 4: Wire into `/api/student/attempts`**

Call `normalizeStudentAttemptPayload` before `recordStudentAttempt`.

- [ ] **Step 5: Verify GREEN**

Run: `npm.cmd test`

Expected: All tests pass.

### Task 3: Enrich Teacher Student Detail Analytics

**Files:**
- Modify: `prototype/server/db.js`
- Modify Test: `prototype/server/app.test.mjs`
- Modify: `prototype/src/App.jsx`

**Interfaces:**
- Produces additional fields on student detail: `timeDistribution`, `scoreTrends`, `hardwareSummary`.
- Consumes existing `challenge_attempts.result_json`, `student_progress`, and notes.

- [ ] **Step 1: Write failing API test**

Extend teacher student detail test to assert returned `timeDistribution`, `scoreTrends`, and `hardwareSummary` after normal and hardware attempts.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test -- server/app.test.mjs`

Expected: Fails on missing analytics fields.

- [ ] **Step 3: Implement analytics helpers**

Keep helpers private to `db.js` unless they become large enough for a separate module.

- [ ] **Step 4: Render analytics in teacher detail**

Add compact sections for耗时分布, 得分趋势, and 硬件挑战经营.

- [ ] **Step 5: Verify GREEN**

Run: `npm.cmd test`

Expected: All tests pass.

### Task 4: Improve Local Assistant Fallback Rules

**Files:**
- Create: `prototype/server/teacherFallbackRules.js`
- Modify: `prototype/server/teacherAssistant.js`
- Modify Test: `prototype/server/teacherAssistant.test.mjs`

**Interfaces:**
- Produces: `buildRuleBasedAssistantReport(payload): { lessonFocus, riskStudents, groupingPlan, commonMisconceptions, nextClassPlan, teacherScript, evidence }`
- Consumes: sanitized teacher assistant payload only.

- [ ] **Step 1: Write failing tests**

Cover at least machine-number weakness, carry-path weakness, storage-system weakness, hardware-budget weakness, and progress-risk weakness.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test -- server/teacherAssistant.test.mjs`

Expected: Fails because rules are absent.

- [ ] **Step 3: Implement rules**

Use completion rate, average score, per-challenge errors, and hardware summary. Include `evidence` entries for every selected focus.

- [ ] **Step 4: Wire fallback**

Make `buildFallbackAssistantReport` call `buildRuleBasedAssistantReport`.

- [ ] **Step 5: Verify GREEN**

Run: `npm.cmd test`

Expected: All tests pass.

### Task 5: Backup and Handoff Documentation

**Files:**
- Modify: `docs/classroom-deployment.md`
- Modify: `docs/classroom-long-term-prd.md`

**Interfaces:**
- Produces documented backup/restore commands for Windows and Linux.

- [ ] **Step 1: Add deployment backup commands**

Document SQLite file path, copy command, restore command, and classroom rehearsal checklist.

- [ ] **Step 2: Add PRD traceability note**

Mark Phase 1 backup as documentation-first unless admin API is explicitly prioritized.

- [ ] **Step 3: Check docs encoding**

Run: `rg -n "\?{3,}|�" docs/classroom-deployment.md docs/classroom-long-term-prd.md`

Expected: no accidental mojibake except deliberate regex examples.

### Task 6: Final Verification and Commit

**Files:**
- All changed files from Tasks 1-5.

- [ ] **Step 1: Run full tests**

Run: `npm.cmd test`

Expected: 0 failures.

- [ ] **Step 2: Run production build**

Run: `npm.cmd run build`

Expected: exit 0.

- [ ] **Step 3: Run UI smoke**

Run the existing local server + `node scripts/verify-ui.mjs` smoke command.

Expected: `UI smoke check passed`.

- [ ] **Step 4: Inspect git status**

Run: `git status --short`

Expected: product files changed, `.hermes/` not staged.

- [ ] **Step 5: Commit**

Commit message: `feat: advance classroom long-term phase one`

