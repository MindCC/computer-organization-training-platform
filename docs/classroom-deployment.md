# Classroom Mission Operations Guide

## Overview

The classroom mission loop adds a teacher-led, game-inspired four-stage session flow. Teachers create, start, pause, resume, and end sessions. Students auto-discover active sessions, enter idempotently, submit evidence through their existing lab workspace, and receive XP, stars, badges, and settlement reports.

## Mission Template

The fixed "computer-data-flow" template has four stages:
1. **认识五大部件** (participation) — 3D exploration + static fallback
2. **观察程序执行** (circuit) — circuit drawing + test cases
3. **区分指令与数据** (circuit) — circuit drawing + test cases
4. **完成综合数据流实训** (circuit) — circuit drawing + test cases

## Polling

- Student and teacher pages poll every **15 seconds** while visible (`document.visibilityState === "visible"`).
- Expiry is checked on every read (no background timer). When a session's live time exceeds its duration, it auto-ends on the next access.

## Scaling

- Target: **150 students** with at most **30 concurrent submissions**.
- Verified: P95 ≤ 17ms, zero SQLITE_BUSY, zero 5xx.
- Single `better-sqlite3` database with WAL mode and `busy_timeout = 5000`.

## Session Lifecycle

```
draft → live ↔ paused → ended
```

- `draft`: teacher has created but not started. Students cannot see it.
- `live`: students can enter and submit.
- `paused`: submissions are rejected (HTTP 409, SESSION_PAUSED). Canvas and local state preserved.
- `ended`: frozen. Students see settlement; teacher sees report.

Only `live` time counts toward duration. Pause stops the clock.

## Database

Before running the classroom feature for the first time, back up `data/classroom.sqlite`. The migration adds two tables (`classroom_sessions`, `student_session_states`) and two columns to `challenge_attempts` (`session_id`, `client_submission_id`). Existing `challenge_attempts` rows get `NULL` for these columns — ordinary practice continues normally.

If migration fails, the server exits with a clear error.

## API Error Codes

| Code | HTTP | Message |
|------|------|---------|
| SESSION_PAUSED | 409 | 课堂任务已暂停 |
| SESSION_ENDED | 409 | 课堂已结束 |
| STAGE_MISMATCH | 409 | 课堂阶段不匹配 |
| NOT_CLASS_MEMBER | 403 | — |
| SESSION_NOT_FOUND | 404 | 课堂场次不存在 |
| SESSION_NOT_ENDED | 409 | 课堂报告尚未生成 |
| INVALID_SESSION_CONFIG | 400 | — |
| INVALID_SESSION_TRANSITION | 409 | 不允许的操作 |

## QA Gates

Run before any deployment:

```bash
npm test
npm run qa:assets
npm run build
npm run qa:classroom-load  # 150 students, P95 ≤ 2000ms
```

Browser-based gates (require a display or headless browser):

```bash
npm run qa:ui
npm run qa:3d
npm run qa:performance
npm run qa:classroom
```

## Rollback

To roll back: restore the backed-up SQLite file. The migration is additive and backward-compatible — old clients submit without `clientSubmissionId` and continue working as ordinary practice.
