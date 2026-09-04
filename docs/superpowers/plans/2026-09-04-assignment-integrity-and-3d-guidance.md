# 作业完整性与 3D 引导 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复作业权限、状态和数据完整性，并让 3D 总览默认采用可辨认的分步装配教学。

**Architecture:** 作业路由只采信会话和 URL 的身份、资源标识；服务层建立学生安全题目 DTO 和提交状态机；仓储层用事务替换答案。3D 保留现有 PBR、WebGL 降级与按需加载，只改默认交互状态和专项浏览器断言。

**Tech Stack:** Express 5、better-sqlite3、React 19、React Three Fiber、Node Test、Playwright。

## Global Constraints

- Node.js >=22；不新增依赖。
- 首屏 JavaScript 预算 512000 B；普通实验页不得预加载 Three.js。
- 课堂负载门禁保持 150 学生、30 并发、P95 <=2000ms、SQLITE_BUSY=0。
- 无 WebGL 时必须继续呈现静态教学视图。

---

### Task 1: 路由身份与学生题目 DTO

**Files:**
- Modify: `prototype/server/assignmentRoutes.js`
- Modify: `prototype/server/assignmentService.js`
- Test: `prototype/server/assignment.test.mjs`

- [ ] **Step 1: 写失败测试**

```js
test("forged teacherId cannot modify another teacher assignment", async () => {
  const result = await request(otherTeacher, `/api/teacher/assignments/${assignmentId}/questions`, {
    teacherId: ownerId, type: "choice", stem: "forged", options: ["A"], answer: "A", score: 10,
  });
  assert.equal(result.response.status, 404);
});
```

- [ ] **Step 2: 验证 RED**

Run: `node --test server/assignment.test.mjs`
Expected: FAIL；当前 `...req.body` 覆盖 `req.user.id`。

- [ ] **Step 3: 最小实现**

```js
const body = req.body ?? {};
service.addQuestion({
  teacherId: req.user.id, assignmentId: Number(req.params.id), type: body.type,
  stem: body.stem, options: body.options, answer: body.answer, score: body.score,
  explanation: body.explanation, sortOrder: body.sortOrder,
});
```

- [ ] **Step 4: 验证 GREEN**

Run: `node --test server/assignment.test.mjs`
Expected: PASS；学生详情返回 `options` 数组，且不含 `answer_json`、`explanation`。

### Task 2: 提交状态机、答案事务和统计

**Files:**
- Modify: `prototype/server/assignmentRepository.js`
- Modify: `prototype/server/assignmentService.js`
- Test: `prototype/server/assignment.test.mjs`

- [ ] **Step 1: 写失败测试**

```js
assert.equal(submitMixedAssignment.body.submission.status, "submitted");
assert.ok(submitMixedAssignment.body.submission.submitted_at);
assert.deepEqual(reloaded.body.submission.answers.map(({ value }) => value), ["A", "说明"]);
assert.equal(invalidDraft.response.status, 400);
assert.deepEqual(reloadedAfterInvalid.body.submission.answers, previousAnswers);
```

- [ ] **Step 2: 验证 RED**

Run: `node --test server/assignment.test.mjs`
Expected: FAIL；当前提交一律 graded，草稿替换未使用事务。

- [ ] **Step 3: 最小实现**

```js
return db.transaction(() => {
  assertAnswersBelongToAssignment(assignmentId, answers);
  replaceSubmissionAnswers(submissionId, answers);
  return getSubmissionWithAnswers(assignmentId, studentId);
})();
```

```js
const requiresManualGrade = questions.some((question) => question.type === "short_answer");
repository.markSubmitted(submission.id, { totalScore, questionScores });
if (!requiresManualGrade) repository.gradeSubmission(submission.id, { totalScore, questionScores, feedback: "" });
```

- [ ] **Step 4: 验证 GREEN**

Run: `node --test server/assignment.test.mjs`
Expected: PASS；已评分作业拒绝保存草稿，班级统计分母为成员数。

### Task 3: 作业教师/学生界面与浏览器回归

**Files:**
- Modify: `prototype/src/components/TeacherAssignments.jsx`
- Modify: `prototype/src/components/StudentAssignments.jsx`
- Modify: `prototype/src/apiClient.js`
- Test: `prototype/scripts/verify-ui.mjs`

- [ ] **Step 1: 写失败浏览器步骤**

```js
await page.getByRole("button", { name: "发布作业" }).click();
await page.getByLabel("选择题选项").first().check();
await page.reload();
assert.equal(await page.getByLabel("选择题选项").first().isChecked(), true);
```

- [ ] **Step 2: 验证 RED**

Run: `npm run qa:ui`
Expected: FAIL；当前发布按钮依赖不存在的 `a.questions`，选择题没有 `options`。

- [ ] **Step 3: 最小实现**

```jsx
<DraftActions assignmentId={a.id} questionCount={a.question_count} onRefresh={loadAll} />
{questionCount > 0 ? <button type="button">发布作业</button> : null}
```

```js
try { await api.submitAssignment(active, answers); await load(); }
catch (error) { setError(error.message); }
finally { setSubmitting(false); }
```

- [ ] **Step 4: 验证 GREEN**

Run: `npm run qa:ui`
Expected: PASS；教师可发布，学生选项、草稿回填与失败反馈可用。

### Task 4: 3D 引导默认值与专项验证

**Files:**
- Modify: `prototype/src/components/OverviewExplodedView.jsx`
- Modify: `prototype/scripts/verify-3d.mjs`
- Test: `prototype/scripts/verify-performance.mjs`

- [ ] **Step 1: 写失败断言**

```js
check("Guided assembly is the default", await page.locator(".exploded-stepbar").isVisible());
await page.getByRole("button", { name: "自动爆炸" }).click();
await page.getByRole("button", { name: "X-ray" }).click();
check("X-ray shows bus labels", await page.locator(".bus-label").count() === 4);
```

- [ ] **Step 2: 验证 RED**

Run: `npm run qa:3d`
Expected: FAIL；当前默认是自动爆炸，步骤条不显示。

- [ ] **Step 3: 最小实现**

```js
const [mode, setMode] = useState("step");
const [autoAnimating, setAutoAnimating] = useState(false);
const [currentStep, setCurrentStep] = useState(1);
```

- [ ] **Step 4: 验证 GREEN**

Run: `npm run qa:3d && npm run qa:performance`
Expected: 3D 引导、自动探索、X-ray、WebGL 降级、10 次生命周期和性能阈值均通过。

### Task 5: 请求重试、评分边界与 AI 测试隔离

**Files:**
- Modify: `prototype/src/apiClient.js`
- Modify: `prototype/server/submissionValidation.js`
- Modify: `prototype/server/labAssistant.js`
- Test: `prototype/src/apiClient.test.mjs`
- Test: `prototype/server/submissionValidation.test.mjs`
- Test: `prototype/server/labAssistant.test.mjs`

- [ ] **Step 1: 写失败测试**

```js
await assert.rejects(() => apiRequest("/api/student/notes", { method: "POST", body: "{}" }));
assert.equal(fetchCalls, 1);
assert.equal(normalizeStudentAttemptPayload(emptyOverviewPayload).ok, false);
```

- [ ] **Step 2: 验证 RED**

Run: `node --test src/apiClient.test.mjs server/submissionValidation.test.mjs server/labAssistant.test.mjs`
Expected: FAIL；POST 自动重试且概览关卡接受客户端满分。

- [ ] **Step 3: 最小实现**

```js
const retryableMethod = ["GET", "HEAD"].includes((options.method ?? "GET").toUpperCase());
if (!retryableMethod) throw error;
```

```js
export async function generateLabAssistantHint(labContext, { env = process.env } = {}) {
  const config = readDeepSeekConfig(env);
}
```

- [ ] **Step 4: 验证 GREEN**

Run: `npm test`
Expected: 全部测试通过，且不依赖宿主机 AI Key。

### Task 6: 质量门禁与文档

**Files:**
- Modify: `docs/project-review-2026-09-04.md`
- Modify: `README.md`

- [ ] **Step 1: 运行质量门禁**

Run: `npm test && npm run qa:build-budget && npm run qa:assets && npm run qa:ui && npm run qa:3d && npm run qa:performance && npm run qa:classroom-load`
Expected: 每项退出码为 0。

- [ ] **Step 2: 更新文档**

将报告中的已修复项标注为已完成，并将 README 的测试数和课堂性能描述与当前脚本一致。

- [ ] **Step 3: 提交**

Run: `git add <changed-files> && git commit -m "fix: restore assignment integrity and guided 3d overview"`
Expected: 一个可审阅的本地提交，未推送远端。
