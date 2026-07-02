# Task 4 Report: Add Teacher Assistant API Endpoint

## Summary

Implemented the teacher-only assistant report API in `prototype/server/app.js` and extended the integration coverage in `prototype/server/app.test.mjs`.

The new endpoint is:

- `POST /api/teacher/classes/:id/assistant-report`

Behavior:

- requires the `teacher` role,
- calls `generateTeacherAssistantReport(db, req.user.id, classId)`,
- returns the report JSON directly on success,
- maps service errors with `error.statusCode` to the matching HTTP response,
- leaves all AI generation logic inside `prototype/server/teacherAssistant.js` unchanged.

## TDD Flow

1. Added failing integration assertions first in `prototype/server/app.test.mjs`:
   - teacher can request `/api/teacher/classes/:id/assistant-report` and receives a fallback report when AI is not configured,
   - student access to the same route is rejected with `403`.
2. Ran:
   - `npm.cmd test -- server/app.test.mjs`
3. Confirmed the red step:
   - the new teacher assertion failed with `404 !== 200`,
   - the cross-role assertion failed with `404 !== 403`.
4. Implemented the minimal route in `prototype/server/app.js`.
5. Re-ran focused endpoint/service verification.

## Verification

Focused verification:

- `npm.cmd test -- server/app.test.mjs server/teacherAssistant.test.mjs`

Result:

- pass, 76/76 tests

## Notes

- Edits were kept within the requested ownership scope:
  - `prototype/server/app.js`
  - `prototype/server/app.test.mjs`
- I did not modify `prototype/server/aiClient.js` or `prototype/server/teacherAssistant.js`.
- There was an unrelated existing modification in `.superpowers/sdd/task-2-report.md`; it was left untouched.

## Controller fix after task review

- Added API-level coverage for `POST /api/teacher/classes/:id/assistant-report` returning `404` when the class does not exist.
- Added API-level coverage for the same endpoint returning `404` when the class exists but belongs to another teacher.
- Corrected this report to reflect the endpoint-focused verification used for the review fix.
- Focused test: `npm.cmd test -- server/app.test.mjs server/teacherAssistant.test.mjs` passed, 76/76.
