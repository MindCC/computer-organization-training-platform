# Task 2 Report: SQLite Schema and Classroom Session Repository

## Scope

Implemented Task 2 only in the isolated worktree:

`D:\workspace\zcyl_training\.worktrees\classroom-mission-loop`

No runtime dependency was added. No Task 3 route, service, grading, polling, WebSocket, SSE, queue, client asset, or UI work was introduced.

## Modified Files

- `prototype/server/db.js`
  - Configures `busy_timeout = 5000` after foreign-key enforcement.
  - Creates the exact approved `classroom_sessions` and `student_session_states` schemas.
  - Adds compatible nullable `session_id` and `client_submission_id` columns to legacy `challenge_attempts` tables.
  - Adds the active-session, submission-idempotency, and student-session lookup indexes.
- `prototype/server/classroomSessionRepository.js`
  - Exports `createClassroomSessionRepository(db)` with the required 11-method surface.
  - Uses transactions for draft/member snapshots and lazy late-member state creation.
  - Persists compare-and-set transitions, attempt lookup, rewards/progress, frozen reports, and teacher overview reads.
- `prototype/server/classroomSessionRepository.test.mjs`
  - Uses real in-memory SQLite databases.
  - Covers old-database migration, repeat migration, exact schemas, busy timeout, partial-index semantics, all repository methods, late class membership, report freezing, and deterministic overview ordering.

## TDD Record

### Initial RED

Command:

```powershell
cd prototype
node --test server/classroomSessionRepository.test.mjs
```

The sandboxed run first failed with `spawn EPERM`; per the task instructions, the same command was rerun with escalated process-spawn permission.

Expected failure after escalation:

- Exit code: `1`
- Reason: `ERR_MODULE_NOT_FOUND` for `prototype/server/classroomSessionRepository.js`.
- Interpretation: the tests exercised the requested repository module before any production implementation existed.

### Review-driven late-member RED

Command:

```powershell
cd prototype
node --test server/classroomSessionRepository.test.mjs
```

Expected failure:

- 4 passed, 1 failed.
- The student joined after draft creation; `enterStudent(...)` returned no state.
- Assertion showed actual `undefined` versus expected `"in_progress"`.

Minimal fix:

- Added transactional state creation constrained by the session's class membership before the enter update.

### Read-time late-member RED

Command:

```powershell
cd prototype
node --test server/classroomSessionRepository.test.mjs
```

Expected failure:

- 5 passed, 1 failed.
- `findCurrentForStudent(...)` found the live session but had not persisted the required `not_started` state.
- Assertion showed actual `undefined` versus expected `"not_started"`.

Minimal fix:

- Extracted a private `ensureStudentState` helper.
- `findCurrentForStudent` now discovers the active session and lazily snapshots the member as `not_started` inside one transaction.
- `enterStudent` separately reuses the helper and then changes the state to `in_progress`, keeping discovery distinct from entry.

### Incidental test-fixture correction

The first strengthened index-semantics run hit `SQLITE_CONSTRAINT_FOREIGNKEY` because the test inserted attempts for placeholder student IDs. The fixture was corrected to create real student rows; no production code was changed for this setup error.

### Atomic classroom migration RED

Command:

```powershell
cd prototype
node --test server/classroomSessionRepository.test.mjs
```

Expected failure after rerunning outside the Windows sandbox (the sandboxed runner returned `spawn EPERM`):

- 5 tests passed and 2 tests failed.
- The idempotency test found no stable `2026071501` migration row.
- The rollback test reported `Missing expected exception` because migration never inserted the version row and therefore never triggered the forced failure.

Minimal fix:

- Added stable version `2026071501` with name `classroom_mission_loop`.
- Kept base `schema_migrations` creation in the base schema phase.
- Moved both classroom tables, the two compatible `challenge_attempts` columns, all three classroom indexes, and the version insert into one SQLite transaction.
- Added an applied-version check so a successful classroom migration is skipped on repeat calls.
- A forced version-insert failure now rolls back the classroom tables, columns, indexes, and version row together.

## GREEN and Verification

### Focused GREEN

Command:

```powershell
cd prototype
node --test server/classroomSessionRepository.test.mjs
```

Final result:

- 7 tests passed.
- 0 tests failed, cancelled, or skipped.

Coverage includes:

- Migration of an old `challenge_attempts` table and a second idempotent migration.
- Exact classroom table columns and `busy_timeout = 5000`.
- Duplicate non-null submission IDs rejected per student; different students and repeated `NULL` values allowed.
- Multiple drafts allowed; a second live/paused session for the same class rejected; another class allowed its own active session.
- Exact 11-method repository surface.
- Draft member snapshots, late-member discovery as `not_started`, and entry as `in_progress`.
- Student current-session discovery, class conflict lookup, compare-and-set transitions, duplicate-attempt lookup, reward updates, first-report freezing, and overview ordering.

### Full Test Suite

Command:

```powershell
cd prototype
npm test
```

Final result:

- 148 tests passed.
- 0 tests failed, cancelled, or skipped.

The full Node test runner required escalated process-spawn permission on Windows because the default sandbox returned `spawn EPERM` for per-file workers.

### Diff Check

Command:

```powershell
git diff --check
```

Result:

- Exit code: `0`.
- No whitespace errors.
- Git emitted only the existing Windows line-ending notice that LF may later be converted to CRLF.

### Code Review

The final read-only review reported:

- Critical: none.
- Important: none.
- Minor: none.
- Assessment: `Ready: yes`.

## Commit

- Commit: `aaac70685823596c3bd3432b61b431486b890e3a`
- Subject: `feat: persist classroom mission sessions`
- Committed files: exactly the three Task 2 files listed above.

Atomic migration follow-up:

- Commit: `f3faeabd0fda0589734d04b1b3e394fafc839afa`
- Subject: `fix: make classroom migration atomic`
- Committed files: exactly `prototype/server/db.js` and `prototype/server/classroomSessionRepository.test.mjs`.

## Remaining Risks

- State-machine legality, teacher/student authorization, grading transactions, automatic timeout settlement, and HTTP error mapping remain intentionally owned by later service/route tasks; this repository provides persistence primitives and compare-and-set behavior only.
- `findCurrentForStudent` can perform one small idempotent insert on first discovery for a late member. This is required by the approved design and bounded by the membership query, primary key, transaction, WAL mode, and 5-second busy timeout, but later load testing should still exercise the full route under the planned classroom concurrency.
- Repository rows intentionally retain SQLite snake_case fields and serialized JSON. Later service code must parse and adapt those fields without expanding server-owned payloads beyond the 64 KB evidence/result limits and other approved constraints.
