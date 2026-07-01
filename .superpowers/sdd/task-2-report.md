# Task 2 Report: Build Sanitized Teacher Assistant Service

## Scope Completed

- Added `prototype/server/teacherAssistant.js`.
- Appended Task 2 coverage to `prototype/server/teacherAssistant.test.mjs`.
- Kept `prototype/server/aiClient.js` unchanged.

## Requirements Implemented

### 1. Sanitized payload builder

Implemented `buildTeacherAssistantPayload(db, classId)` to return:

- `classId`
- `className`
- `summary`
- `challenges`
- `students`

Sanitization boundary:

- Includes class overview data, student identifiers, summary stats, and per-challenge progress.
- Excludes password hashes, session data, cookies, and raw profile fields such as initial passwords.

### 2. Fallback teacher report

Implemented `buildFallbackAssistantReport(payload, reason)` to return a stable fallback response:

- `source: "fallback"`
- `generatedAt`
- `report.lessonFocus`
- `report.riskStudents`
- `report.groupingPlan`
- `report.commonMisconceptions`
- `report.nextClassPlan`
- `report.teacherScript`
- `fallbackReason`

Fallback strings use readable Simplified Chinese instead of mojibake from the brief.

### 3. Required Task 2 exports

Exported the Task 2 surface:

- `buildTeacherAssistantPayload`
- `buildFallbackAssistantReport`
- `parseAssistantJson`
- `generateTeacherAssistantReport`

`parseAssistantJson` and `generateTeacherAssistantReport` are present as skeleton exports for Task 3. `generateTeacherAssistantReport` currently returns the fallback report and defers full AI generation.

## TDD Record

### Red

Added failing tests first:

- `buildTeacherAssistantPayload includes teaching data and excludes secrets`
- `buildFallbackAssistantReport returns usable report shape`

Verified failure with:

```powershell
npm.cmd test -- server/teacherAssistant.test.mjs
```

Observed expected failure:

- `ERR_MODULE_NOT_FOUND` for `prototype/server/teacherAssistant.js`

### Green

Implemented the minimal service module to satisfy Task 2.

Verified targeted suite:

```powershell
npm.cmd test -- server/teacherAssistant.test.mjs
```

Result:

- pass 67
- fail 0

### Full verification

Verified the full prototype suite:

```powershell
npm.cmd test
```

Result:

- pass 67
- fail 0

## Self-Review

- The new payload stays on the teacher-facing aggregate boundary and does not expose secrets from `users`, `sessions`, or student note content.
- The fallback report shape is stable enough for downstream integration.
- Full AI prompt construction, request execution, and JSON parsing behavior remain intentionally deferred to Task 3.

## Concerns

- `generateTeacherAssistantReport` is intentionally fallback-only in this task. Any route that expects live AI output will need Task 3 before it can rely on parsed assistant JSON.
- `CHALLENGES` metadata still contains existing mojibake in source data. This task avoided copying that text into new fallback content, but challenge titles/goals passed through from existing data remain unchanged.
