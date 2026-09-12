# Task 4 Report: Restore Native 3D Teaching Interactions

## Status

Implemented and verified Task 4 in the isolated `native-three-optimization` worktree. The public controller signature is unchanged, and no Task 5 dependency removal or chunking work was performed.

## Implementation

- Restored native Three.js connection buses from `CONNECTIONS` with one shared unit `CylinderGeometry`, per-connection basic materials, quaternion orientation, and length/thickness scaling.
- Restored animated data-flow particles with one shared `SphereGeometry` and one material per unique connection color. Frame updates reuse preallocated `Vector3`/`Quaternion` objects and use `(elapsed * 0.3 + index / count) % 1`.
- Added one DOM `.native-bus-label[data-bus-label]` per unique connection label in a container-owned `.native-bus-label-layer`. Labels project connection midpoints through the camera and hide outside clip depth or when X-ray/connections are inactive.
- Added per-mesh retained material variants in `mesh.userData.materials`: cloned base, translucent X-ray, and emissive orange highlight. `setViewState` switches variants and disables bus material depth testing during X-ray.
- Preserved visible-part-only ray picking and exposed `data-part-picking="enabled"` after handlers are installed.
- Recorded OrbitControls changes via `data-camera-changed="true"`.
- Added cancelable `webglcontextlost` handling that calls `onFailure(new Error("WebGL context lost"))`, allowing the React wrapper to render the existing static teaching fallback.
- Added `ResizeObserver` feature detection with a window resize fallback.
- Extended browser QA for X-ray, labels, picking metadata, orbit/zoom, route re-entry with exactly one canvas, and WebGL context loss fallback.
- Added the specified native label styles and made the scene container a positioning context.

## TDD Evidence

### RED

Added Task 4 assertions to `prototype/scripts/verify-3d.mjs` before production changes, then ran `npm run qa:3d`.

- Result: failed, `21/25 passed`.
- Expected missing behaviors failed:
  - `Native bus labels exist`
  - `Canvas exposes native part picking`
  - `Orbit rotation and zoom update the camera`
- The new re-entry path also timed out before its assertion.
- Initial sandboxed run hit `spawn EPERM`; per brief it was rerun with elevated execution so Vite/esbuild and Edge could spawn.

### GREEN

After implementation, the new interaction assertions passed. The remaining re-entry timeout was diagnosed with DOM evidence: the broad `.last()` text filter selected the second locked course because its prerequisite text included the first course title. The QA selector was narrowed to an exact `<strong>` course title and route/canvas transition waits were added.

- Final `npm run qa:3d`: `39/39 passed`, exit 0.
- Native interaction, re-entry, context-loss, initialization-failure cleanup, WebGL-disabled fallback, and hardware builder checks all passed.
- `pageErrors` and `fallbackPageErrors` assertions remained empty.

## Verification

- `node --test src/components/nativeComputerSceneState.test.mjs`: 7/7 passed.
- `npm run qa:3d`: 39/39 passed.
- `npm run build`: exit 0, 4,829 modules transformed; existing >500 kB chunk warning remains (Task 5 scope).
- `npm test`: 279/279 passed, 0 failed.
- `git diff --check`: exit 0 (only line-ending conversion warnings from Git configuration).

## Changed Files

- `prototype/src/components/nativeComputerScene.js`
- `prototype/src/components/NativeComputerScene.jsx`
- `prototype/scripts/verify-3d.mjs`
- `prototype/src/styles.css`

This report is intentionally not included in the Task 4 commit. The pre-existing modification to `.superpowers/sdd/task-2-report.md` was not touched or staged.

## Resource and Cleanup Self-Review

- Shared bus/particle geometries, bus materials, particle materials, and all cloned part material variants are registered immediately with the existing idempotent resource registry.
- Render animation is canceled once; controls are disposed once; registry disposal is idempotent.
- Canvas `click` and `webglcontextlost` listeners are removed if installed.
- OrbitControls `change` listener is removed before controls disposal.
- `ResizeObserver` is disconnected when present; otherwise the exact stored window resize handler is removed.
- Both renderer canvas and label layer are removed during normal unmount, context-loss fallback, StrictMode remount, and initialization rollback.
- The browser QA directly verifies one-canvas re-entry and canvas removal after forced initialization failure.

## Doubts / Follow-up

- Production build still reports the known `OverviewExplodedView` chunk larger than 500 kB. Dependency unloading and chunk work are explicitly deferred to Task 5.
- The browser QA runner prints `The system cannot find the path specified.` after successful completion on Windows, but exits 0 and all 39 checks pass; no page error was recorded.

## Formal Review Follow-up (2026-08-12)

### Review Findings Addressed

- Removed the remaining per-frame connection endpoint allocations. `updateConnections()` no longer calls `getConnectionEndpoint()`, which returned a new array for each endpoint. It now reuses each connection entry's preallocated `from` and `to` vectors and writes coordinates through `writeConnectionEndpoint(target, part, offset, distance)`.
- Static RAF audit also found that `partPosition()` returned one new array per part per frame. Although the formal finding specifically cited connection endpoints, the controller now writes part-group positions directly with `Vector3.set(...)`, so the render loop contains no endpoint/part-position array or `Vector3` construction.
- Added observable material-state browser coverage for X-ray precedence, selected-part highlight restoration after X-ray is disabled, and base-material restoration after selection is cleared.
- Added bus-label coverage for projected visibility, hidden state when X-ray is disabled, and stable DOM element identity across toggles.
- Strengthened context-loss coverage to prove the event default is prevented and both the canvas and label overlay are removed after the fallback transition.

### Follow-up TDD Evidence

RED:

- Added the focused `writeConnectionEndpoint` test first. `node --test src/components/nativeComputerSceneState.test.mjs` failed because the requested export did not exist.
- Added the browser contracts first. `npm run qa:3d` reached `39/45`; the new material-state and projected-label checks failed as expected before observable material metadata/condition waits were implemented. The context-loss `preventDefault` and DOM cleanup checks already passed against the existing production handling.

GREEN / partial integration evidence:

- `node --test src/components/nativeComputerSceneState.test.mjs`: 8/8 passed. The added test proves the helper returns and reuses the supplied target while calculating the exploded endpoint correctly.
- After implementing the in-place helper and material-state metadata, the expanded browser QA reached `44/45`. Every new formal-review contract passed:
  - X-ray projected labels,
  - X-ray material precedence,
  - selected highlight restoration,
  - base material restoration,
  - labels hidden when X-ray is off,
  - stable label identity,
  - context-loss `preventDefault`, fallback, and canvas/overlay cleanup.
- The sole remaining failure was in the pre-existing WebGL-disabled fallback continuation: settlement appeared asynchronously after an instantaneous `isVisible()` check, then intercepted the following return-home click. This was changed to condition-based `waitFor({ state: "visible" })` followed by closing the settlement.

### Verification Blocker / Current Status

The required final `npm run qa:3d` rerun after the settlement synchronization change was rejected by the execution platform because the Codex usage limit had been reached. The rejection explicitly prohibited workaround execution. The parent controller encountered the same limit.

Consequently, the following remain unverified after the final follow-up edits and must be run when execution capacity is available:

- `npm run qa:3d` (expected 45/45; latest actual result before the final synchronization edit was 44/45),
- `npm run build`,
- full `npm test`.

No follow-up commit was created because completion verification could not be performed. The pending production/test changes are:

- `prototype/src/components/nativeComputerScene.js`
- `prototype/src/components/nativeComputerSceneState.js`
- `prototype/src/components/nativeComputerSceneState.test.mjs`
- `prototype/scripts/verify-3d.mjs`

The report remains intentionally uncommitted, and the unrelated pre-existing `.superpowers/sdd/task-2-report.md` change remains untouched.
