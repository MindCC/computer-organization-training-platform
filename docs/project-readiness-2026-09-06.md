# 使用标准检查报告

检查基线：358ee30。检查时间：2026-09-05 至 2026-09-06。Windows、Node 24.13.1、npm 11.8.0；独立无头浏览器。本轮未修改业务代码，未操作真实班级数据。复现脚本、截图和日志在 prototype/qa-artifacts/readiness/。

## 结论

当前不达到正式课堂部署标准。基础功能和开发模式多数检查通过，但存在生产 3D 模块加载错误、两处已确认越权、项目修改不保存的问题。不能以单元测试全绿替代发布验收。

## 实际检查结果

| 检查 | 结果 | 边界 |
|---|---|---|
| npm test | 305/305 通过 | 单元及 API 集成 |
| 补跑 components、motion、scripts 测试 | 9/9 通过 | 默认 test 命令遗漏这三处 |
| npm run build -- --manifest | 通过，有循环分包警告 | 编译成功不代表浏览器运行成功 |
| 资源、首屏 JS、3D 预算 | 全通过 | 首屏 JS 459130 B；3D 增量 gzip 155427 B |
| npm run qa:ui | 通过 | 使用 Vite 开发服务 |
| npm run qa:3d | 32/32 通过 | 拖放、错插、拆装、自检、移动端、WebGL 降级 |
| npm run qa:performance | 通过 | 十次进出，堆增长 2328172 B；60.31 FPS，P95 帧间隔 16.7 ms；本机开发服务 |
| npm run qa:classroom | 失败 | 登录定位器仍精确匹配旧账号标签与旧按钮文案 |
| 调整定位器后的课堂诊断副本 | 部分通过 | 教师创建及开课通过；生产学生概述页面缺少分步组装，后续未完成 |
| 生产 dist UI 回归 | 失败 | 概述关卡直接进入静态降级 |
| 生产 dist 性能检查 | 失败 | 进入概述后没有 canvas，无法完成帧率测量 |
| 生产模块直接加载 | 确认失败 | WebGL2 可用；模块 import 抛 ReferenceError |
| 原有 150 人服务负载门禁 | 通过 | P95 25ms；内存 SQLite、同步服务调用，非 HTTP 压测 |
| 新增文件 SQLite + HTTP 负载 | 通过 | 150 学生、30 并发；登录、课堂发现、提交各 150 请求；P95 1044/81/190ms，450 请求无失败 |
| npm audit --json | 未通过 | 4 个 high、1 个 moderate 依赖项，0 critical |
| 项目页面修改后再提交 | 确认缺陷 | HTTP 200 返回旧反思，新内容未保存 |

## P1：发布前必须处理

1. **生产 3D 模块初始化失败。** `prototype/vite.config.mjs:14` 将 Three.js 手动拆为 three-renderer 与 three-core，构建明确警告互相循环依赖。本机 Edge 中 WebGL2 为 true，但加载 OverviewExplodedView 生产模块抛出 `ReferenceError: Cannot access 'vt' before initialization`，堆栈指向 `three-renderer-iPVk_kmx.js:1:4123`。页面被错误边界降级成静态内容。应消除有初始化依赖的循环分包，并在 dist 上验收概述及装机页。证据：production-import.log、production-ui.log、performance.log。

2. **其他教师可伪造身份建立小组。** `prototype/server/courseWorkbenchRoutes.js:30` 在认证 teacherId 后展开 req.body。隔离教师 B 正常访问 A 的课程返回 404；加入 A 的 teacherId 后返回 201，数据库出现新小组。身份、课程 ID 必须来自认证上下文与 URL，正文采用字段白名单。证据：security-probes.mjs，断言验证数据库写入。

3. **学生可代他人提交项目。** 同文件第 45 行在认证 studentId、路由 projectId/milestoneId 后展开 req.body。非项目成员正常请求返回 404；正文伪造成员 studentId 后返回 200 并保存反思。应对白名单和不同身份/项目组合增加拒绝测试。证据同上。

4. **项目成果编辑后再次提交会无声丢失修改。** `prototype/src/components/StudentProjects.jsx:20`、`:23` 在编辑时继续使用原 clientSubmissionId；`prototype/server/courseWorkbenchRepository.js:87` 将该标识命中视为重复提交并返回旧记录。真实浏览器首次提交 First saved version，然后修改为 Second edited version，再提交得到 200，但响应仍是 First saved version。每次内容变更应使用新的提交版本标识，同一次请求重试保持原标识。证据：project-ui.mjs、project-ui.log、project-edit-evidence.png。

## P2：功能与工程验收缺口

- **教师项目评价 UI 未接通（静态代码确认）。** apiClient.js 定义 reviewProjectSubmission 和 projectSummary，但全 src 无调用处；TeacherCourseWorkbench 只支持草稿、发布和建立小组。API 集成测试通过不能证明教师在页面能查看、评价成果。
- **课堂 UI 回归脚本过时。** verify-classroom.mjs:64 精确匹配“账号”，实际 aria-label 为“账号（…）”；第 71 行精确匹配“登录”，实际按钮为“登录并继续学习/登录并进入指挥台”。诊断副本修正两处后成功创建并开课，但受生产 3D 缺陷阻塞。
- **默认测试遗漏 9 个用例。** package.json 的 test glob 未包含 src/components、src/motion、scripts。应统一自动发现并补充 dist 浏览器门禁；当前所有 qa 浏览器 npm 脚本由开发服务器承载。
- **依赖公告。** 安装版本为 vite 6.4.2、browserslist 4.28.2、postcss 8.5.15、nanoid 3.3.12、qs 6.15.3。audit 报告前四项 high、qs moderate。前四项主要来自构建工具链，不能直接等同于 Express 生产服务已有可利用漏洞；qs 的具体利用条件本轮未复现。Vite 官方公告列 6.4.3 为对应 Windows 路径绕过漏洞修复版本：https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff 。需升级后重新验证锁文件、构建与运行。
- **文档数字陈旧。** README 的 276 测试与 P95<20ms 和当前实际测试/AGENTS 的 P95≤2000ms 不符。

## 验收范围限制

本次覆盖全部现有 .test.mjs 测试、主要现有浏览器门禁、实际生产包、定向安全与项目提交复现；不宣称覆盖所有业务分支。未完成真实机房集显/8GB 机器多机测试、持续数小时压力与故障恢复、TLS 代理和安全 Cookie 部署验收、全量人工可访问性检查，以及完整作业创建/批改和项目评价浏览器闭环。AI 正常联网生成质量未作为本轮验收结果。

初始沙箱拒绝目录写入与 Node 子进程，经执行授权后完成，不计作项目缺陷。首次自建生产测试服务受宿主 AI 配置干扰，已在服务进程禁用 Key 后重跑；最终生产 UI 失败是可复现的 3D 模块初始化错误。

建议顺序：修复生产 3D 与两处身份覆盖 → 修复项目保存与评价闭环 → 更新依赖和门禁 → 完成真实课堂试运行。当前可以继续开发演示，不建议直接用于正式成绩采集。

## 后续 3D 改进复验（2026-09-06）

用户批准的第一阶段 3D 改进已修复上述生产模块初始化错误：改为无反向渲染依赖的 three-math 与 three-runtime 分包。生产模块导入、概述与装机 32/32 专项通过；新增相机近景/复位、半透明安装预览、错插与取消拖动、按用户/订单恢复装配及配置、刷新后重新自检验证。默认测试命令现已纳入遗漏目录，324/324 通过。

生产性能：概述 60.45 FPS、P95 帧间隔 16.7ms、十次进出堆增长 1834224 B；装机 60.40 FPS、P95 16.7ms、十次进出堆增长 994968 B。这是本机无头浏览器结果，不替代机房设备验收。首屏 JS 459170 B，3D 增量 gzip 157237 B，预算通过。

本轮没有修复本报告的两处课程项目越权、项目重提丢失编辑或依赖公告问题，不能据此将整个平台判为正式可用。Blender 资产仅准备了交付规范，尚未制作或导入新的 GLB 模型。

最终生产包全平台 UI smoke 也已通过，包含登录、师生入口、实验、学习记录与教师看板；证据为 `improved-ui.log`。
