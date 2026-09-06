# PC simulator teaching workbench implementation plan

> **For agentic workers:** Use subagent-driven-development for the independent draft module; implement integrated rendering changes locally and review the complete diff.

**Goal:** Deliver the approved first phase: reliable production 3D, readable assembly targets and camera closeups, isolated local assembly drafts, and a Blender asset contract.

**Architecture:** React owns assembly state and recovery. The native Three.js controller owns camera easing, mesh previews and picking. GLB production is a subsequent phase; this iteration improves the existing compound models.

**Tech Stack:** React 19, Three.js, Vite, Node test runner, standalone Playwright.

## Global constraints

- Preserve the light Precision Workshop and current order grading.
- Integrated graphics is not a physical card; retain keyboard and WebGL fallback controls.
- No cable or screw physics. One browser instance at a time.
- Actual dist modules and UI must work, not only the dev server.
- Drafts are local progress, never authoritative score evidence.

## Tasks

- [x] Production regression: add a browser verifier importing lazy 3D modules from the dist manifest; require WebGL capability and successful import, capture errors. First run must reproduce initialization failure. Replace renderer/core split with a dependency-safe split; verify no circular warning and preserve existing 500 KiB chunk / 220 KiB gzip budgets. Add a production mode to the isolated browser runner and a production 3D npm gate.
- [x] Draft persistence: add `src/assemblyDraft.js` with `assemblyDraftKey(userId, caseId)`, `loadAssemblyDraft(storage, key, selection)` and `saveAssemblyDraft(storage, key, installed, selection)`. Tests use Map-backed storage to verify user/order isolation, schema and corrupt JSON handling, blocked storage and changed-variant reconciliation. No boot status restored. Thread authenticated user ID into HardwareGamePage; hydrate and persist installed state in a keyed workbench.
- [x] Scene interaction: expose overview/top/part camera presets; focus target is the selected socket while keeping its supply part in reach. Pointer manipulation cancels easing. Show only active labels at rest, all potential targets during a drag. Render a translucent clone and outline at the valid socket with explicit correct/wrong hover state. Drop remains React-validated; cancellation cannot install. Dispose cloned materials/overlay objects.
- [x] Readability: brighten PCB and metal surfaces and add fill lighting; move supply parts to unobscured tray positions. Keep one current-step instruction and compact camera buttons. Add browser assertions for closeups, preview, wrong socket, cancel, refresh recovery, re-check after restore, order separation and responsive layout.
- [x] Blender handoff: document node names, anchors, axes, units, source/export locations, material and size budgets and GLB loading ownership without pretending model assets have been created.
- [x] Run focused tests, full tests, production build, asset/build/3D budgets and production 3D browser gate. Inspect screenshots at 1366×768 and 390px. Review diff and update implementation/results documentation.

## Review record

Scope matches approved first phase. Second-phase original Blender model creation and complete mainboard/PSU/cooling workflow are documented follow-up scope, not claimed by this implementation. Existing security and project submission findings remain in the readiness report.

## Verification results, 2026-09-06

- `npm test`: 324 passed, 0 failed (now includes components, motion and scripts).
- `npm run qa:production`: build and production lazy module imports passed; 32/32 browser 3D checks passed, including nested closeup/reset, direct mesh selection, cancel, preview/drop, refresh and order isolation assertions.
- `node scripts/run-browser-qa.mjs scripts/verify-ui.mjs --production`: full platform UI smoke passed.
- `node scripts/run-browser-qa.mjs scripts/verify-performance.mjs --production`: overview 60.45 FPS, 1,834,224 B heap increase over ten lifecycles; assembly 60.40 FPS, 994,968 B heap increase. Both P95 frame intervals 16.7ms on this host.
- Resource/build/3D budgets passed: entry JS 459,170 B; incremental 3D gzip 157,237 B. Circular Three.js build warning eliminated.
- Static reviewer found angular-reset convergence and deferred physical-click camera focus issues; both fixed. Reset regression failed before fix, then passed. Fixed-direction insertion added; wheel cancels pending focus.
- Inspected screenshots at 1366×768 and 390px. Moved the active tray label to the side because it intercepted clicks on a neighboring thin memory model.
- Blender contract delivered in `prototype/docs/blender-asset-contract.md`; no external models or Blender installation added.

Artifacts: `prototype/qa-artifacts/assembly-closeup.png`, `assembly-desktop.png`, `assembly-mobile.png`, and `prototype/qa-artifacts/readiness/improved-*.log`.

