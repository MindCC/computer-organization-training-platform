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
npm test                    # 276 项单元 + 集成测试
npm run build               # 生产构建
npm run qa:classroom-load   # 150 学生并发负载门禁（P95 < 20ms）
npm run qa:ui               # Playwright UI 回归
npm run qa:3d               # 3D 视图浏览器验证
npm run qa:classroom        # 双上下文课堂流程回归
```

所有新功能遵循 RED-GREEN TDD，每次改动独立提交。

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

## 环境要求

- Node.js ≥ 22（better-sqlite3 原生模块需与运行时 Node 版本匹配，CI 与部署须统一版本）
- 浏览器：Chrome / Edge 最新稳定版
- 课堂性能目标：4 核 CPU、8GB 内存、集显、1366×768 的普通 Windows 电脑
