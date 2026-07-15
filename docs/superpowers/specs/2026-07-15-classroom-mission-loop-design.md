# 课堂任务闭环设计规格

日期：2026-07-15

## 1. 目标

在现有班级、关卡、学习进度和提交记录之上，增加一条可长期在普通 Windows 教室运行的课堂实训闭环。首个垂直切片使用“计算机五大部件与数据流”固定任务包，让教师能够创建、开始、暂停、恢复和结束课堂，让学生能够自动发现任务、恢复进度、完成阶段并获得可解释结算。

本设计继续满足以下已确认约束：

- 教师端与学生端同等优先。
- 目标设备为 Windows 10/11、四核 x86-64 CPU、8 GB 内存、集成显卡、1366×768 和受支持的 Edge 稳定版。
- 使用 SQLite、Express、React 和现有判题逻辑，不引入 WebSocket、消息队列或新的运行时依赖。
- 图片、3D、动画、提示文案和实时仿真保留在客户端；服务端只加载版本化任务元数据、最小评分规则和学生提交证据。
- 教师端每 15 秒轻量轮询，学生端每 15 秒只读查询场次状态。
- 首版采用固定任务包，只允许教师配置限时、及格分和是否预留补做。
- 学生拥有个人 XP、1–3 星、连续正确奖励和固定徽章，不公开排名。

## 2. 范围

### 2.1 本期包含

- 教师创建课堂草稿并配置任务参数。
- 严格的 `draft → live ↔ paused → ended` 状态机。
- 学生登录后自动发现所属班级的当前任务。
- 学生首次进入、刷新恢复、短暂断网后的幂等重试。
- 现有关卡提交自动关联活动场次。
- 班级阶段分布、未进入、进行中、已完成、需帮助和最后活动信息。
- 结束课堂时冻结学生结算和班级报告。
- 无 WebGL 学生继续使用现有静态教学降级完成第一阶段。

### 2.2 本期不包含

- 自由关卡编辑器或评分规则编辑器。
- 公开排行榜、小组竞赛或实时多人协作。
- WebSocket、SSE 或精确在线心跳。
- 实际课后补做流程；本期只保存兼容字段。
- 多任务并行、跨班级共享场次或完整 LMS 作业系统。

## 3. 方案选择

采用“课堂场次中心模型”：任务包由代码定义并版本化，数据库保存场次和每名学生的场次状态，现有 `challenge_attempts` 通过可空外键关联场次。

不采用只给班级增加“当前关卡”的方案，因为它无法可靠表达暂停、恢复、多阶段结算和历史课堂。不采用事件流与实时推送方案，因为当前 SQLite 单机部署和低配课堂目标不需要其运维复杂度。

## 4. 任务包定义

共享模块 `prototype/src/shared/classroomMissionDefinitions.js` 导出不可变任务包定义和查询函数。首个任务包：

```javascript
{
  key: "computer-data-flow",
  version: 1,
  title: "计算机五大部件与数据流",
  stages: [
    { id: "components", challengeId: "computer-components", title: "认识五大部件" },
    { id: "program-flow", challengeId: "program-flow", title: "观察程序执行" },
    { id: "instruction-data", challengeId: "instruction-data", title: "区分指令与数据" },
    { id: "data-flow", challengeId: "data-flow", title: "完成综合数据流实训" }
  ]
}
```

场次创建时保存 `template_key`、`template_version` 和评分配置快照。历史场次始终按创建时的版本解释，任务包升级不会重写历史结算。

### 4.1 教学材料与评分内核边界

服务端不保存或渲染关卡图片、3D 模型、动画、完整提示文案和画布状态，也不在学生拖动、旋转或实时仿真时参与计算。

客户端负责：

- 教学文字、图片、3D 场景、动画和操作提示。
- 拖线过程、信号演示和即时非权威反馈。
- 尚未成功提交的页面草稿。

服务端负责：

- 任务包 key、版本、阶段顺序和评分配置快照。
- 当前场次和学生阶段状态。
- 电路必要连接、有限测试用例和纯函数评分。
- XP、星级、徽章、幂等提交和最终成绩。

服务端评分注册表在进程启动时加载一次，不把教学素材写入 SQLite，也不为每次请求复制任务包。学生只上传最小证据：3D 探索阶段上传一次性完成动作；电路阶段上传最多 256 条规范化连线。单次结果体继续限制为 64 KB。

## 5. 数据模型

### 5.1 `classroom_sessions`

```sql
CREATE TABLE classroom_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  template_key TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'live', 'paused', 'ended')),
  duration_minutes INTEGER NOT NULL,
  pass_score INTEGER NOT NULL,
  allow_makeup INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL,
  report_json TEXT,
  started_at TEXT,
  active_started_at TEXT,
  accumulated_active_seconds INTEGER NOT NULL DEFAULT 0,
  paused_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

对 `class_id` 建立仅覆盖 `live/paused` 状态的唯一部分索引，保证同一班级最多一个活动场次。服务层在开始场次前还要检查班级成员是否已参加其他活动场次，并在冲突时返回学生列表。

### 5.2 `student_session_states`

```sql
CREATE TABLE student_session_states (
  session_id INTEGER NOT NULL REFERENCES classroom_sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
  current_stage_index INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  stars INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  entered_at TEXT,
  last_activity_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, student_id)
);
```

创建草稿时为班级当前所有学生生成 `not_started` 状态。草稿创建后新加入班级的学生在读取当前任务或点击进入时补建状态。

### 5.3 `challenge_attempts` 增强

新增：

- `session_id INTEGER NULL REFERENCES classroom_sessions(id)`。
- `client_submission_id TEXT NULL`。

为 `(student_id, client_submission_id)` 建立条件唯一索引。重复 ID 返回第一次提交的结果，不再次增加尝试次数、XP 或连续正确次数。

## 6. 状态机与业务规则

允许的状态转换：

- `draft → live`：教师开始课堂。
- `live → paused`：教师暂停课堂。
- `paused → live`：教师恢复课堂。
- `live → ended` 或 `paused → ended`：教师结束课堂。

其他转换返回 `409 INVALID_SESSION_TRANSITION`。结束状态不可恢复或修改。

限时只累计 `live` 时间。开始或恢复时写入 `active_started_at`；暂停或结束时把当前活动区间加入 `accumulated_active_seconds` 并清空 `active_started_at`。剩余时间由服务端计算，客户端倒计时只用于显示。系统不运行后台定时任务：教师或学生每次读取场次、提交或执行控制操作时，服务层先检查是否超时；到期后在事务中转换为 `ended` 并冻结结算。15 秒轮询保证界面最多在一个轮询周期内看到自动结束。

学生点击进入后由 `not_started` 变为 `in_progress`。现有关卡长期完成状态不会让课堂阶段自动完成；本场次必须产生新的服务端有效提交。为了支持已经学过该关的学生，课堂模式允许重新练习并再次提交，但不清除其长期最好成绩。

第一阶段是引导式 3D/静态探索，不做服务端 3D 重放。服务端只确认学生属于场次、场次为 `live`、当前阶段正确且完成动作未被重复处理，然后记录参与型阶段完成。第二至第四阶段复用现有电路结构验证与测试用例，只根据受限连线证据重算。

提交时后端按以下顺序处理：

1. 校验学生身份并查询该学生唯一的活动场次。
2. 如果不存在活动场次，按现有普通练习流程复判并保存，跳过课堂状态更新。
3. 如果存在活动场次，校验班级关系、`clientSubmissionId` 和重复提交。
4. 校验场次为 `live` 且关卡等于当前阶段关卡。
5. 使用现有服务端规则复判提交。
6. 在同一 SQLite 事务中写入 `challenge_attempts`、长期进度和 `student_session_states`。
7. 返回长期进度与最新课堂状态。

暂停期间允许学生保留页面和本地操作，但服务端拒绝新提交。结束场次时事务性计算并冻结所有学生的 `result_json` 和班级 `report_json`。

## 7. XP、星级和徽章

所有奖励由服务端根据本场次提交重算，前端值不可信。

- 每阶段 XP 使用该阶段本场次最好成绩，重试只增加成绩差值，不能刷分。
- 第一次尝试即通过该阶段，额外获得 20 XP。
- 连续按顺序首次通过阶段时获得 10、20、30 XP 的递增奖励，上限 30；任一阶段首次尝试未通过则连续记录归零。
- 完成全部阶段且平均分达到教师设置的及格分：1 星。
- 在 1 星基础上平均分达到 90：2 星。
- 在 2 星基础上平均分达到 95，且每阶段最多尝试两次：3 星。
- 完成第一阶段授予“部件识别者”；完成第三和第四阶段授予“数据流侦探”。

学生只看个人 XP、星级、徽章、阶段反馈和薄弱点。教师看班级分布和需帮助学生，不展示公开名次。

## 8. API 设计

### 8.1 教师 API

- `POST /api/teacher/classes/:classId/sessions`
  - 请求：`{ templateKey, durationMinutes, passScore, allowMakeup }`。
  - 校验：任务包存在；限时为 10–180 分钟整数；及格分为 60–100 整数。
  - 返回：`201 { session }`。
- `POST /api/teacher/sessions/:id/start`
- `POST /api/teacher/sessions/:id/pause`
- `POST /api/teacher/sessions/:id/resume`
- `POST /api/teacher/sessions/:id/end`
  - 返回最新 `session`；结束接口同时返回 `report`。
- `GET /api/teacher/sessions/:id/overview`
  - 返回场次摘要、阶段分布、学生状态、重复错误和 `updatedAt`。
- `GET /api/teacher/sessions/:id/report`
  - 仅结束后返回冻结报告；未结束返回 `409 SESSION_NOT_ENDED`。

教师路由统一按教师所有权查询；不属于该教师的场次返回 404，避免泄露其他教师数据。

### 8.2 学生 API

- `GET /api/student/classroom/current`
  - 返回 `{ session: null }` 或 `{ session, studentState, mission }`。
- `POST /api/student/classroom/:sessionId/enter`
  - 首次进入或幂等恢复，返回最新学生场次状态。
- `POST /api/student/attempts`
  - 活动课堂内新增必填 `clientSubmissionId`；没有活动课堂的普通练习保持可选。
  - 服务端自动关联活动场次；客户端不能指定 XP、星级、阶段或可信 `sessionId`。
  - 返回 `{ progress, summary, classroomSession }`。

### 8.3 错误响应

场次错误采用：

```json
{
  "error": {
    "code": "SESSION_PAUSED",
    "message": "课堂任务已暂停，请等待教师恢复。",
    "retryable": true
  }
}
```

稳定错误码包括 `SESSION_PAUSED`、`SESSION_ENDED`、`STAGE_MISMATCH`、`NOT_CLASS_MEMBER`、`SESSION_NOT_FOUND`、`SESSION_NOT_ENDED`、`INVALID_SESSION_CONFIG` 和 `INVALID_SESSION_TRANSITION`。

## 9. 前端设计

### 9.1 教师端

- `SessionSetupPanel`：选择固定任务包，配置限时、及格分和补做预留。
- `LiveSessionDashboard`：显示任务状态、计时、暂停/恢复/结束、最后更新时间和手动刷新。
- `SessionStudentGrid`：按未进入、进行中、已完成、需帮助展示学生当前阶段、最后活动和重复错误。
- `SessionReportPanel`：显示冻结后的阶段分布、平均分、星级分布、薄弱点和学生结算。

教师看板只在场次页面可见时每 15 秒轮询一次。轮询失败保留上一次数据并显示非阻塞提示，不清空列表或滚动位置。

### 9.2 学生端

- `CurrentMissionCard`：登录后在首页顶部显示当前课堂任务和继续按钮。
- `MissionHud`：显示阶段、剩余时间、XP、星级进度、连续正确和保存状态。
- `MissionPauseOverlay`：暂停时覆盖提交区域，但保留当前操作状态。
- `MissionSettlement`：显示个人结算、徽章、强项、薄弱点和返回课程入口。

学生页面每 15 秒只读查询场次状态。`prefers-reduced-motion` 下不播放结算粒子和大幅位移动画，只使用静态高亮。无 WebGL 时沿用语义化静态教学视图。
### 9.3 真实游戏 UI 参考与借鉴边界

视觉设计不仅借鉴游戏循环，还要借鉴成熟游戏的信息层级、空间组织和反馈方式。参考关系如下：

| 平台区域 | 主要参考 | 借鉴内容 | 明确不复制 |
| --- | --- | --- | --- |
| 学生课程路线 | [Turing Complete](https://turingcomplete.game/)、[Factorio](https://www.factorio.com/game/content) | 从基础元件到完整系统的连续构建路线、技术树分区、前置关系和当前目标聚焦 | 原作地图布局、图标、插画、名称和素材 |
| 电路实验工作台 | [SHENZHEN I/O](https://www.zachtronics.com/shenzhen-io/)、[Opus Magnum](https://www.zachtronics.com/opus-magnum/) | 技术手册与工作区并列、仪器化控制、清晰端口、运行轨迹、正确后再优化的工程报告 | 原作面板皮肤、元件图、音效和关卡内容 |
| 数据流反馈 | [while True: learn()](https://store.steampowered.com/app/619150/while_True_learn/) | 数据包沿连线移动、输入输出即时可见、失败后快速修改再运行 | 猫、剧情、美术包装和原作节点资产 |
| 教学叙事 | [Human Resource Machine](https://tomorrowcorporation.com/humanresourcemachine) | 用可理解的任务隐喻解释抽象计算过程，减少长篇术语堆叠 | 角色、办公室场景、对白和谜题 |
| 教师课堂看板 | Factorio 的生产监控与策略游戏指挥室 | 一眼识别瓶颈、异常、吞吐和待处理事项，支持从全局下钻到学生 | 战斗化表达、公开排名、资源掠夺和高频闪烁告警 |

借鉴原则是“复用设计规律，不复刻游戏画面”。项目只使用自有课程内容、现有 Phosphor 图标和原创资产；不得直接打包参考游戏的截图、图标、纹理、字体、音乐或音效。参考截图仅作为设计评审依据，不进入产品构建产物。

### 9.4 视觉方向：明亮工业电路实验舱

最终方向采用“明亮工业电路实验舱”，保留现有科技实验室品牌，而不是整站改成黑色科幻 HUD。基础空间继续使用米白与浅灰，深海军蓝负责主要操作和标题，青绿负责成功与数据流，蓝色负责当前选择，金色负责待处理提醒，红色只用于错误和危险操作。深色只出现在画布、示波器、时序轨迹等需要高对比观察信号的局部仪器区域。

继续使用现有令牌和字体：`Manrope` 用于界面、数字和状态，`Newsreader` 只用于章节标题、任务简报和结算标题；沿用 `--ink`、`--muted`、`--navy`、`--blue`、`--teal`、`--gold`、`--danger`、圆角与阴影令牌。新增令牌必须从这些颜色派生，不再引入第二套主题。圆角按层级收敛为 12、16、22 像素；大面积玻璃模糊改为不透明或 92% 以上的表面，只有暂停层等瞬时覆盖层允许轻量模糊。

如需要电路板底纹或章节主视觉，实施阶段生成一张原创、无文字、可平铺或适配固定槽位的 WebP 资产，并按实际容器比例裁切；不得用大量 `div`、手写 SVG 或字符拼出装饰图。单张装饰图不超过 300 KB，学生或教师首屏图片总量不超过 1 MB。

### 9.5 页面级 UI 设计

#### 学生课程路线

- 首页主区改为“主板式章节地图”：章节是功能区域，关卡是插槽节点，前置关系是正交走线；当前节点有一次低频呼吸高亮，已完成节点显示闭合回路，锁定节点同时显示锁图标、前置条件和文字状态，不能只改变颜色。
- 1366×768 下首屏由 64 像素顶部任务条、可滚动的路线主画布和 288 像素右侧任务简报构成；首页不显示学生姓名，首屏只保留当前课堂任务、总体进度、最近成果和一个主要“继续任务”按钮。
- 地图默认聚焦当前节点并展示相邻两级；其他章节折叠为里程碑，避免当前 270×320 大卡片横向堆叠造成浏览疲劳。
- 课堂场次存在时，顶部任务条切换为“课堂频道”，显示阶段、剩余时间和保存状态；XP、星级与徽章进入次级信息，不挤占主要行动区。

#### 实验工作台

- 1366×768 基准布局使用三栏：左侧 240 像素任务/手册栏，中间 `minmax(0, 1fr)` 画布，右侧 300 像素诊断栏；顶部 56 像素任务状态条，底部或画布顶部放置运行、暂停、单步、重置和提交。中间画布在基准分辨率下可用宽度不得低于 720 像素。
- 左栏采用 SHENZHEN I/O 式“工程手册”层级，但使用项目米白纸面、中文任务简报、端口表和折叠提示；关卡路线移入紧凑步骤条，避免与任务手册重复占宽。
- 中央工作区使用局部深色仪器画布或浅色 PCB 画布，根据关卡类型固定选择，不允许同一关卡运行前后切换主题。元件显示真实名称、端口、方向和状态灯；连线使用正交路径，数据、地址、控制和电源分别使用青绿、蓝、金和红，同时配合端口标签或线型。
- 点击“运行”后才播放信号移动；单步执行时高亮唯一当前周期，并在时序条显示寄存器、总线和输出变化。错误反馈定位到首个偏离周期、相关元件和期望/实际值，不使用只写“答案错误”的通用弹窗。
- 右栏固定展示元件属性、当前周期、测试用例和检测反馈。可折叠，但展开时不覆盖画布；异常时按“现象—位置—建议检查”呈现，渐进提示不会直接泄露完整答案。
- 3D 探索仍是工作台中的一种画布类型，沿用自动爆炸、八步组装、总线关系和静态降级。3D 工具条、任务条与诊断栏必须和电路画布共享组件与视觉令牌。

#### 任务 HUD、暂停与结算

- HUD 采用工程仪表条，不采用手机游戏式金币条。阶段、剩余时间、保存状态是常驻信息，XP、星级和连续正确收纳为紧凑状态组；任何单项状态不得抢占主标题。
- 暂停层显示“教师已暂停”、已保存状态和可继续观察的内容，禁用运行与提交但不销毁学生画布。覆盖层保留背景轮廓，不使用全屏纯色遮挡。
- 结算页表现为“实验报告”：顶部显示通过状态和获得徽章，中部展示测试用例、首错周期、尝试次数、周期/元件等优化指标，底部提供复盘、再次优化和返回课程。庆祝反馈以一次印章式确认和数值递增为主，不使用全屏彩屑。

#### 教师课堂指挥台

- 教师端采用策略游戏指挥室的信息层级，但延续相同浅色品牌。顶部固定场次状态、计时、暂停/恢复/结束和最后更新时间；危险操作与普通刷新分组，结束课堂必须二次确认。
- 首屏按“课堂概况—阶段热力图—瓶颈告警—学生队列”排序。热力图按阶段显示未进入、进行中、已完成和需帮助；告警栏优先显示重复错误、长时间无活动和集中卡点，不做公开排行榜。
- 学生队列用紧凑行与小型多图表达状态，支持按阶段、帮助需求和最后活动筛选；点击后在侧栏查看该学生的事件轨迹、首错类型、已用提示和最近提交，不离开当前课堂上下文。
- 15 秒轮询只更新变化区域，保留筛选、滚动和展开状态；数据过期时显示“最后更新”与非阻塞警告，不把旧数据清空为加载骨架。

#### 动效、音效与低配策略

- 面板切换使用 180–240 毫秒位移/淡入；一次信号脉冲控制在约 450 毫秒，页面同时可见的运动信号不超过 12 个。禁止持续运行的背景粒子、全屏视频、重度模糊和大面积实时阴影。
- `prefers-reduced-motion` 或低性能模式下，信号流改为逐段静态高亮，关闭粒子、呼吸、数值滚动和大幅位移；功能、评分与反馈信息保持完整。
- 首期不增加连续背景音乐。关键操作音效如果后续加入，必须默认可关闭、音量可调，并提供等价视觉反馈，不能作为判题依据。
- 所有核心按钮最小高度 40 像素，图标按钮有可访问名称；键盘可以完成路线导航、运行、单步、重置、提交和教师场次控制。状态使用颜色、图标、形状与文字至少两种信号表达。

## 10. 断网与幂等

- 前端为每次提交生成 UUID 形式的 `clientSubmissionId`。
- 网络失败前已生成的 ID 和请求体保存在 `localStorage`，键包含用户、场次和阶段。
- `online` 事件触发后最多自动重试一次；页面也提供手动重试。
- 成功后立即删除本地待提交记录。
- 如果重试返回暂停、结束或阶段不匹配，停止自动重试并展示明确状态。
- 服务端唯一索引和事务保证刷新、双击或网络重放不会重复计分。

本地存储不是成绩来源，只保存尚未确认的请求；服务端状态始终是最终事实。

## 11. 模块边界

新增或重点拆分：

- `prototype/src/shared/classroomMissionDefinitions.js`：任务包定义和版本查询。
- `prototype/server/classroomMissionGrading.js`：只注册参与型检查点和电路评分函数，不导入图片、3D 或界面材料。
- `prototype/server/classroomSessionService.js`：状态机、权限内业务规则、计分和结算。
- `prototype/server/classroomSessionRepository.js`：场次和学生状态持久化。
- `prototype/src/components/teacher/SessionSetupPanel.jsx`。
- `prototype/src/components/teacher/LiveSessionDashboard.jsx`。
- `prototype/src/components/teacher/SessionStudentGrid.jsx`。
- `prototype/src/components/teacher/SessionReportPanel.jsx`。
- `prototype/src/components/student/CurrentMissionCard.jsx`。
- `prototype/src/components/student/MissionHud.jsx`。
- `prototype/src/components/student/MissionPauseOverlay.jsx`。
- `prototype/src/components/student/MissionSettlement.jsx`。
- `prototype/src/hooks/useClassroomSession.js`：学生发现、进入、轮询和恢复。
- `prototype/src/hooks/useTeacherSession.js`：教师控制和轮询。

`App.jsx` 只进行页面编排、登录态装载和现有实验导航，不承载场次状态机或计分算法。

## 12. 测试与验收

### 12.1 单元与集成测试

- 任务包阶段和关卡 ID 均有效且版本稳定。
- 每条合法状态转换通过，每条非法转换返回 409。
- 一个班级只能有一个活动场次。
- 学生跨活动场次冲突返回冲突名单。
- 教师不能读取或控制其他教师场次。
- 学生不能进入非所属班级场次。
- 暂停和结束时提交被拒绝。
- 阶段不匹配时提交被拒绝。
- 重复 `clientSubmissionId` 返回同一结果且不重复计分。
- XP、星级、连续正确和徽章规则覆盖边界值。
- 多次暂停和恢复后只累计活动时间，到期检查只执行一次结算。
- 提交事务失败时长期进度和课堂状态都不发生部分更新。
- 评分函数抛错时事务回滚，单次请求返回结构化错误并记录请求 ID，Node 进程继续服务。
- 结束报告冻结后重复读取一致。

### 12.2 集中提交稳定性

新增 API 压力验证：准备 150 名学生，以最高 30 个并发请求完成一次合法阶段提交。验收要求为零进程退出、零未捕获异常、零 SQLite_BUSY、零 5xx，响应 P95 不超过 2 秒。测试只提交受限证据，不启动浏览器或 3D 场景。

### 12.3 独立 Playwright 场景

新增 `npm run qa:classroom`，使用一个 Chromium 进程中的教师、学生两个独立 context 和临时 SQLite：

1. 教师创建并开始课堂。
2. 学生登录后自动发现任务并进入。
3. 学生提交第一阶段，刷新后恢复到第二阶段。
4. 重放同一提交，XP 和尝试次数不变。
5. 教师暂停，学生提交得到暂停提示。
6. 教师恢复，学生继续完成阶段。
7. 教师轮询看到阶段变化和最后活动。
8. 教师结束课堂，学生看到冻结结算。
9. 无 WebGL context 完成第一阶段静态教学路径。
10. 两端均无未处理页面错误。

### 12.4 发布矩阵

每次交付运行：

- `npm test`
- `npm run qa:assets`
- `npm run build`
- `npm run qa:ui`
- `npm run qa:3d`
- `npm run qa:performance`
- `npm run qa:classroom`
- `npm run qa:classroom-load`
- `git diff --check`

验收结果必须满足：教师可在 3 分钟内启动任务；学生刷新或短暂断网后可继续；教师在 15 秒内看到提交变化；暂停和结束状态可靠生效；普通课堂设备继续满足现有 3D 性能门禁。

## 13. 迁移与兼容

数据库变更通过现有 `schema_migrations` 机制幂等执行。旧提交的 `session_id` 和 `client_submission_id` 保持 `NULL`，继续参与长期学习统计但不属于任何课堂场次。没有活动课堂时，旧版学生提交仍可不带 `clientSubmissionId`。现有教师看板、学生路线、报告、笔记和硬件挑战 API 保持兼容。

如果迁移失败，服务启动应失败并输出迁移版本与数据库路径，不能在部分 schema 下继续提供课堂场次 API。
