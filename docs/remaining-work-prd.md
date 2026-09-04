# 课堂实训平台待办 PRD（历史基线与当前状态）

> 2026-09-04 更新：Gitee 最新代码已合并，新的现状、复现证据和分级问题以 [项目同步与问题清单](project-review-2026-09-04.md) 为准。下文 2026-08-12 的“全部完成”表述属于历史判断，不能替代最新审查结论。

日期：2026-08-12（状态校准；原始基线为 2026-07-20）
基线：当前工作树；原始文档基线为 HEAD `95de857` + 3D 修复（2026-07-20 第二轮）
关联文档：
- 原始长期 PRD：`docs/classroom-long-term-prd.md`
- 差距分析：`docs/gap-analysis-2026-07-20.md`
- 3D 实测报告：`docs/3d-exploration-qa-2026-07-20.md`

## 0. 2026-08-12 状态校准

本文第 3～7 节保留的是 2026-07-20 时的需求背景和验收细节，不再代表当前未完成清单。经代码、测试和提交历史复核，原清单中的 P0-A～P0-C、P1-A～P1-E、P2-A～P2-E 均已实现，包括教师学生详情、X-ray、空状态、班级成绩包、备份提示、总线辨识、审计日志、错题本、跳关开关、完成概览、会话/密码安全和 3D 视觉优化。

当前工程基线：

- 自动化测试为 277 项，当前回归目标为 277/277 通过。
- 首屏 JavaScript 已从 588,874 B 降至 454,444 B，并由 `npm run qa:build-budget` 强制限制在 500 KiB 内；检查会先生成 Vite manifest，再递归统计入口及其静态依赖。
- 通用实验页面已与 3D 场景拆分；普通实验页面产物约 51.92 KiB，不再预加载 Three.js 场景。
- 硬件装机主图已由 1.69 MB PNG 替换为约 95 KB WebP，并由 `npm run qa:assets` 约束资源预算。

当前剩余事项：

1. **P3-A：3D 专项包已完成。** `OverviewExplodedView` 已迁移到原生 Three.js，移除 R3F/Drei；其增量静态依赖为 151,463 B gzip，所有相关块均低于 500 KiB，并由 `npm run qa:3d-budget` 约束。
2. **P3-B：守住首屏预算。** 当前入口距离 500 KiB 上限约有 57 KiB 余量；新增页面应继续使用导航级动态导入，CI/发布检查需执行 `npm run qa:build-budget`。
3. **发布前专项验收。** 除 `npm test`、`npm run build`、`npm run qa:ui`、`npm run qa:assets` 外，涉及课堂或 3D 的发布应按改动范围执行对应课堂负载与 3D 浏览器脚本。

## 1. 文档目的

本文档原用于汇总 2026-07-20 时未完成或未闭环的需求；现保留为历史验收依据。当前待办只以第 0 节的状态校准为准。

## 2. 2026-07-20 原始状态总结（已归档）

截至 2026-07-20，原始 PRD 中 P0-1（拆分提交）、P0-3（fallback 规则引擎）、P0-4（提交校验）、P0-5（备份入口）、P1-1（Markdown 报告）、P1-2（笔记增强）、P1-3（Undo/Redo）、P1-5（班级归档与账号生命周期）、P1-6（看板自动刷新）、P2-3（安全增强，部分）、P2-5（迁移版本表）、P2-6（错误边界）均已完成。

3D 计算机组成探索关卡的爆炸效果、部件可识别性、连接线可见性、布局重叠、aria-label 转义、自动动画问题已在 2026-07-20 第二轮修复并通过浏览器实测验证。

当时的剩余待做项集中在：教师学生详情分析收尾、学生复盘闭环（错题本）、运维可观测性（audit_logs）、若干 P1/P2 收尾项，以及测试环境修复；这些项目现均已完成。

## 3. 历史待做需求（均已归档完成）

### P0-A. 修复测试环境（阻塞项）

**背景**

`npm test` 当前 239 项中 37 项失败，全部是加载 `better-sqlite3` 原生模块的测试。根因是该模块编译时使用 NODE_MODULE_VERSION 137（Node 24），而托管 Node 为 22.22.2（NODE_MODULE_VERSION 127）。

**需求**

- 在项目使用的 Node 版本下重建 `better-sqlite3`，恢复 239/239 绿色。
- 在 `package.json` 或部署文档中明确标注项目要求的 Node 版本，避免后续环境漂移。
- 若无法重建（缺 C++ 构建工具），降级方案：在 CI/部署文档中指定使用 Node 24 运行后端。

**验收标准**

- `npm test` 全部通过（0 失败）。
- `npm run build` 通过。
- 部署文档明确 Node 版本要求。

---

### P0-B. 教师学生详情增强收尾（原 P0-2）

**背景**

`getTeacherStudentDetail`（`server/db.js:498`）已返回 `progress`、`notes`、`attempts`、`timeDistribution`、`scoreTrends`、`hardwareSummary`，前端 `TeacherDashboard.jsx` 已渲染 TimeDistPanel、ScoreTrendsPanel、HardwarePanel。但以下维度缺失，教师无法在 10 秒内判断学生最需要补哪类知识点。

**需求**

后端 `GET /api/teacher/classes/:id/students/:studentId` 增加字段：

- `errorProfile`：按 `errors_json` 聚合的错误类型频次表，包含 `errorType`、`count`、`lastSeen`、`relatedChallengeIds`。识别"连续重复错误"（同一错误类型在最近 3 次提交中重复出现）。
- `noteLinks`：笔记按 `challenge_id` 分组，输出 `{ challengeId, challengeTitle, notes: [...] }`。当前 notes 表已支持 `challenge_id`，直接分组即可。
- `learningOverview`：聚合卡，包含 `completionRate`、`averageScore`、`totalTimeMinutes`、`totalAttempts`、`completedCount`、`totalCount`。

前端学生详情增加区域：

- **学习概览**：顶部聚合卡，展示完成率、平均分、累计耗时、总尝试次数。
- **高频错误**：按错误类型分组展示，标注频次和关联关卡，连续重复错误用警示色标记。
- **笔记与反思**：按关卡分组展示笔记，空关卡显示"暂无反思"。

**验收标准**

- 教师打开学生详情后，能在 10 秒内判断该学生最需要补哪一类知识点。
- 对至少 3 名演示学生，详情页能显示不同的风险原因（不是同一套文案）。
- 学生没有提交时显示可行动空状态（"完成第一个实验后这里会出现分析"）。
- API 集成测试覆盖教师不能查看非自己班级学生（已有，回归不破）。
- `errorProfile` 单元测试覆盖"连续重复错误"识别逻辑。

---

### P0-C. 3D 连接线装配态可见性

**背景**

3D 修复后，连接线在爆炸态可见（红色供电线最醒目），但装配态下连接线被部件遮挡完全看不到。虽然真实电脑内部连线也是看不见的，但教学场景需要让学生理解"部件之间如何连接"。

**需求**

- 新增"X-ray 模式"切换按钮，开启后连接线穿透部件渲染（`depthTest={false}` 或单独渲染层），在装配态也能看到数据/地址/控制/供电总线走向。
- X-ray 模式下部件半透明（opacity 降低），连接线高亮。
- 默认关闭，用户主动开启。

**验收标准**

- 装配态开启 X-ray 后，4 类总线清晰可见。
- 关闭 X-ray 后恢复原装配态视觉。
- 模式切换不影响 OrbitControls 交互。

---

### P1-A. 空状态与首次引导收尾（原 P1-4）

**背景**

学生记录页空状态已有，教师看板无班级空状态已有。但以下场景空状态缺失。

**需求**

- **新学生首页**：首次登录且无任何进度时，显示"建议从第一章「认识计算机五大部件」开始探索"，并提供一键进入按钮。
- **教师有班级无提交**：显示"让学生登录并完成第一关，提交数据会出现在这里"，附带"查看导入模板"链接。
- **学生无笔记**：笔记页显示"在实验过程中点击「记笔记」可以记录你的发现"。

**验收标准**

- 每个空状态不出现大片空白。
- 每个空状态都提供一个明确的下一步按钮或链接。

---

### P1-B. 班级完整成绩包导出（原 P1-5 补充）

**背景**

当前只有 `GET /api/teacher/classes/:id/export.csv` 导出单科成绩。长期课堂需要导出包含成绩、尝试记录、笔记摘要、硬件配置的完整证据包。

**需求**

- `GET /api/teacher/classes/:id/archive.zip`：导出班级完整成绩包。
- 包含内容：
  - `scores.csv`：逐关成绩汇总（现有 CSV 逻辑复用）。
  - `attempts.json`：每个学生的提交记录（含 errors、result_json、时间戳）。
  - `notes.json`：学生笔记（按学生+关卡组织）。
  - `hardware.json`：硬件挑战配置、报价、利润、满意度。
  - `summary.json`：班级整体指标。
- 文件名包含班级名和日期。

**验收标准**

- 教师点击"导出成绩包"后下载 `.zip` 文件。
- 解压后包含上述 5 个文件，数据完整。
- 不包含明文密码、session、cookie。
- 导出 150 名学生班级在 10 秒内完成。

---

### P1-C. 教师设置页备份提示

**背景**

`GET /api/admin/db-info` 已提供数据库路径等信息，但 `TeacherSettingsPanel.jsx` 未展示。教师看不到备份状态和数据库位置。

**需求**

- `TeacherSettingsPanel` 新增"数据与备份"区域，展示：
  - 数据库文件路径（来自 `/api/admin/db-info`）。
  - 数据库大小。
  - "下载备份"按钮（调用 `/api/admin/backup`）。
  - 建议备份频率提示（"建议每次课后或导入学生前备份一次"）。
  - 恢复备份的操作说明链接（指向部署文档）。

**验收标准**

- 教师打开设置页能看到数据库路径和备份按钮。
- 点击"下载备份"能成功下载 `.sqlite` 文件。
- 备份文件不含明文密码（已有测试覆盖，回归不破）。

---

### P1-D. 3D 数据/地址/控制总线辨识度提升

**背景**

3D 修复后红色供电线最醒目，但蓝色数据总线、绿色地址总线、黄色控制总线在爆炸态下路径较短且相互重叠，辨识度不如供电线。

**需求**

- 数据/地址/控制总线 thickness 再提升一档（当前 0.016-0.022，提升到 0.024-0.028）。
- 在连接线中点增加小标签牌（悬浮文字标注"数据总线""地址总线"等），鼠标 hover 时高亮该线。
- 数据流粒子加大（当前 radius 0.028，提升到 0.035）并增加尾迹效果。

**验收标准**

- 爆炸态下 4 类总线颜色可辨、走向清晰。
- hover 连接线时显示标签且该线高亮。
- 性能不退化（150 学生课堂 PC 仍流畅）。

---

### P2-A. 结构化审计日志（原 P2-4 补充）

**背景**

当前有通用请求日志和 `/api/health` 深度检查，但关键操作无审计落库，长期运维无法追溯"谁在什么时候做了什么"。

**需求**

新增 `audit_logs` 表：

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_role TEXT,
  action TEXT NOT NULL,        -- 'login_success' | 'login_failure' | 'import_students' | 'reset_password' | 'export_csv' | 'export_archive' | 'ai_report' | 'backup_download' | 'archive_class' | 'disable_student'
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

记录以下操作：
- 登录成功/失败。
- 学生导入。
- 密码重置。
- 成绩导出（CSV / archive.zip）。
- AI 报告生成。
- 备份下载。
- 班级归档/恢复。
- 学生停用/启用/转班。

API：
- `GET /api/teacher/audit-logs?action=&from=&to=&page=`：教师查看自己班级相关审计日志，分页。

**验收标准**

- 上述 8 类操作均落库 `audit_logs`。
- 教师可在设置页查看审计日志（按操作类型和时间筛选）。
- 审计日志不含密码、session token、cookie。
- 单元测试覆盖每类操作的落库。

---

### P2-B. 错题本（学生复盘闭环）

**背景**

PRD 第 13 节第三阶段列出"错题本"，当前 `styles.css` 有 `.mistake-*` 样式残留但无实际功能。学生只能在学习记录里看到 `weakSpot` 文案，无法按关卡+错误类型回顾具体错题。

**需求**

后端：
- `GET /api/student/mistakes?challengeId=&errorType=`：返回学生错题列表，按 `challenge_attempts.errors_json` 聚合，包含 `challengeId`、`challengeTitle`、`errorType`、`firstSeen`、`lastSeen`、`count`、`attemptSnapshots`（最近 3 次相关提交摘要）。
- 错题判定规则：`passed=false` 且 `errors` 非空的提交记为错题。

前端：
- 学生主导航新增"错题本"入口。
- 错题本页面：
  - 顶部总览：错题总数、涉及关卡数、最高频错误类型。
  - 按关卡分组展示错题，每条显示错误类型、频次、最近时间。
  - 每条错题提供"回到该关卡练习"按钮。
  - 空状态："暂无错题，完成实验后这里会记录你的易错点。"

**验收标准**

- 学生提交失败后，错题本能看到该错误记录。
- 同一错误类型多次出现时合并显示并标注频次。
- 学生可从错题本一键跳回对应关卡。
- 教师查看学生详情时能看到该学生的错题概览（复用 `errorProfile`）。

---

### P2-C. 关卡先决条件开关（原 P2-1 补充）

**背景**

后端 `submissionValidation` 已拒绝 locked 关卡提交，前端 `platformLogic` 有 locked 状态。但教师无法配置"是否允许跳关"。

**需求**

- 班级设置增加"允许跳关"开关（`classes` 表加 `allow_skip_locked INTEGER DEFAULT 0`）。
- 后端 `submissionValidation` 读取该开关，开启时跳过 locked 检查。
- 前端学生路线图在跳关开启时，后续关卡不再 disabled。
- 教师设置页提供开关控件。

**验收标准**

- 默认不允许跳关，未完成前置关卡时不能提交后续关卡。
- 教师开启跳关后，学生可浏览并提交任意关卡。
- 开关状态在班级设置页可见可改。

---

### P2-D. 课程总体完成概览收尾（原 P2-2 补充）

**背景**

学生首页有完成率、平均分、累计耗时、下一推荐关卡，但缺"完成 x/y 关"显式计数和"预计剩余课时"。

**需求**

- 学生首页顶部总览增加：
  - "已完成 x / y 关"显式计数。
  - "预计剩余课时"：基于已完成关卡的累计耗时和平均每关耗时推算剩余课时（向上取整）。
- 关卡总数 `y` 从 `LEARNING_ITEMS` 动态计算。

**验收标准**

- 学生登录 5 秒内能理解整体进度和下一步。
- 完成计数随提交实时更新。
- 剩余课时推算合理（无数据时显示"暂无估算"）。

---

### P2-E. 安全收尾（原 P2-3 补充）

**背景**

登录限流、CSRF Origin 校验已完成。session 管理、密码强度仍缺。

**需求**

- **session 列表与一键下线**：
  - `GET /api/teacher/sessions`：教师查看自己所有活跃 session（设备、IP、最后活跃时间）。
  - `DELETE /api/teacher/sessions/:id`：一键下线指定 session。
- **密码强度提示**：
  - 学生首次登录或重置密码时，前端提示密码强度（弱/中/强）。
  - 后端不强制（保持初始密码可用），仅前端提示。
- **cookie 配置**：确认 `SameSite=Lax` 或 `Strict`，`Secure` 在 HTTPS 下启用。

**验收标准**

- 教师可在设置页查看自己的活跃 session 并下线。
- 学生修改密码时看到强度提示。
- cookie 配置符合预期（文档化）。

---

### P1-E. 3D 拆解视图视觉优化（2026-08-04 新增）

**背景**

3D 拆解视图已用 three.js（react-three-fiber）渲染，部件建模精细（`computerParts.js`：PCB 金属度/粗糙度、金手指、风扇叶片、线缆等复合几何体），但整体观感差。实测诊断出三个明确问题：

1. **无环境贴图（最关键）**：`MeshStandardMaterial` 金属度 0.8~0.95，但场景没有 `Environment`/`scene.environment`。PBR 金属材质没有可反射的环境 → 金属件渲染成近黑色、无质感。
2. **渲染质量被压低**：`ComputerExplodedView.jsx` 的 `<Canvas dpr={1} gl={{ antialias: false, powerPreference: "low-power" }}>` → 边缘锯齿严重、分辨率低，观感廉价。
3. **未开阴影**：部件 mesh 已标 `castShadow`/`receiveShadow`，但 Canvas 未开 `shadows`，方向光未配 shadow 相机 → 光照扁平、部件"悬浮"。

> 根因推断：上述设置是为 AGENTS.md 的课堂电脑性能目标（150 学生、4 核集显、1366×768）刻意压低，但压低过头，叠加无环境贴图导致观感崩塌。

**需求**

1. **离线环境贴图（最大提升）**：
   - 使用 three 自带 `RoomEnvironment`（`three/examples/jsm/environments/RoomEnvironment.js`）+ `PMREMGenerator` 生成 `scene.environment`，**不依赖网络 CDN**（离线课堂可用）。
   - 备选：drei `<Environment>` + `<Lightformer>` 程序化生成。
   - 需在组件卸载时 `dispose()` 纹理与 PMREM，避免泄漏。
2. **渲染质量**：`dpr` 提到 `[1, 1.5]`，`antialias: true`；保留 `powerPreference: "low-power"`。低端机降级路径：WebGL 不可用时仍走 `ThreeSceneFallback`。
3. **阴影与光照**：
   - Canvas 开 `shadows`；主方向光 `castShadow`、`shadow-mapSize` 取 1024（可调 512 保性能）。
   - 补一盏暖色辅助光（提升立体感）+ 一盏 rim/背光（勾勒边缘）。
   - 评估是否需要 shadow-receiving 地面（Grid 是否接收阴影）。
4. **观感验证**：用 Playwright 截图对比优化前后（可复用 `scripts/verify-3d.mjs` 的登录与导航流程），确认金属反光、边缘、立体感均有改善，且页面无 `pageerror`。

**验收标准**

- 金属部件（CPU 顶盖、金手指、硬盘外壳、PSU 外壳）有明显反光质感，不再是黑色一团。
- 边缘锯齿明显减少（对比截图）。
- 部件在旋转/缩放时有立体感（阴影或亮度层次），不"悬浮"。
- 离线环境下（无外网）3D 视图正常渲染，不请求外部 HDR 资源。
- `npm run build` 通过；`npm test` 不回归；150 学生课堂 PC 上帧率可接受（保留降级路径）。

## 4. 数据模型变更汇总

| 表 | 变更 | 关联需求 |
|---|---|---|
| `audit_logs` | 新建表 | P2-A |
| `classes` | 加 `allow_skip_locked INTEGER DEFAULT 0` | P2-C |

所有变更通过 `migrate.js` 幂等执行，`ensureColumn` 兼容旧库。

## 5. API 清单

| 方法 | 路径 | 说明 | 关联需求 |
|---|---|---|---|
| GET | `/api/teacher/classes/:id/students/:studentId` | 增加 errorProfile/noteLinks/learningOverview | P0-B |
| GET | `/api/teacher/classes/:id/archive.zip` | 班级完整成绩包 | P1-B |
| GET | `/api/teacher/audit-logs` | 审计日志查询 | P2-A |
| GET | `/api/student/mistakes` | 学生错题列表 | P2-B |
| GET | `/api/teacher/sessions` | 教师活跃 session 列表 | P2-E |
| DELETE | `/api/teacher/sessions/:id` | 下线指定 session | P2-E |

## 6. 验收计划

每次交付前必须运行：

```bash
cd prototype
npm test
npm run build
```

建议新增验收脚本覆盖：
- 教师查看学生详情，看到 errorProfile 和 noteLinks。
- 学生导出错题本数据。
- 教师导出班级 archive.zip。
- 审计日志落库验证。
- 3D X-ray 模式切换。
- 跳关开关开启后学生可提交任意关卡。

## 7. 历史推荐实施顺序（已执行）

**第一阶段：解除阻塞**

1. P0-A 修复测试环境（`npm rebuild better-sqlite3` 或锁定 Node 版本）。

**第二阶段：教师决策增强收尾**

2. P0-B 学生详情 errorProfile/noteLinks/learningOverview（后端+前端）。
3. P1-A 空状态收尾 + P1-C 教师设置页备份提示。
4. P1-B 班级 archive.zip 导出。

**第三阶段：3D 教学体验打磨**

5. P0-C 3D X-ray 模式（装配态连接线可见）。
6. P1-D 3D 总线辨识度提升（标签牌+粒子尾迹）。
7. P1-E 3D 拆解视图视觉优化（离线环境贴图+渲染质量+阴影）。

**第四阶段：学生复盘闭环**

8. P2-B 错题本（后端聚合+前端页面+教师详情复用）。
9. P2-D 课程总体完成概览收尾（x/y 计数+剩余课时）。

**第五阶段：长期运维与安全**

10. P2-A audit_logs 建表 + 8 类操作落库 + 查询 API。
11. P2-C 跳关开关。
12. P2-E session 管理 + 密码强度 + cookie 配置。

## 8. 接手者注意事项

- 修改源码后检查 `rg -n "\?{3,}|�"` 排除编码问题。
- JSX 属性字符串中不要用 `\u` 转义，直接写中文或用 `{"中文"}` 表达式。
- 不要提交 `.hermes/`，已 gitignore。
- 不要把学生原始完整笔记、密码、session、cookie 发给 AI。
- better-sqlite3 原生模块需要与运行时 Node 版本匹配，CI 和部署必须统一 Node 版本。
- 3D 相关改动后用浏览器实测（`agent-browser` 或 `scripts/verify-ui.mjs`），不要只看构建是否通过。
