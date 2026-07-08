# 计算机组成原理实训平台长期课堂版 PRD

日期：2026-07-08

## 1. 文档目的

本文档用于把当前平台从“功能已能跑通的课堂原型”推进到“可长期在课堂使用、可被新开发者接手维护”的版本。接手者不需要阅读完整聊天记录，也能理解当前系统边界、已发现风险、待增强功能、验收方式和推荐实施顺序。

本文不替代已有部署文档和历史设计文档，而是作为下一阶段产品需求与工程交付依据。

相关文件：

- 部署文档：`docs/classroom-deployment.md`
- 当前前端入口：`prototype/src/App.jsx`
- 后端入口：`prototype/server/app.js`
- 数据库定义：`prototype/server/db.js`
- 教师 AI 助教：`prototype/server/teacherAssistant.js`
- 学生学习逻辑：`prototype/src/platformLogic.js`
- React Flow 实验：`prototype/src/components/CircuitFlowCanvas.jsx`
- 硬件挑战：`prototype/src/hardwareGame.js`

## 2. 当前产品定位

平台面向《计算机组成原理》课程，服务 1-3 个班、约 150 名学生的集中课堂实训。

核心角色：

- 学生：登录后完成课程关卡、React Flow 电路实验、存储系统模拟、硬件配置挑战、学习笔记和学习记录。
- 教师：创建班级、导入学生、查看班级数据、查看学生详情、导出成绩、使用 DeepSeek 或 fallback 助教报告进行教学决策。

当前技术边界：

- 前端：React + Vite + React Flow。
- 后端：Node.js + Express。
- 数据库：SQLite，代码层应保留后续迁移 PostgreSQL 的边界。
- 认证：账号密码 + HttpOnly SameSite cookie session。
- AI：教师端 DeepSeek 报告，失败时使用本地规则 fallback。
- 判题：React Flow 电路主要在前端判题，后端当前以保存提交结果和汇总数据为主。

## 3. 已验证现状

最近一次验证命令：

- `npm.cmd run build`
- `npm.cmd test`
- `node scripts/verify-ui.mjs`

已验证通过的能力：

- 教师登录、建班、导入学生、导出 CSV。
- 学生登录、提交关卡、保存笔记、刷新后数据保留。
- React Flow 实验页面可打开，包含导线交叉标记、提交反馈、实时数据流检测。
- 简化存储系统实验可打开，包含 MAR、地址译码、控制总线、MDR、主存矩阵。
- 硬件配置挑战可打开，包含客户满意度、报价、经营利润、瓶颈反馈。
- UI smoke 覆盖主要 React Flow 关卡、机器数、存储系统和硬件挑战。

注意：当前工作区可能仍有未提交拆分组件和 `.hermes/` 目录。接手前必须先确认 `git status --short`，不要把临时目录误提交。

## 4. 下一阶段目标

目标不是继续堆新实验，而是把平台打磨成课堂长期使用版本。

优先目标：

1. 保证代码结构可维护，避免所有改动都集中在 `App.jsx`。
2. 提高教师看板的教学决策价值，而不是只展示流水数据。
3. 提高学生数据可信度和可追溯性，便于长期统计。
4. 增强 AI fallback，在无 DeepSeek 或 AI 失败时仍能给出基于真实数据的建议。
5. 补齐课堂常用闭环：导入、实验、反馈、复盘、导出、备份。

非目标：

- 不做公开注册平台。
- 不做完整 LMS。
- 不做完整自由电路社区。
- 不做复杂多租户。
- 不做实时多人协作。
- 不把 DeepSeek 开放为学生自由聊天入口。

## 5. 用户画像与关键场景

### 5.1 教师

目标：

- 课前快速导入班级学生。
- 课中看到谁卡住、卡在哪一关、卡因是什么。
- 课后导出成绩和学习证据。
- AI 不可用时仍能得到可解释的本地教学建议。

关键场景：

- 第一次上课前：部署平台、创建教师账号、创建班级、导入学生。
- 课堂中：投屏讲解、学生实验、教师查看实时或准实时进度。
- 课堂后：查看学生详情、重置密码、导出成绩、备课下一节。

### 5.2 学生

目标：

- 明确知道当前应该做哪一关。
- 操作后立刻看到反馈。
- 错误能定位到关卡、端口、连接、数据流或配置瓶颈。
- 能导出实验报告用于作业提交或复盘。

关键场景：

- 首次登录后看到课程路线和下一步建议。
- 完成 React Flow 实验并提交。
- 在存储系统实验中理解 MAR、译码、MDR、数据总线。
- 在硬件配置挑战中理解速度、价格、容量之间的取舍。
- 课后查看学习记录、错题、笔记和报告。

## 6. 高优先级需求

### P0-1. 清理当前拆分状态并提交

背景：

当前 `App.jsx` 已经从约 3541 行降到约 3332 行，但仍有 145KB 左右。已有部分组件被拆出，例如 `HardwareGamePage`、`MemorySystemPanel`、`MachineNumberPanel`、`MobileLabFallback`，但工作区可能仍未提交。

需求：

- 确认拆出的组件是否全部被正式引用。
- 修复拆分组件中的中文编码问题。
- `.hermes/` 不应作为产品代码提交，除非明确有用途并写入文档。
- 完成一次拆分提交，使工作区干净。

建议拆分方向：

- `components/teacher/TeacherDashboard.jsx`
- `components/teacher/TeacherStudentDetail.jsx`
- `components/teacher/TeacherSettingsPanel.jsx`
- `components/student/StudentHome.jsx`
- `components/student/StudentRecords.jsx`
- `components/student/NotesPage.jsx`
- `components/lab/LabStudioPage.jsx`
- `components/lab/MobileLabFallback.jsx`
- `components/hardware/HardwareGamePage.jsx`

验收标准：

- `App.jsx` 降到 2000 行以内。
- `npm.cmd run build` 通过。
- `npm.cmd test` 通过。
- `node scripts/verify-ui.mjs` 通过。
- `git status --short` 不包含未跟踪产品组件。

### P0-2. 教师学生详情增强

背景：

当前学生详情主要展示逐关成绩、最近提交、笔记列表。教师无法快速判断学生为什么卡住、是否在进步、在哪些关耗时异常。

需求：

后端 `GET /api/teacher/classes/:id/students/:studentId` 增加统计字段：

- `timeDistribution`：每关累计耗时、平均耗时、是否异常。
- `attemptTrend`：按提交时间展示分数变化、通过状态变化、尝试次数变化。
- `errorProfile`：错误类型频次、最近错误、连续重复错误。
- `noteLinks`：笔记与关卡关联。若当前 notes 表未支持 `challenge_id`，先以笔记创建时间和最近提交关卡做弱关联，后续 schema 增加 `challenge_id`。
- `hardwareProfile`：硬件挑战报价、利润、满意度、瓶颈标签和典型配置。

前端学生详情增加区域：

- 学习概览：完成率、平均分、累计耗时、总尝试次数。
- 耗时异常：列出耗时最高或超出班级均值的关卡。
- 尝试趋势：展示最近 10 次提交，说明分数是否上升。
- 高频错误：按错误类型分组。
- 笔记与反思：按关卡或时间线展示。
- 硬件经营分析：报价倾向、利润空间、瓶颈类型。

验收标准：

- 教师打开学生详情后，能在 10 秒内判断该学生最需要补哪一类知识点。
- 对至少 3 名演示学生，详情页能显示不同的风险原因，而不是同一套文案。
- 学生没有提交时显示可行动空状态。
- API 集成测试覆盖教师不能查看非自己班级学生。

### P0-3. DeepSeek fallback 规则引擎

背景：

当前 fallback 已经会读取 `weakSpot`、完成率和平均分，但仍偏浅。AI 不可用时，教师仍需要可用的课堂建议。

需求：

新增本地规则分析器，例如 `server/teacherFallbackRules.js`：

- 输入：班级 summary、学生 progress、attempts、errors、hardwareGameSummary。
- 输出：`lessonFocus`、`riskStudents`、`groupingPlan`、`commonMisconceptions`、`nextClassPlan`、`teacherScript`、`evidence`。

规则示例：

- 如果机器数相关关卡平均分低于 70，且错误集中在补码，输出“补码转换与溢出判断”。
- 如果半加器/全加器重复缺少 `Cout` 路径，输出“进位逻辑与输出端区分”。
- 如果存储系统关卡耗时高但分数低，输出“MAR、MDR、地址译码流程”。
- 如果硬件挑战经常预算超限，输出“性能、价格、容量取舍”。
- 如果学生完成率低但平均分不低，输出“进度风险”而不是“能力风险”。
- 如果学生反复提交同一关但分数不提升，输出“重复试错风险”。

输出必须包含 evidence：

```json
{
  "type": "challenge_error",
  "label": "全加器 Cout 缺失",
  "count": 8,
  "studentIds": [1, 2, 3],
  "challengeIds": ["full-adder"]
}
```

验收标准：

- DeepSeek API key 缺失时，教师看板仍能生成有差异的 fallback 报告。
- fallback 至少能识别 5 类常见课堂风险。
- 单元测试覆盖每类规则。
- AI 报告和 fallback 报告都不包含密码、session、原始 cookie、完整学生笔记正文。

### P0-4. 学生数据可信度与提交校验

背景：

当前前端负责判题，后端保存提交结果。长期课堂使用时，学生可通过伪造请求提交高分。

需求：

后端 `POST /api/student/attempts` 增加基础校验：

- `challengeId` 必须属于 `LEARNING_ITEMS`。
- `score` 必须为 0-100 整数。
- `passed` 必须与 score 或规则一致，例如 score >= 80 才允许 passed。
- `elapsedMinutes` 必须在合理范围，例如 0-240。
- `errors` 必须为字符串数组或标准错误对象数组。
- `result_json` 大小限制，避免写入超大 payload。

对硬件挑战：

- 后端根据 `selection` 重新调用 `gradeHardwareBuild`。
- 不信任前端传入的 score、profit、satisfaction。

对 React Flow 电路：

- 首期可只做结构格式校验。
- 后续可把 `studentEdges` 发给后端，复用 `gradeConnections` 或 circuit 模块复判。

验收标准：

- 伪造 `score: 999` 返回 400。
- 伪造硬件挑战高分会被后端重算。
- 超大 `result_json` 被拒绝。
- 现有正常提交不受影响。

### P0-5. 数据备份与恢复入口

背景：

SQLite 单机部署最怕误删、磁盘损坏或迁移失败。长期课堂使用必须让教师或管理员能备份。

需求：

后台新增管理员或教师可用的备份功能：

- 下载数据库备份文件。
- 下载当前班级完整成绩包。
- 显示数据库路径、最近备份时间、建议备份频率。
- 文档说明如何恢复备份。

可选 API：

- `GET /api/admin/backup.sqlite`
- `GET /api/teacher/classes/:id/archive.zip`

Phase 1 采用文档化备份作为最小可交付：先在部署文档提供 Linux 与 Windows 备份/恢复演练命令，不开放数据库下载 API。后续再在教师设置页显示“备份提醒”和数据库路径，并评估是否增加 admin 备份接口。

验收标准：

- 部署者能在 5 分钟内完成备份和恢复演练。
- 备份文件不包含明文密码，只包含哈希。
- 文档包含 Windows 和 Linux 示例。

## 7. 中优先级需求

### P1-1. 学生学习记录导出

需求：

学生端增加“导出实验报告”。

首版格式：Markdown。

报告内容：

- 学生姓名、学号、导出时间。
- 完成关卡数、平均分、累计耗时。
- 每关最好成绩、尝试次数、完成状态。
- 最近错误与修正建议。
- 硬件挑战配置、报价、利润、满意度、瓶颈。
- 学生笔记。

后续可增加 PDF。

验收标准：

- 学生可下载 `.md` 文件。
- 文件名包含学号和日期。
- 报告刷新后仍基于后端数据生成。

### P1-2. 笔记功能增强

需求：

数据库 notes 增加：

- `challenge_id`
- `updated_at`

API 增加：

- `PUT /api/student/notes/:id`
- `DELETE /api/student/notes/:id`
- `GET /api/student/notes?tag=&challengeId=&q=`

前端增加：

- 标签筛选。
- 搜索。
- 关联当前关卡。
- 编辑和删除。

验收标准：

- 学生可按关卡查看笔记。
- 教师看学生详情时能看到某关后的反思。
- 学生不能修改或删除他人的笔记。

### P1-3. Undo / Redo

需求：

React Flow 实验增加撤销和重做。

范围：

- 添加导线。
- 删除导线。
- 重置。
- 填入参考结构。

实现建议：

- 使用本地 history stack。
- 只保存必要状态，例如 edges、selected nodes、input state。
- 快捷键：Ctrl+Z / Ctrl+Y。
- UI：工具栏图标按钮。

验收标准：

- 学生误删导线后可一键恢复。
- 重置后仍可撤销。
- 不影响提交判题。

### P1-4. 空状态与首次引导

需求：

- 新学生首页显示“建议从第一章计算机概述开始”。
- 学习记录为空时显示“完成第一个实验后这里会出现记录”。
- 教师无班级时显示“创建班级 / 导入学生 / 查看导入模板”。
- 教师有班级无提交时显示“让学生登录并完成第一关”。

验收标准：

- 空页面不出现大片空白。
- 每个空状态都提供一个明确下一步按钮。

### P1-5. 班级归档与学生账号生命周期

需求：

班级增加：

- `status`: active / archived。
- `archived_at`。

学生管理增加：

- 停用账号。
- 移出班级。
- 转入其他班级。
- 查看初始密码是否已修改。

验收标准：

- 归档班级默认不出现在教师首页。
- 已停用学生不能登录。
- 历史成绩仍可查询和导出。

### P1-6. 教师看板准实时刷新

需求：

首版不必做 WebSocket，可做轻量自动刷新：

- 教师看板每 30-60 秒刷新当前班级 overview。
- 当教师正在查看学生详情时，不强制覆盖详情页滚动位置。
- 显示“最后更新时间”和“手动刷新”。

后续再考虑 WebSocket 或 Server-Sent Events。

验收标准：

- 学生提交后，教师不手动刷新页面也能在 1 分钟内看到数据变化。
- 自动刷新失败时显示提示，不清空已有数据。

## 8. 低优先级需求

### P2-1. 关卡先决条件强约束

需求：

- 学生可浏览后续关卡说明，但不能提交未解锁关卡。
- 教师可配置是否允许跳关。
- 后端提交接口也要检查前置状态。

验收标准：

- 未完成半加器时不能提交全加器，除非教师开启跳关。

### P2-2. 课程总体完成概览

需求：

学生首页增加：

- 完成 `x/y` 关。
- 当前平均分。
- 累计耗时。
- 预计剩余课时。
- 下一推荐关卡。

验收标准：

- 学生登录 5 秒内能理解整体进度和下一步。

### P2-3. 安全增强

需求：

- 登录失败次数限制。
- CSRF 防护。
- cookie 增加更严格配置。
- 密码强度提示。
- session 列表和一键下线。

验收标准：

- 同一账号连续失败超过阈值后短时间内被限制。
- 跨站 POST 不应成功修改数据。

### P2-4. 结构化日志与深度健康检查

需求：

- 请求日志。
- 登录失败日志。
- 学生导入日志。
- AI 调用日志。
- `/api/health` 增加数据库可读写检查、版本号、构建时间、磁盘空间提示。

验收标准：

- 课堂出现登录或提交失败时，部署者能通过日志定位问题。

### P2-5. 数据库迁移版本表

需求：

新增 `schema_migrations` 表，所有后续 schema 变更使用版本迁移。

验收标准：

- 从旧数据库升级到新版本不会丢数据。
- 重复运行 `npm run migrate` 幂等。

### P2-6. 前端错误边界

需求：

为以下区域增加 ErrorBoundary：

- 主应用。
- React Flow 实验台。
- 教师看板。
- 学生记录页。

验收标准：

- 单个组件报错不导致整站白屏。
- 页面给出“刷新 / 返回首页 / 复制诊断信息”。

## 9. 数据模型建议

### 9.1 challenge_attempts 增强

建议字段：

- `challenge_version TEXT`
- `rubric_version TEXT`
- `client_result_json TEXT`
- `server_result_json TEXT`
- `submission_hash TEXT`
- `source TEXT CHECK (source IN ('client', 'server', 'imported'))`

目的：

- 支持后续规则调整后仍能解释历史数据。
- 支持后端重算。
- 支持审计学生提交。

### 9.2 notes 增强

建议字段：

- `challenge_id TEXT`
- `updated_at TEXT`

### 9.3 classes 增强

建议字段：

- `status TEXT DEFAULT 'active'`
- `archived_at TEXT`

### 9.4 audit_logs 新表

建议字段：

- `id`
- `actor_user_id`
- `action`
- `target_type`
- `target_id`
- `metadata_json`
- `created_at`

记录：

- 登录失败。
- 导入学生。
- 重置密码。
- 导出成绩。
- 生成 AI 报告。
- 备份下载。

## 10. API 建议

### 学生端

- `GET /api/student/report.md`
- `GET /api/student/notes?tag=&challengeId=&q=`
- `PUT /api/student/notes/:id`
- `DELETE /api/student/notes/:id`

### 教师端

- `GET /api/teacher/classes/:id/students/:studentId/analytics`
- `POST /api/teacher/classes/:id/archive`
- `POST /api/teacher/classes/:id/refresh-summary`
- `GET /api/teacher/classes/:id/archive.zip`
- `POST /api/teacher/students/:studentId/disable`
- `POST /api/teacher/students/:studentId/move-class`

### 管理/运维

- `GET /api/admin/health/deep`
- `GET /api/admin/backup.sqlite`

若暂不引入 admin 角色，管理 API 可以先不开放，仅保留命令行脚本。

## 11. UI 需求

### 教师看板

首页只放数据看板，不放学生导入。

必须包含：

- 班级选择。
- 学生数、完成率、平均分、提交数。
- 高频错误。
- 风险学生。
- 硬件挑战瓶颈。
- AI 助教入口。
- 最近更新时间。

设置页包含：

- 创建班级。
- 下载 CSV 模板。
- 导入学生。
- 导出 CSV。
- 备份提示。
- 密码重置说明。

### 学生首页

必须包含：

- 总体完成进度。
- 下一推荐关卡。
- 课程路线。
- 最近反馈。
- 错题或薄弱点入口。

### 实验页

必须包含：

- 左侧：关卡路线、目标、元件或步骤。
- 中间：实验画布或模拟器。
- 右侧：实时检测、用例、反馈。
- 移动端：明确提示使用桌面端，或提供点击连线降级交互。

### 学习记录页

必须包含：

- 总览指标。
- 每关成绩。
- 尝试记录。
- 导出报告按钮。
- 错题本入口。

## 12. 验收计划

每次交付前必须运行：

```powershell
cd prototype
npm.cmd test
npm.cmd run build
node scripts/verify-ui.mjs
```

建议新增验收脚本覆盖：

- 教师无班级空状态。
- 教师创建班级、导入学生、查看看板。
- 学生完成第一关，教师看板 60 秒内刷新。
- 学生导出 Markdown 报告。
- 教师查看学生详情，看到耗时异常和尝试趋势。
- DeepSeek 未配置时 fallback 生成差异化建议。
- 移动端打开实验页显示明确提示。
- 伪造高分提交被拒绝。

## 13. 推荐实施顺序

第一阶段：交付稳定化

1. 清理当前拆分状态，提交干净版本。
2. 修复所有新增组件编码问题。
3. 固化构建、测试、UI smoke 验收。
4. 补学生提交基础校验。

第二阶段：教师决策增强

1. 增强学生详情 analytics。
2. 增强 fallback 规则引擎。
3. 教师看板自动刷新。
4. 班级归档和账号停用。

第三阶段：学生复盘闭环

1. 学生 Markdown 报告导出。
2. 笔记搜索、编辑、删除、关卡关联。
3. 错题本。
4. 总体完成概览。

第四阶段：长期运维

1. 备份恢复入口。
2. 结构化日志。
3. schema migrations。
4. rate limiting 和 CSRF。
5. 前端 ErrorBoundary。

## 14. 接手者注意事项

- 不要在未确认编码的情况下用 PowerShell 管道写中文源码，已有历史文档出现过 mojibake。
- 修改源码后必须检查 `rg -n "\?{3,}|�"`。
- 当前项目在 Windows sandbox 下可能出现 `spawn EPERM`，测试和构建必要时需要提权运行。
- 不要提交 `.hermes/`，除非确认它是项目正式产物。
- 不要把学生原始完整笔记、密码、session、cookie 发给 AI。
- 不要只相信前端传来的成绩，长期版本必须逐步引入后端校验或复判。


