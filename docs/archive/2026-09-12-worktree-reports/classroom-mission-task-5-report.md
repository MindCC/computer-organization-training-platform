# Task 5 Report: Resilient Classroom Client State

## Scope

Committed only the five brief files:

- `prototype/src/apiClient.js`
- `prototype/src/classroomSessionState.js`
- `prototype/src/classroomSessionState.test.mjs`
- `prototype/src/hooks/useClassroomSession.js`
- `prototype/src/hooks/useTeacherSession.js`

The pre-existing `.superpowers/sdd/task-2-report.md` and `.superpowers/sdd/task-4-report.md` working-tree changes were not modified or staged.

## TDD evidence

### Initial RED

`node --test --test-isolation=none src/classroomSessionState.test.mjs` failed with `ERR_MODULE_NOT_FOUND` because `classroomSessionState.js` did not yet exist.

### Initial GREEN

The focused classroom client-state suite passed `10/10`. It covered pending-submission persistence, idempotent retries, server error normalization, and the student session view model.

### Review regression RED/GREEN

The first review found stale cross-scope state, retry-policy, and read-vs-mutation races. Regression tests first failed because `createLatestRequestGuard` was not exported, then passed `12/12` after adding the request guard, scope resets, retry eligibility, and stale-read protection.

The second review found mutation-vs-mutation overlap. A new regression test first failed because `createSingleFlight` was not exported, then passed `13/13` after coalescing overlapping student submission/retry work and teacher create/control mutations.

### Final focused GREEN

`node --test --test-isolation=none src/classroomSessionState.test.mjs`: `13/13` passed, `0` failed.

### Full GREEN

`npm test`: `187/187` passed, `0` failed, exit `0`.

### Build

`npm run build`: exit `0`. The only output of note was the existing `computerParts` chunk-size warning above 500 kB.

### Diff checks

`git diff --check` and `git diff --cached --check`: both exited `0`.

## Review and residual risk

The final read-only re-review reported no remaining Critical or Important findings and assessed the slice Ready. It specifically confirmed that `createSingleFlight` resolves the prior student submission/retry and teacher create/control mutation-overlap races.

The hooks are client-state building blocks and are not wired into a page by this task, so lifecycle behavior is protected through focused pure-state tests rather than a DOM hook runner. No new dependency, WebSocket, or SSE was added.

## Commit

- Commit: `a9ca604684694b58c9d4a2783e3b388453ec0eef`
- Message: `feat: add resilient classroom client state`

## Lifecycle hardening follow-up (2026-07-16)

### Scope

Addressed the six follow-up findings without amending `a9ca604`:

- Student user-scope changes now synchronously invalidate request work, clear refs, and mask every old visible field before effects run.
- Pending submissions detach when the session is not submit-capable or the active key no longer matches the current stage. Storage is retained, but retry requires the enabled current user/session/stage and live in-progress state.
- Teacher class scopes synchronously isolate selection, overview, report, errors, timestamps, loading, refs, and stale callbacks while leaving filters outside scoped state.
- Report loads use request revision, class/session/selection scope, and loading ownership guards.
- The student HTTP envelope remains exactly `{ session, studentState, mission }`; `session.remaining_seconds` is calculated by the service, mapped by the route, and consumed by the client view model.
- Teacher mutations use stable keyed coalescing for identical operations and a FIFO queue for distinct operations, preserving separate promises/results.

### RED evidence

Focused client RED:

`node --test --test-isolation=none src/classroomSessionState.test.mjs src/classroomHookLifecycle.test.mjs`

- Exit `1`; `19` tests, `13` passed, `6` failed.
- Five lifecycle/controller assertions reported `actual: "undefined", expected: "function"`.
- The countdown contract assertion reported `2100 !== 321`, proving the old top-level field was still consumed.

Real HTTP RED (rerun outside the Windows sandbox after the sandboxed runner hit `spawn EPERM`):

`node --test --test-name-pattern="teacher and student complete a classroom mission through the HTTP API" server/app.test.mjs`

- Exit `1`; `1/1` failed with `undefined !== 600` for `session.remaining_seconds`.

### GREEN verification

- Hook syntax: `node --check src/hooks/useClassroomSession.js` and `node --check src/hooks/useTeacherSession.js` both exit `0`.
- Focused client: `21/21` passed, `0` failed.
- Focused real HTTP clock/envelope flow: `1/1` passed; countdown changed from `600` to `525` after advancing the injected clock by `75` seconds.
- Full `npm test`: `195/195` passed, `0` failed, exit `0`.
- `npm run build`: exit `0`; only the existing `computerParts` chunk-size warning remained.

The repository has no `jsdom` or `react-test-renderer`, so lifecycle behavior is exercised through production scope/controller primitives actually used by the hooks, deferred promises, and a thin ReactDOMServer hook wiring render. No dependency or browser was added.

### Final reviewer hardening and real hook lifecycle coverage

The independent follow-up review identified three Important gaps and one required pending-stage recovery correction:

- React StrictMode effect cleanup invalidated the hook scope without restoring it during setup replay.
- Report loading allowed a requested session ID that differed from the current teacher selection.
- The earlier server-render/controller tests did not mount the hooks through real browser effect lifecycles.
- A stage-key mismatch detached the old pending request but failed to recover persisted work for the current stage.

Each finding received a focused RED before the production correction. The final implementation restores the render scope during effect setup, clears obsolete flights during cleanup, requires report target/selection identity, recovers only the current stage's persisted request, and retains class/user/request revision guards.

Real Playwright RED:

`node --test --test-isolation=none src/classroomHookPlaywright.test.mjs`

- Exit `1`; `0` passed, `5` failed, `2` cancelled.
- StrictMode replay left the student selection at `null` instead of session `11`.
- A mismatched report target still issued one request instead of zero.
- The initial test fixture exposed stale hook callbacks across remount timing; after correcting that timing, the remaining production lifecycle failures were isolated directly.

The standalone Vite + Playwright fixture mounts the actual `useClassroomSession` and `useTeacherSession` hooks under React StrictMode and controllable deferred API promises. It covers StrictMode replay, report target selection, class isolation with filter persistence, report/mutation races, keyed FIFO mutation promises, and stale student loads after a user switch. No dependency or in-app browser was added.

### Final fresh verification

- Pure/focused client lifecycle and state tests: `23/23` passed, `0` failed.
- Real Playwright hook lifecycle suite: `7/7` passed, `0` failed, `0` cancelled.
- Controlled-clock HTTP mission flow: `1/1` passed; exact envelope retained and `session.remaining_seconds` changed `600 -> 525` after `75` seconds.
- Full `npm test`: `204/204` passed, `0` failed, exit `0`.
- `npm run build`: exit `0`; `5332` modules transformed. The only warning was the existing `computerParts` chunk above 500 kB.
- Final `git diff --check`: exit `0` with line-ending notices only.

### Hardening commit

- Commit: `ac80312`
- Message: `fix: harden classroom hook lifecycles`

The report files remain intentionally unstaged.

## Serialized classroom client work follow-up (2026-07-16)

The formal review follow-up corrected the remaining client concurrency and test-lifecycle gaps:

- Student retries share the exact pending submission promise only for the same storage key and client submission UUID. A different concurrent submit now rejects with `CLASSROOM_SUBMISSION_BUSY` and `retryable: false` before pending storage or refs can change.
- Teacher create, control, and report work now shares one keyed FIFO. Report execution revalidates the active class scope and current selection before issuing a request.
- The Playwright harness registers Vite, browser, and page resources immediately after allocation and closes every registered resource in reverse order even when setup or cleanup fails. Primary and cleanup failures are preserved, including falsy JavaScript rejection values.
- Fixed-duration waits were replaced with render revisions and exact observable-state conditions.

### Follow-up RED/GREEN evidence

- Student submission RED: focused Playwright failed because different submissions shared a promise. GREEN: `2/2` passed, including exact retry promise identity, distinct busy rejection, and direct `localStorage` ownership/payload assertions.
- Teacher serialization RED: focused Playwright failed because a report started while mutation work was active. GREEN: `2/2` passed for control/report and create/report ordering.
- Resource cleanup RED: the initial cleanup test failed before the resource stack existed; the falsy-primary regression subsequently failed with the primary `null` missing from `AggregateError.errors`. GREEN: all four cleanup tests passed, covering reverse all-attempt cleanup, falsy primary, primary-only, and cleanup-only failures.

### Final verification and review

- Real Playwright hook lifecycle suite: `9/9` passed, `0` failed, `0` cancelled.
- Full `npm test`: `210/210` passed, `0` failed, exit `0`.
- `npm run build`: exit `0`; `5332` modules transformed. The only warning was the existing chunk above 500 kB.
- Final `git diff --check`: exit `0` with line-ending notices only.
- Independent review: no Critical or Important findings. The single Minor falsy-primary cleanup issue and its identified test gaps were fixed before commit.

### Follow-up commit

- Commit: `17d8679`
- Message: `fix: serialize classroom client work`

The report files remain intentionally unstaged.

## Retry and report ownership hardening follow-up (2026-07-17)

The final formal review found two remaining Important races:

- A retained student submission could be replayed after a terminal or otherwise non-retryable failure because replay eligibility was inferred only from the current classroom context.
- A teacher report shared the overview request revision and boolean loading owner, so a newer public overview refresh could suppress the report commit or release loading while the report remained active.

### Final RED evidence

Student RED:

`$env:CLASSROOM_HOOK_CASE='terminal student failures'; node --test --test-isolation=none src/classroomHookPlaywright.test.mjs`

- Exit `1`.
- The focused assertion at `src/classroomHookPlaywright.test.mjs:242:14` failed with `1 !== 0`, proving `retryPending()` issued a second submit after `SESSION_ENDED`.

Teacher RED:

`$env:CLASSROOM_HOOK_CASE='teacher report ownership'; node --test --test-isolation=none src/classroomHookPlaywright.test.mjs`

- Exit `1`.
- The focused assertion at `src/classroomHookPlaywright.test.mjs:356:14` failed with `false !== true`, proving overview completion released loading while a report was still pending.

Both standalone Playwright commands initially encountered the Windows sandbox's `spawn EPERM` restriction and were rerun outside that sandbox with the installed Playwright/Vite toolchain.

### Final GREEN verification

- Terminal manual replay, later ordinary-submit blocking, and network/explicit-retryable replay focused cases each passed `2/2`.
- Teacher report/overview ownership focused case passed `2/2`.
- Complete real Playwright hook suite: `13/13` passed, `0` failed, `0` cancelled.
- Pure classroom state and lifecycle suites: `23/23` passed, `0` failed.
- Full `npm test`: `214/214` passed, `0` failed, exit `0`.
- `npm run build`: exit `0`; `5332` modules transformed. The only warning was the existing `computerParts` chunk above 500 kB.
- Final scoped `git diff --check`: exit `0` with line-ending notices only.

Student failures now persist an explicit replayability decision alongside the exact retained UUID and payload. Terminal/unknown retained work stays in storage for safety but cannot be replayed manually or transparently reused by an ordinary submit; network and explicitly retryable failures retain their original replay identity. Teacher reports now own an independent request revision and overlap-aware loading count, while class/selection invalidation and the existing mutation FIFO remain intact.

### Retry ownership commit

- Commit: `09c85bc`
- Message: `fix: close classroom retry races`

The report files remain intentionally unstaged.

## Persisted replay, operation order, and harness isolation follow-up (2026-07-17)

A post-commit formal review identified two remaining specification gaps and one test-quality gap:

- A crash could leave a valid in-flight pending record without a replay marker, causing reload recovery and legacy records to be blocked permanently.
- The keyed mutation queue coalesced matching keys across intervening work, so `pause -> resume -> pause` dropped the final pause.
- The real-hook fixture retained unresolved requests, deferred entries, and local storage across subtests.

### Final follow-up RED evidence

Queue pure RED:

`node --test --test-isolation=none --test-name-pattern="non-adjacent repeated" src/classroomHookLifecycle.test.mjs`

- Exit `1`.
- `src/classroomHookLifecycle.test.mjs:178:10` failed because `firstPause` and `finalPause` were reference-equal pending promises.

Teacher real-hook RED:

`$env:CLASSROOM_HOOK_CASE='pause resume pause'; node --test --test-isolation=none src/classroomHookPlaywright.test.mjs`

- Exit `1`.
- `src/classroomHookPlaywright.test.mjs:443:14` failed with `0 !== 1`, proving no second pause request was issued after resume.

Reload replay RED:

`$env:CLASSROOM_HOOK_CASE='persisted unresolved reload'; node --test --test-isolation=none src/classroomHookPlaywright.test.mjs`

- Exit `1`.
- `src/classroomHookPlaywright.test.mjs:265:14` failed with `undefined !== true`, proving the crash-surviving in-flight record lacked an explicit replayable marker; the restored retry also issued no request.

Harness-isolation RED:

`$env:CLASSROOM_HOOK_CASE='harness isolation'; node --test --test-isolation=none src/classroomHookPlaywright.test.mjs`

- Exit `1`.
- The first case intentionally left an unresolved request and dirty storage; the next case failed at `src/classroomHookPlaywright.test.mjs:56:14` with `1 !== 0`.

### Final follow-up GREEN verification

- Pure classroom state and lifecycle suites: `24/24` passed, including adjacent identical promise identity and non-adjacent repeated FIFO work.
- Complete real Playwright hook suite: `18/18` passed, `0` failed, `0` cancelled.
- Reload recovery replayed the exact original submission UUID; legacy missing-marker records remained replayable; explicit terminal records remained blocked.
- Real teacher controls issued and committed all three `pause -> resume -> pause` operations, ending paused.
- Per-case harness reset cleared the React root, request list, deferred map, counters, result state, and local storage; the deliberate cross-case isolation pair passed.
- Full `npm test`: `220/220` passed, `0` failed, exit `0`.
- `npm run build`: exit `0`; `5332` modules transformed. The only warning was the existing `computerParts` chunk above 500 kB.
- Final scoped `git diff --check`: exit `0` with line-ending notices only.

New pending records are persisted as replayable while unresolved, and only an explicit `replayable: false` marker blocks ordinary or manual replay. The mutation queue now coalesces only the adjacent tail entry, preserving literal promise identity for immediate duplicates without dropping later repeated controls.

### Operation-order commit

- Commit: `3103847`
- Message: `fix: preserve classroom operation order`

The report files remain intentionally unstaged.
