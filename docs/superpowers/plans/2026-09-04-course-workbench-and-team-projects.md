# 课程工作台与小组项目 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让教师可以审核、发布课程草稿并管理小组项目；让学生完成受控的 3D 课程引导和个人里程碑提交；在教师看板看到可评价的项目进度。

**Architecture:** 在现有 Express 的 repository → service → router 边界新增 course workbench 模块。SQLite 保存不可变的已发布课程、项目小组和个人提交；React 以独立懒加载面板接入既有教师看板、学生首页和 3D 总览。AI 仅返回经过同一校验器处理的课程草稿建议，永不直接发布或执行场景代码。

**Tech Stack:** React 19、Vite、Express 5、better-sqlite3、Three.js、Node test runner、Playwright。

## Global Constraints

- 已发布课程只读；修改必须从已发布课程复制出新的草稿。
- 第一版只支持 `computer-components` 3D 总览作为引导目标；脚本动作必须限制为 `highlightPart`、`setXray`、`showHint`、`none`。
- 所有身份、班级、成员关系和评分从会话与数据库派生，绝不信任请求体中的 ID 或分数。
- 所有写操作都走现有 CSRF 中间件、无自动重试，并写入审计日志。
- 学生交付只保存文本和 HTTPS 链接说明；不添加文件上传、自动分组、语音或 PPT 导入。

---

## Proposed API contract

Teacher endpoints, all requiring the current teacher to own `:classId` or resource:

```text
POST /api/teacher/classes/:classId/course-drafts/generate
POST /api/teacher/classes/:classId/course-drafts
GET  /api/teacher/classes/:classId/course-drafts
GET  /api/teacher/course-drafts/:id
PUT  /api/teacher/course-drafts/:id
POST /api/teacher/course-drafts/:id/publish
POST /api/teacher/course-drafts/:id/project/teams
PUT  /api/teacher/project-teams/:id/members
POST /api/teacher/project-submissions/:id/review
```

Student endpoints, all scoped to the authenticated student:

```text
GET  /api/student/projects
GET  /api/student/projects/:id
POST /api/student/projects/:projectId/milestones/:milestoneId/submission
```

`POST .../generate` accepts only `{ title, summary, learningObjectives, guideChallengeId }`, returns a saved `draft` and reports `source: "ai" | "fallback"`. It never receives student work. Draft create/update accepts the validated shape:

```js
{
  title, summary, learningObjectives: ["..."],
  guideChallengeId: "computer-components",
  guideScript: [{ id, title, instruction, action: { type, partId?, enabled?, text? }, completion }],
  assignmentOutline: { title, description },
  projectOutline: { title, description, milestones: [{ id, title, description, dueAt? }] }
}
```

Team creation accepts `{ name, members: [{ studentId, role }] }`; member replacement accepts the full validated list. A milestone submission accepts `{ reflection, evidenceUrl, clientSubmissionId }`. Reusing an existing `clientSubmissionId` returns its stored result; a student cannot replace a reviewed submission.

## Implementation tasks

### Task 1: Define the course-workbench domain contract and tests

**Files:**
- Create: `prototype/server/courseWorkbench.js`
- Create: `prototype/server/courseWorkbench.test.mjs`
- Modify: `prototype/server/teacherAssistant.js`
- Modify: `prototype/server/teacherAssistant.test.mjs`

- [ ] Write focused failing tests for `normalizeCourseDraftPayload` before implementation: reject blank title/objectives, reject a non-`computer-components` guide target, reject unknown computer part IDs, reject an action outside the whitelist, reject missing project milestones, and normalize whitespace/optional HTTPS evidence links.
- [ ] Add `COURSE_GUIDE_CHALLENGE_ID = "computer-components"`, action/completion allow-lists, payload size limits, and a JSON-safe normalizer in `courseWorkbench.js`. Import `COMPUTER_PARTS` to build the valid part-ID set; do not copy the part list into the server.
- [ ] Make action data explicit and inert:

```js
{ type: "highlightPart", partId: "cpu" }
{ type: "setXray", enabled: true }
{ type: "showHint", text: "观察 CPU 与内存之间的总线。" }
{ type: "none" }
```

- [ ] Add `buildCourseDraftMessages`, `parseCourseDraftJson`, and `generateCourseDraftSuggestion` beside the existing teacher-assistant helpers. Use `readDeepSeekConfig` / `requestChatCompletion`, require JSON with the full normalized shape, and return a deterministic manual template on disabled AI, invalid JSON, or provider failure.
- [ ] Keep the generated result separate from the persistence operation. The service will normalize it again before saving, so a model response can never bypass validation.
- [ ] Run `node --test server/courseWorkbench.test.mjs server/teacherAssistant.test.mjs` and confirm the new fallback cases pass.

### Task 2: Add durable SQLite storage and repository operations

**Files:**
- Modify: `prototype/server/db.js`
- Create: `prototype/server/courseWorkbenchRepository.js`
- Create: `prototype/server/courseWorkbenchRepository.test.mjs`

- [ ] Extend `migrate(db)` with `course_drafts`, `team_projects`, `project_teams`, `project_team_members`, and `project_milestone_submissions`, plus indexes on class, project, team and student lookup paths. Use foreign keys with `ON DELETE CASCADE` for course-owned data and a `UNIQUE(team_id, student_id)` membership constraint.
- [ ] Persist draft JSON in `*_json` columns and add `guide_challenge_id TEXT NOT NULL DEFAULT 'computer-components'`. Existing databases receive it through `ensureColumn`; fresh databases get it in the create-table statement.
- [ ] Model project milestones as immutable JSON on `team_projects`. Store each member’s own deliverable in `project_milestone_submissions` with `status IN ('draft','submitted','reviewed')`, `client_submission_id`, timestamps, teacher feedback and `UNIQUE(team_project_id, milestone_id, student_id)`.
- [ ] Add a partial unique index for non-null `(student_id, client_submission_id)` so a retried submission returns the existing row without duplicating it.
- [ ] Implement repository methods for creating/listing/fetching drafts, atomically publishing a draft with its project, creating/replacing teams, fetching teacher/student project views, upserting a student submission, reviewing it, and calculating status counts. Parse JSON only at repository DTO boundaries.
- [ ] Test migration idempotency, cascade behavior, published-data retrieval, team member uniqueness, and client submission idempotency with an in-memory database.

### Task 3: Implement authorization, lifecycle rules, and audit-aware HTTP routes

**Files:**
- Create: `prototype/server/courseWorkbenchService.js`
- Create: `prototype/server/courseWorkbenchRoutes.js`
- Create: `prototype/server/courseWorkbench.test.mjs`
- Modify: `prototype/server/app.js`

- [ ] Implement service guards that return the same safe 404 used by `assignmentService.js` when a teacher does not own a class/draft/project or a student is not a member of the course class and assigned project team.
- [ ] Enforce draft-only update, `draft → published` only, one project per published draft, non-empty project milestones before publish, and no team creation before publication. Publishing must run in one SQLite transaction.
- [ ] On publication, create the `team_projects` row from the draft’s project outline but no teams. This makes project definition immutable while allowing the teacher to form teams later.
- [ ] Permit a student to create/update only their own `draft`/`submitted` milestone record. A reviewed record is immutable. Validate `clientSubmissionId` length and URL protocol server-side.
- [ ] Register `createCourseWorkbenchRouter({ service, requireRole, audit })` after the existing assignment router in `app.js`. Pass `options.generateCourseDraftSuggestion` and `options.courseAssistantOptions` into the service for deterministic tests.
- [ ] Emit audit events: `course_draft_created`, `course_draft_generated`, `course_draft_updated`, `course_draft_published`, `project_team_created`, `project_team_members_replaced`, `project_submission_saved`, and `project_submission_reviewed`. Metadata contains resource IDs/status only, never reflection text or credentials.
- [ ] Mirror `assignment.test.mjs` with HTTP tests for the complete teacher → publish → team → student submit → teacher review flow, plus forged IDs, cross-class reads, unpublished course reads, invalid guide actions, repeated client IDs, and AI fallback.
- [ ] Run `node --test server/courseWorkbench*.test.mjs server/assignment.test.mjs`.

### Task 4: Add frontend API methods and pure client view models

**Files:**
- Modify: `prototype/src/apiClient.js`
- Create: `prototype/src/courseWorkbenchState.js`
- Create: `prototype/src/courseWorkbenchState.test.mjs`

- [ ] Add API client methods matching the contract above. All writes use existing `apiRequest` POST/PUT behavior, so they have no automatic retry.
- [ ] Build pure helpers that convert server DTOs into safe display data: `buildTeacherCourseSummary`, `buildStudentProjectSummary`, `getActiveGuideForChallenge`, `canEditMilestoneSubmission`, and `nextGuideStep`.
- [ ] `getActiveGuideForChallenge` must select only a published project/course whose `guideChallengeId` equals the open challenge; it returns `null` when there are no applicable guides.
- [ ] Test empty state, all three submission states, a closed/reviewed form, guide completion progression, and a malformed server DTO degrading to an empty panel instead of throwing.

### Task 5: Build the teacher course workbench

**Files:**
- Create: `prototype/src/components/TeacherCourseWorkbench.jsx`
- Create: `prototype/src/components/TeacherCourseWorkbench.test.mjs`
- Modify: `prototype/src/components/TeacherDashboard.jsx`
- Modify: `prototype/src/styles.css` (or the existing stylesheet that defines `teacher-studio-*` classes)

- [ ] Add `TeacherCourseWorkbench` below `TeacherAssignments` when a class is selected. It owns fetch/loading/error state and refreshes only its class after a successful write.
- [ ] Provide draft-list, new-draft form, AI suggestion button, editor, save, and a publish confirmation with an explicit summary of guide target, step count, and milestone count. Disable publication until title, an objective, valid guide script, and at least one project milestone exist.
- [ ] Add team management after publication: show unassigned students from `classOverview.students`, allow roles `协调`, `实验`, `记录`, `汇报`, submit a full member list, and show per-team milestone status counts and review links.
- [ ] Escape all user-entered text through normal React rendering; display no generated HTML. Keep raw JSON out of the teacher workflow.
- [ ] Write component tests for validation gating, fallback draft rendering, publish confirmation, and refreshed state after a saved team.

### Task 6: Build the student project experience

**Files:**
- Create: `prototype/src/components/StudentProjects.jsx`
- Create: `prototype/src/components/StudentProjects.test.mjs`
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/components/StudentHome.jsx`
- Modify: `prototype/src/styles.css`

- [ ] Add a lazy `StudentProjects` view and the `projects` student navigation item in `App.jsx`. It loads `/api/student/projects`, renders only the current student’s teams, and uses a project-detail view for milestones.
- [ ] Add a compact “小组项目” card to `StudentHome` that exposes project count, the next due milestone, team name, and an `onOpenProjects` callback. It must render an honest empty state for students without a published team.
- [ ] In the project view, show project brief, role, roster names, milestone states, individual reflection textarea, optional HTTPS evidence URL, prior feedback, and an explicit submit/save affordance. Lock inputs for reviewed work and after request in flight.
- [ ] Use an UUID generated in the browser per intentional submit and retain it until the response resolves; this supplies the API’s idempotency key without storing user content locally.
- [ ] Test role/milestone render states, no-team empty state, reviewed form lock, invalid URL feedback, and success update behavior.

### Task 7: Interpret approved guide scripts inside the existing 3D overview

**Files:**
- Modify: `prototype/src/components/OverviewExplodedView.jsx`
- Create: `prototype/src/components/courseGuideState.js`
- Create: `prototype/src/components/courseGuideState.test.mjs`
- Create: `prototype/src/components/CourseGuidePanel.jsx`
- Modify: `prototype/src/components/LabPage.jsx`
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`

- [ ] Extract the hard-coded assembly steps into a retained default export, then derive a guide state machine that accepts only normalized server steps. It may set the existing `selectedPart`, `xray`, and hint UI state; it must never call Three.js APIs directly or evaluate strings.
- [ ] Implement `CourseGuidePanel` as a closable, keyboard-accessible side panel showing one title/instruction, progress, “我已完成这步” for `acknowledge`, and a read-only completion signal for `challengeComplete` based on the current record.
- [ ] Pass active guides from `App.jsx` to `LabPage.jsx`, then to `OverviewExplodedView`. When a guide action applies, highlight the requested part using the current `selectedPartId` path, switch the existing X-ray control, or render a text hint. Closing the panel must not stop the base 3D scene or change normal grading.
- [ ] Preserve WebGL failure behavior: `NativeComputerScene` continues to render `ThreeSceneFallback`; the guide panel still shows its explanatory text but never claims 3D action completed solely because it was shown.
- [ ] Test the reducer against every action, step ordering, close/reopen behavior, `challengeComplete` gating, reduced motion, and unknown action rejection.

### Task 8: Add project visibility to teacher overview and document operations

**Files:**
- Modify: `prototype/src/components/TeacherDashboard.jsx`
- Modify: `prototype/README.md`
- Modify: `prototype/.env.example` if AI variables are not already documented

- [ ] Add a small course/project summary to the existing class overview: published course count, teams formed, unassigned students, and submitted/reviewed milestone counts. Fetch it through the workbench API rather than altering existing classroom analytics DTOs.
- [ ] Document how to create a draft manually, how the optional AI suggestion falls back, guide-action limitations, team formation, and the no-binary-upload boundary. Document the existing DeepSeek environment configuration without echoing keys.

### Task 9: Run end-to-end visual and regression verification

**Files:**
- Create: `prototype/scripts/verify-course-workbench.mjs`
- Modify: `prototype/scripts/run-browser-qa.mjs`
- Modify: `prototype/package.json`

- [ ] Add `qa:course-workbench` that starts the existing application through the browser QA harness, creates a class/course/team with test accounts, verifies student project visibility and reflection submission, reviews it as teacher, and captures teacher/student screenshots for visual inspection.
- [ ] Extend the existing 3D QA only with guide-specific assertions: native canvas remains present, the CPU highlight and X-ray change are observable, the guide can close, and the static fallback keeps its text when WebGL is unavailable. Keep the existing camera/orbit/context-loss checks unchanged.
- [ ] Run the full validation set from `prototype`:

```powershell
npm test
npm run build
npm run qa:assets
npm run qa:build-budget
npm run qa:3d-budget
npm run qa:3d
npm run qa:course-workbench
```

- [ ] Inspect the produced teacher, student, normal-3D, X-ray, and WebGL-fallback screenshots. Correct only concrete layout, contrast, overlap, keyboard-focus, or functional failures found by this run.

## Completion checklist

- [ ] All new server and client tests pass with `npm test`.
- [ ] Production build and existing asset/3D budgets pass.
- [ ] Browser QA proves authorization boundaries, the complete teacher/student project flow, and guide behavior in normal and fallback 3D modes.
- [ ] Published definitions are immutable, audit entries exist for every protected write, and the UI does not expose teacher-only project data to students.
