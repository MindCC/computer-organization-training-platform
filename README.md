# 计算机组成原理实训平台

面向高校《计算机组成原理》课程的课堂实训平台。教师创建班级、导入学生、开课并实时掌握学情；学生沿课程地图完成电路装配、3D 拆解探索、硬件配置等挑战，并通过错题本、学习笔记形成复盘闭环。

技术栈：React 19 + Vite 6 + Express 5 + better-sqlite3 + React Flow + Three.js（react-three-fiber）+ GSAP。

## 功能总览

### 学生端
- **课程地图（Quest Learning Map）**：电路装配路线图，从五大部件到 ALU 逐关解锁，任务卡显示目标、预估耗时与尝试次数
- **电路实验工作台**：拖拽连线搭建电路，实时数据流检测、自动评分、分级提示，支持 Undo/Redo
- **3D 计算机拆解**：可交互的三维整机拆解/装配演示，X-ray 模式透视总线走向，PBR 离线渲染
- **硬件配置挑战**：在预算、性能、满意度之间做真实取舍，模拟装机与报价
- **错题本**：自动聚合未通过提交，按关卡 + 错误类型分组，一键回到该关卡练习
- **学习笔记 / 学习记录 / 课后作业 / 课程课件**：完整的学习闭环
- **个人设置**：资料、提示模式、密码强度提示与修改

### 教师端
- **学情概览看板**：班级完成率、平均分、高频错误、硬件挑战瓶颈，45 秒自动刷新
- **学生详情**：学习概览、逐关最佳成绩、最近提交、高频错误画像、笔记与反思
- **智能助教**：DeepSeek 生成课堂行动建议（本地规则降级兜底）
- **课堂任务**：四阶段课堂循环（草稿 → 开课 → 暂停/恢复 → 结束），学生自动发现、提交，防重复幂等
- **课程工作台**：教师审核并发布课程、分配项目小组、集中评价学生里程碑；学生可提交和修改未评价的个人反思
- **课后作业**：在线布置、自动批改（选择/判断/填空）+ 简答人工批改、学情分析
- **班级管理**：导入学生（CSV 模板）、重置密码、停用/启用/转班、归档、跳关开关
- **数据导出**：单科 CSV、完整成绩包（archive.zip，含成绩/提交/笔记/硬件/班级汇总）、数据库备份
- **审计日志**：登录、导入、导出、备份等关键操作留痕，可按类型与时间筛选

## 快速开始

```bash
cd prototype
npm install
npm run seed:teacher   # 创建教师账号（默认 teacher / ChangeMe123!，可用 TEACHER_PASSWORD 覆盖）
npm run seed:demo      # 生成演示班级与演示数据
```

启动两个服务（API 在前，Vite 代理 `/api` 到它）：

```bash
# 终端 1：Express API（端口 8787）
npm run server

# 终端 2：Vite dev（端口 5173）
npm run dev
```

打开 http://127.0.0.1:5173/ 使用学生或教师入口登录。

## 测试与质量门禁

```bash
npm test                    # 全部单元与集成测试
npm run build               # 生产构建
npm run qa:classroom-load   # 150 学生、最多 30 并发的负载门禁（P95 ≤ 2000ms）
npm run qa:ui               # Playwright UI 回归
npm run qa:teacher          # 教师看板定向回归（版块渲染、课堂重连、课件入口）
npm run qa:3d               # 3D 视图浏览器验证
npm run qa:classroom        # 基于生产构建的双上下文课堂流程回归
```

课堂负载门禁为 150 名学生、最多 30 并发、P95 ≤ 2000ms、无 SQLITE_BUSY。真实教室的设备与网络试运行需在部署前单独验收。

> `qa:classroom-load` 是进程内的服务层微基准（内存库、同步调用），用于拦住明显的性能回归；它不等价于 HTTP 并发压测，不会产生 `SQLITE_BUSY`。真实并发验收需要另行压测实际服务端口。

## 项目结构

```
prototype/
├── server/                  # Express 后端
│   ├── app.js               # 路由、鉴权、审计、导出
│   ├── db.js                # SQLite schema、迁移、CRUD
│   ├── classroomSession*.js # 课堂会话状态机/评分/仓储
│   ├── assignment*.js       # 课后作业
│   ├── classArchiveService.js / zipArchive.js  # 成绩包导出
│   └── ...
├── src/
│   ├── components/          # React 组件（学生/教师/课堂/3D）
│   ├── quest/               # 课程地图 UI（QuestMap/CurrentQuestPanel 等）
│   ├── circuit/             # 电路模型、仿真、提示、故障注入
│   ├── hooks/               # useLabState / useClassroomSession 等
│   ├── questExperience.js / teacherQuest.js / mistakeBook.js  # 纯视图模型
│   └── platformLogic.js     # 关卡定义与学习进度
└── docs/                    # PRD、差距分析、部署文档
```

## 部署

单机部署：`npm run build` 后将 `dist/` 交给 Express 静态服务（`npm run server` 已内置），SQLite 单文件即数据库，备份 = 下载 `.sqlite` 文件。

- 部署与回滚：`docs/classroom-deployment.md`
- 长期规划：`docs/classroom-long-term-prd.md`
- Cookie 安全：`HttpOnly + SameSite=Lax`，HTTPS 下设置 `COOKIE_SECURE=1` 启用 `Secure`

### 环境变量

`prototype/.env.example` 中有完整示例（含注释）。核心变量：

| 变量 | 必填 | 说明 |
|------|------|------|
| `SESSION_SECRET` | 生产必填 | 会话签名密钥；生产模式缺失默认值时拒绝启动 |
| `DEEPSEEK_API_KEY` | 否 | 智能助教密钥；缺失时自动降级为本地规则建议 |
| `DATABASE_PATH` | 否 | SQLite 路径（默认 `data/classroom.sqlite`） |
| `PORT` | 否 | 服务端口（默认 8787） |
| `COOKIE_SECURE` | 否 | HTTPS 部署置 `1`（或 `true`），为 cookie 加 Secure 标记 |
| `PUBLIC_BASE_URL` | 否 | 前端外部地址，用于 CSRF Origin 校验；HTTPS 反代部署时必填 |
| `TRUST_PROXY` | 否 | 反向代理后面部署时置 `1`，信任 `X-Forwarded-For`；**直接对外暴露时必须留空**，否则可伪造成源 IP 绕过按 IP 的登录限流 |
| `TRUST_PROXY_HOPS` | 否 | 反向代理层数（默认 1） |
| `TEACHER_USERNAME` / `TEACHER_PASSWORD` / `TEACHER_NAME` | 否 | 首次 `npm run seed:teacher` 的教师账号 |

> 项目不加载 `.env` 文件（未内置 dotenv），需在启动前 `export` 或由进程管理器（pm2 / systemd）注入；`.env` 已加入 `.gitignore` 防止误提交密钥。

### 学生账号与初始口令

- CSV 导入时若**未提供初始密码列**，服务端为每个新账号生成一次性随机口令，并在导入结果中返回；教师端「课堂设置 → 学生导入」会列出这些口令并提供「下载初始口令 CSV」，请在导入后立即发放。
- 使用该一次性口令的账号**首次登录必须先修改密码**：服务端会拒绝其它业务接口（`403 PASSWORD_CHANGE_REQUIRED`），界面弹出阻断式改密页。
- 教师重置学生密码后同样要求该学生下次登录改密；未显式指定新密码时由服务端生成随机口令并回显给教师。
- CSV 中显式写入的初始密码视为教师有意设定，不强制改密。
- 同一名学生可以同时加入多位教师的班级；导入不会改写他班学生已有的资料，也不会复活被停用的账号。

### 课程课件

「课程课件」是学生与教师共用的入口（教师侧边栏同样可见）。教师上传 PPTX 时需先在页面上的「发布班级」选择器中选择班级；未选择时会给出提示。课件由 `soffice` 转换为 HTML 后在同源 iframe 中以沙箱方式演示，并附带严格的 CSP。

### 安全相关行为（部署前请知悉）

- **登录限流**：按用户名（5 次/分钟）与来源 IP（30 次/分钟）双维度拦截；任一命中返回 429。成功登录会同时清除两个维度，避免共享出口 IP 的教室被个别学生输错密码拖垮。
- **改密后吊销其他会话**：`/api/auth/change-password` 会踢掉该账号的其它设备会话，仅保留当前会话。
- **整库备份需二次确认**：`POST /api/admin/backup` 需要请求体里带上**本人当前口令**（`{"password":"..."}`），教师端「数据与备份」区块内置了输入框。快照为原始 `.sqlite` 文件，可直接用于恢复；GET 方式已移除。
- **智能助教不发送学生身份**：发往 DeepSeek 的载荷中，学生只用代号（`学生1`、`学生2`…），不含姓名与学号；AI 返回的代号会在服务端映射回真实姓名，教师界面显示不变。本地规则降级不走网络，因此仍使用真实姓名。

## 环境要求

- Node.js ≥ 22（better-sqlite3 原生模块需与运行时 Node 版本匹配，CI 与部署须统一版本）
- 浏览器：Chrome / Edge 最新稳定版
- 课堂性能目标：4 核 CPU、8GB 内存、集显、1366×768 的普通 Windows 电脑
