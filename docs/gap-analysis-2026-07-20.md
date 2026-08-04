# 课堂实训平台差距分析（对照长期 PRD）

日期：2026-07-20
对照基线：`docs/classroom-long-term-prd.md`
当前 HEAD：`95de857 feat: redesign computer exploded view with realistic compound 3D parts`

## 1. 总体状态

平台已经从原型推进到接近 PRD 目标的形态：`App.jsx` 从 3541 行降到 1239 行（目标 <2000 已达成），组件按教师/学生/实验/硬件拆分，提交校验、fallback 规则引擎、备份接口、笔记增强、Undo/Redo、班级归档、自动刷新、ErrorBoundary、schema_migrations、登录限流与 CSRF 防护均已落地。

但仍有若干 P0/P1 项未完整闭环，且当前测试套件存在 37 个失败用例（环境问题，详见第 4 节），需要先修复环境再继续功能交付。

## 2. 已完成的需求（对照 PRD）

| PRD 项 | 状态 | 证据 |
|---|---|---|
| P0-1 清理拆分并提交 | ✅ | `App.jsx` 1239 行；`components/{teacher,student,lab,hardware,classroom,quest}` 已拆分；工作区干净 |
| P0-3 DeepSeek fallback 规则引擎 | ✅ | `server/teacherFallbackRules.js` 输出 lessonFocus/riskStudents/commonMisconceptions/evidence，含单测 |
| P0-4 提交校验 | ✅ | `server/submissionValidation.js`：challengeId 校验、score 0-100、passed 与分数一致性、硬件后端复判 `gradeHardwareBuild`、电路结构 `validateCircuitStructure`、locked 关卡拒绝 |
| P0-5 备份入口 | ✅ | `GET /api/admin/backup`（逻辑快照）、`GET /api/admin/db-info`；单测验证备份不含明文密码 |
| P1-1 学生 Markdown 报告 | ✅ | `GET /api/student/report.md`，`server/studentReport.js` |
| P1-2 笔记增强 | ✅ | notes 表含 `challenge_id`/`updated_at`；PUT/DELETE/搜索/标签/关卡关联均已实现 |
| P1-3 Undo/Redo | ✅ | `CircuitFlowCanvas.jsx` history stack + Ctrl+Z/Y；`labHistory.test.mjs` 覆盖 |
| P1-5 班级归档与账号生命周期 | ✅ | classes.status/archived_at；disable/enable/transfer 接口；归档班级默认不显示 |
| P1-6 看板准实时刷新 | ✅ | `TeacherDashboard.jsx` 每 45 秒自动刷新 + 最后更新时间 + 手动刷新 |
| P2-3 安全增强 | ✅ | 登录失败计数限流（5 次/60s）、CSRF Origin 校验、`security.js` |
| P2-5 数据库迁移版本表 | ✅ | `schema_migrations` 表 + `migrate.js` 幂等 |
| P2-6 前端错误边界 | ✅ | `ErrorBoundary` 包裹主应用/实验台/教师/学生记录 |

## 3. 待完善的需求

### P0 级（建议优先处理）

**P0-2 教师学生详情增强 —— 部分完成**
- 已有：`timeDistribution`（耗时分布）、`scoreTrends`（得分趋势，等同 attemptTrend）、`hardwareSummary`（硬件经营）。
- 缺失：
  - `errorProfile`（高频错误按错误类型分组）后端未输出，前端无对应区域。
  - `noteLinks`（笔记按关卡关联展示）后端 notes 已带 challenge_id，但学生详情前端只列笔记列表，未按关卡分组渲染"笔记与反思"区域。
  - "学习概览"（完成率/平均分/累计耗时/总尝试次数聚合卡）在前端学生详情中未见独立区域。
- 影响：教师打开详情能看耗时和趋势，但"10 秒内判断该补哪类知识点"的目标在错误维度上还不完整。

**P0 环境问题：测试失败 37 个**
- 详见第 4 节，需先 `npm rebuild better-sqlite3`。

### P1 级

**P1-4 空状态与首次引导 —— 部分完成**
- 已有：学生记录页空状态（"完成第一个实验关卡后…"）、教师看板无班级时提示"请先创建班级后导入学生"。
- 缺失：
  - 新学生首页首次引导（"建议从第一章计算机概述开始"）未见。
  - 教师有班级但无提交时的空状态（"让学生登录并完成第一关"）未明确。

**P1-5 班级归档导出 —— 缺失**
- `GET /api/teacher/classes/:id/archive.zip`（班级完整成绩包下载）未实现。当前只有 `export.csv` 单科成绩导出，缺整班成绩+证据包。

### P2 级

**P2-1 关卡先决条件 —— 部分完成**
- 已有：后端 `submissionValidation` 拒绝 locked 关卡提交；前端 `platformLogic` 有 locked 状态。
- 缺失：教师可配置"是否允许跳关"的开关未见；学生可浏览后续关卡说明但不可提交的交互未验证。

**P2-2 课程总体完成概览 —— 部分完成**
- 已有：学生首页有完成率、平均分、累计耗时、下一推荐关卡（`nextRecommendedChallenge`）。
- 缺失："完成 x/y 关"显式计数、"预计剩余课时"未见。

**P2-4 结构化日志与深度健康检查 —— 部分完成**
- 已有：`/api/health` 深度检查（db 读写、磁盘、版本、uptime）；请求日志中间件（含响应耗时）。
- 缺失：
  - `audit_logs` 表（PRD 9.4）未创建，登录失败/导入/重置密码/导出/AI 调用/备份下载等关键操作无审计落库。
  - 登录失败、学生导入、AI 调用的专项结构化日志未与通用请求日志区分。

**P2-3 安全 —— 部分完成**
- 已有：登录限流、CSRF Origin 校验。
- 缺失：session 列表与一键下线、密码强度提示、cookie 更严格 SameSite 配置项待确认。

### 未在 PRD 编号但属于第三阶段"学生复盘闭环"

**错题本 —— 缺失**
- PRD 第 13 节第三阶段列出"错题本"，当前 `styles.css` 有 `.mistake-*` 样式残留，但无错题本独立入口/页面/数据聚合。学生只能在学习记录里看到 `weakSpot` 文案，无法按关卡+错误类型回顾错题。

### 教师设置页运维信息

**TeacherSettingsPanel 备份提示 —— 缺失**
- `GET /api/admin/db-info` 已提供数据库路径等信息，但 `TeacherSettingsPanel.jsx` 未展示"数据库路径/最近备份时间/建议备份频率"提醒。教师看不到备份状态。

## 4. 测试与构建状态（关键）

运行 `npm.cmd test` 结果：**239 项中 202 通过，37 失败**。

根因：`better-sqlite3` 原生模块编译版本与当前 Node 不匹配：
```
was compiled against NODE_MODULE_VERSION 137.
This version requires NODE_MODULE_VERSION 127.
```
所有 37 个失败用例都是加载 better-sqlite3 的测试（app/classroom/assignment/notes/teacherAssistant/demo/migrate 等），纯逻辑测试全部通过。

修复命令：
```bash
cd prototype
npm rebuild better-sqlite3
# 若仍失败，确认 node 版本后重装：
# npm install better-sqlite3 --build-from-source
```

这是环境问题，不是代码缺陷；但 PRD 第 12 节验收要求"npm test 通过"，当前不满足，**必须在任何功能交付前先恢复绿色测试**。

## 5. 建议实施顺序

1. **修复测试环境**：`npm rebuild better-sqlite3`，恢复 239/239 绿色。
2. **P0-2 收尾**：学生详情补 `errorProfile` 后端字段 + 前端"高频错误/笔记反思/学习概览"区域。
3. **P1-4 + 教师设置页备份提示**：补空状态文案 + 把 db-info 接到 TeacherSettingsPanel。
4. **P1-5 archive.zip**：班级完整成绩包导出。
5. **P2-4 audit_logs**：建表 + 关键操作审计落库（为长期运维打基础）。
6. **错题本**：学生复盘闭环的缺口，按关卡+错误类型聚合。
7. **P2-1/P2-2 收尾**：跳关开关、完成 x/y 计数、剩余课时。
