# 项目同步与问题清单（2026-09-04）

## 1. 同步结果

- Gitee：`https://gitee.com/cplus1/composition-principle-platform.git`，已 fetch 最新 `main`，远端基线为 `5d9d62f`。
- 同步前本地 `346d93d` 与远端各有 3 个独立提交，工作区干净。
- 已合并为本地提交 `6e97ba3`，保留双方历史，没有覆盖本地的资源预算、WebP 及 3D 规划成果。本次没有向 Gitee/GitHub 推送。
- 新同步内容：`3b275a1` 结算浮层/登录动画修复与 Node 版本声明；`d5ab10d` 教师移动端溢出修复；`5d9d62f` AI 实验助教。
- 两处冲突的处理：`App.jsx` 保留本地共用的设置和结算渲染函数，两种布局都有结算；`LoginPortal.jsx` 采用远端 CSS 入场动画。

本次范围已扩展为代码同步、现状审查和首轮修复。检查依据为合并后的代码、隔离数据库/API 复现、现有浏览器与质量检查；没有检查 Gitee Issues/PR，也没有对线上实例或真实学生数据做操作。

## 2. 验证结果

| 检查 | 本次结果 | 说明 |
| --- | --- | --- |
| 同步前 `npm test` | 277/277 | 本地原始基线 |
| 同步后普通 `npm test` | 285/286，1 项失败 | 新 AI 助教测试读取宿主机 Key，实际返回 `ai`，却断言 `fallback` |
| 仅测试进程清空 `DEEPSEEK_API_KEY` 后的 `npm test` | 286/286 | 证明上述失败依赖环境，不代表该测试问题已修好 |
| `npm run qa:build-budget` | 通过 | 包含生产构建；首屏 JS 454,484 B，上限 512,000 B |
| `npm run qa:assets` | 通过 | 装机主图 WebP 95,050 B |
| `npm run qa:ui` | 通过 | 独立无头 Chromium，登录、实验台、记录、教师页等现有 smoke 流程 |
| `npm run qa:classroom-load` | 通过 | 150 学生、30 并发，成功 150/150，P95 29ms，最大 34ms，SQLITE_BUSY=0；这是本机隔离测试结果 |
| 定向缺陷复现 | 9 组断言通过 | 这些断言确认缺陷存在，不是修复通过 |

复现与日志保存在本机、被 Git 忽略的 `prototype/qa-artifacts/`：

- `review-probes-2026-09-04.mjs`：内存数据库、本机临时 HTTP 服务、测试账号；运行 `node qa-artifacts/review-probes-2026-09-04.mjs`。
- `review-probes-2026-09-04.json`：实际返回值摘要。
- `review-tests-isolated.log`：隔离 Key 后的完整测试输出。

沙箱曾阻止 Git 元数据写入、测试子进程和日志写入；经授权执行后完成。此类权限错误不作为项目缺陷。初始 UI smoke 没有覆盖完整的作业创建、发布、答题和人工批改闭环；通过 smoke 不代表这些功能可用。3D 专项已在后续修复阶段补跑；课堂双角色专项、真实机房硬件测试和依赖漏洞扫描不在本轮范围内。

## 3. P1：应优先修复

### 01. 请求体可以覆盖教师身份，绕过作业归属检查

- **位置**：`prototype/server/assignmentRoutes.js:9`、`:17`、`:57`。
- **证据**：先设置 `teacherId: req.user.id`，随后展开 `...req.body`。隔离测试中教师 T2 向 T1 的作业添加题目，请求体附上 T1 的 `teacherId`，得到 HTTP 201；T1 作业被实际修改。
- **影响**：创建作业、加题、批改入口都采用同样的覆盖顺序，服务层收到的身份不再可信。已直接复现的是跨教师加题。
- **修复与验收**：对请求体建立字段白名单，身份和资源 ID 只取认证上下文及路由；覆盖三个入口的伪造身份测试，要求拒绝并确保数据库未修改。

### 02. 教师加完题目后仍没有“发布作业”按钮

- **位置**：`prototype/src/components/TeacherAssignments.jsx:57`、`:82`；`prototype/server/assignmentRepository.js:21`。
- **证据**：列表 API 只返回作业行与 `question_count`，没有 `questions`；UI 却用 `a.questions` 传给 `DraftActions`，再用 `questions?.length > 0` 判断是否显示发布按钮。已复现 API 中题目数为 2、`questions` 缺失。
- **影响**：教师正常使用页面无法完成创建→加题→发布，现有 API 流程测试绕过了这个问题。
- **修复与验收**：使用明确的题目数量或加载作业详情；增加浏览器中完整创建、加题、发布验证。

### 03. 学生选择题缺少选项，题目解析又过早暴露

- **位置**：`prototype/src/components/StudentAssignments.jsx:105`；`prototype/server/assignmentService.js:93`；`prototype/server/assignmentRepository.js:40`。
- **证据**：接口给出 `options_json` 字符串，UI 读取 `q.options` 数组；复现返回 `options=null`、`options_json='["A","B"]'`。接口只剔除 `answer_json`，保留了 `explanation`，复现中学生在作答前拿到了写有正确答案的解析。
- **影响**：选择题在页面没有可选答案；通过 API 写入了解析的题目还会提前泄露解题信息。
- **修复与验收**：统一学生题目 DTO，将 JSON 解码为 `options`；按提交/公布状态返回解析。验证选项可点选、未提交时响应无答案及解析。

### 04. 简答题自动变成“已批改”，教师无法完成实际人工评分

- **位置**：`prototype/server/assignmentService.js:139`；`prototype/server/assignmentRepository.js:73`；`prototype/src/components/TeacherAssignments.jsx:146`。
- **证据**：包含简答题的提交也无条件调用 `gradeSubmission`，状态直接设为 `graded`。已复现选择题 10 分、简答题待评的作业显示总分 10、状态 `graded`、`submitted_at=null`。教师 UI 仅在非 graded 时显示操作，且操作只传空 `questionScores`，没有查看答案与逐题赋分流程。
- **影响**：README 宣称的“简答人工批改”未形成可用闭环，成绩和待批改数量会误导师生。
- **修复与验收**：区分草稿、已提交待批、全部批改；记录提交时间；提供答案详情与逐题评分。混合题型应先显示待批，教师评完后再显示最终分数。

### 05. 保存的草稿无法恢复，已提交答案也无法回看

- **位置**：`prototype/server/assignmentRepository.js:61`；`prototype/server/assignmentService.js:97`；`prototype/src/components/StudentAssignments.jsx:21`。
- **证据**：详情只返回 `student_submissions` 主记录，不返回 `submission_answers`；前端看到已有提交后把各题答案赋成空字符串。复现中数据库有两条已保存答案，但详情无答案字段。
- **影响**：退出再进入时表单为空；学生重新保存空表可能覆盖原答案；已提交的只读表单同样没有内容。
- **修复与验收**：详情返回本人答案并解析回填；验证保存、退出、刷新、重进后的答案完全一致，提交后可只读回看。

### 06. 保存答案没有事务，失败会删除旧答案

- **位置**：`prototype/server/assignmentRepository.js:44`。
- **证据**：更新时先 `DELETE FROM submission_answers`，再逐条 INSERT，无事务包裹。复现向已有记录提交不存在的题目 ID，接口 500，旧答案数量从 1 变成 0。
- **影响**：异常题目 ID、重复题目 ID等输入可能造成部分保存或原答案丢失。
- **修复与验收**：保存前验证题目属于当前作业、题号不重复，删除与写入置于同一事务；故意提交非法数据，应返回 4xx 且旧内容不变。

### 07. 已评分作业仍可用草稿接口改答案，旧成绩保留

- **位置**：`prototype/server/assignmentService.js:101`；`prototype/server/assignmentRepository.js:44`。
- **证据**：`saveDraft` 只检查班级归属和作业发布状态，不检查提交状态。已复现将评分后正确答案 A 改为 B，接口 200，仍为 `graded`，保留旧分数 10。
- **影响**：答案、逐题分数和总分失去一致性；页面禁用输入无法防止直接调用 API。
- **修复与验收**：服务端禁止对已提交/已批改记录保存草稿；若允许重交，明确版本与重评分策略。验证旧成绩不能被无痕篡改。

### 08. 网络失败对所有 POST 自动重试，可能重复写入

- **位置**：`prototype/src/apiClient.js:31`、`:45`；`prototype/server/app.js:498`、`:575`。
- **证据**：网络异常不区分 HTTP 方法，最多重试 2 次。模拟服务端已处理但响应丢失，单次 `apiRequest` 触发了两次 POST。创建笔记、创建班级、普通练习提交等没有相应的幂等键；课堂提交有 UUID，不能保护其他入口。
- **影响**：网络抖动可能创建重复内容、重复计入尝试；AI 请求也可能重复发起。
- **修复与验收**：默认只重试安全读取；有副作用操作要么不自动重试，要么使用服务端幂等键。模拟响应丢失，保证只有一条业务记录。

### 09. 部分关卡直接信任客户端分数，可以空交满分

- **位置**：`prototype/server/submissionValidation.js:60`、`:83`。
- **证据**：硬件和多数电路会服务端重算，但 `computer-components` 被显式排除。已复现仅提交 `{ passed: true, score: 100, errors: [], elapsedMinutes: 0 }`，无完成证据，接口 201，进度变成 completed，最高分 100。
- **影响**：这些关卡的成绩不能视为可信掌握度证据。客户端展示的完成按钮不构成服务端验证。
- **修复与验收**：明确哪些是参与型活动、哪些是评分型挑战；参与型记录不要冒充测评分数，评分型应依据结构化答案在服务端评分。空证据请求不能直接产生满分成绩。

## 4. P2：可靠性与统计问题

### 10. 新 AI 助教测试依赖真实环境，可能触发外部调用

- **位置**：`prototype/server/labAssistant.test.mjs:73`；`prototype/server/labAssistant.js:120`。
- **证据**：测试名称是假定“未配置 Key”，但既没有注入环境也没有清空变量；生成函数直接读 `process.env`。本次普通运行得到 `ai` 而失败，清空本次进程的 Key 后 286 项全部通过。另一个失败路径测试自己拼装降级结果，没有直接覆盖生成函数的失败分支。
- **修复与验收**：为生成函数注入 env/fetch，单测使用假响应并禁止外网；无论开发者是否配置 Key，都应稳定通过，且确实测试生成函数的失败降级。

### 11. 作业提交率分母取提交记录数，而不是班级人数

- **位置**：`prototype/server/assignmentRepository.js:96`；`prototype/src/components/TeacherAssignments.jsx:36`。
- **证据级别**：代码确认。`studentCount: subs.length` 包含有提交/草稿的学生，不包含尚未操作的同学，UI 却显示 `submittedCount/studentCount 提交`。
- **影响**：例如 30 人班只有 1 人提交且其他人没存草稿，会显示 1/1，无法反映真实覆盖率。
- **修复与验收**：分母取作业面向的班级成员数或发布时名单快照；验证 30 人、1 人提交的结果为 1/30。

### 12. 学生提交失败后按钮可能一直停在“提交中”

- **位置**：`prototype/src/components/StudentAssignments.jsx:41`。
- **证据级别**：代码确认。`setSubmitting(true)` 后直接 await 提交和刷新，没有 catch/finally；任意一步抛错都不会恢复状态，也没有用户可见错误反馈。
- **影响**：服务器异常、会话过期或断网时学生难以判断保存情况，也无法正常重试。
- **修复与验收**：用 finally 恢复状态，并区分保存失败和刷新失败；在浏览器注入一次失败，要求保留答案、显示错误、按钮恢复可用。

## 5. 后续工程工作与验收边界

- **3D 包优化已落地并受预算门禁保护**：概述场景已改为原生 Three.js，移除 R3F/Drei；生产增量依赖为 151,463 B gzip，单块最大 372,734 B。`npm run qa:3d-budget` 会检查入口的全部静态依赖，防止回归。
- **测试覆盖需覆盖真实业务闭环**：优先补上述作业完整浏览器流程与越权、事务、状态机、重试失败路径。已有数百项测试不能替代这些验收。
- **文档需要继续校准**：README 仍写 276 项测试、负载 P95<20ms；仓库课堂验收标准为 P95≤2000ms。本次 P95=29ms 满足仓库门禁，但不满足 README 的数字。旧待办文档“全部完成”只能视为当时的历史判断。
- **运维授权需明确**：数据库备份接口只要求 teacher，提供整库快照。如果未来部署允许互不信任的教师，应先定义独立管理员权限；本次没有把默认单机构型下这一设计直接判作已确认越权漏洞。

建议顺序：先修 01 的身份覆盖和 06/07 的数据一致性；随后将 02～05 的作业闭环一并修通；再处理 08/09 的重试与评分可信度、10～12 的可靠性，最后推进 3D 瘦身。每组修复都使用本报告的复现条件验收。

## 6. 本轮修复状态

以下问题已完成代码修复并有针对性回归：01 身份覆盖、02 发布按钮、03 选择题 DTO/解析泄露、04 人工批改状态、05 草稿回填、06 原子保存及题号校验、07 提交后禁止改答、08 写操作不再自动重试、09 概述关卡改为无分参与记录、10 AI 测试注入环境、11 班级人数分母、12 提交失败恢复按钮。

- 作业 API 新增越权、草稿恢复、人工批改待处理状态的回归用例；提交答案先校验再在事务内替换，避免异常删除旧答案。
- 教师端可按题查看答案、录入分数和评语；评分后保留展开内容并刷新提交列表。
- 3D 概述默认进入分步组装；自动爆炸和 X-ray 仍可手动启用。专项脚本新增默认模式与总线标签检查。
- WebGL 不可用时，静态视图现在也要求完成 6 个装配步骤后才能记录探索完成；原生场景支持部件拾取、X-ray 总线标签、拖拽旋转、滚轮缩放、资源释放和上下文丢失降级。
- 3D 概述仍是参与型学习记录：服务端不再采信浏览器的分数，但当前完成信号仍来自客户端的分步完成标记。若需作为正式成绩，应增加服务端可验证的步骤事件或签名会话。
- 本轮代码后，`server/app.test.mjs`、`server/assignment.test.mjs`、`server/submissionValidation.test.mjs`、`src/apiClient.test.mjs`、`server/labAssistant.test.mjs` 与 `src/useLabStateResult.test.mjs` 均已串行通过。`npm run qa:assets` 通过。
- 本轮生产构建和 3D 专项回归已在本机完成；专项覆盖默认引导、8 步装配、部件拾取、X-ray、重进、上下文丢失和 WebGL 禁用降级。完整 `npm test` 仍受 Windows Node 子进程 `spawn EPERM` 影响，相关核心测试改以直接执行方式回归。
