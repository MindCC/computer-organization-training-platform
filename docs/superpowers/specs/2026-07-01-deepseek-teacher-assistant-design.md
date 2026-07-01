# DeepSeek 教师端智能助教设计

## 背景

当前平台已经具备课堂集中版基础能力：教师账号、班级、CSV 导入学生、学生进度集中保存、React Flow 电路实验提交记录、教师看板和规则型学情摘要。下一步不扩展成完整教育智能体平台，而是先做一个能在课堂上直接使用的教师端智能助教。

本设计选择“智能助教：AI 辅助备课、答疑与学情分析，支撑个性化教学”。首版接入 DeepSeek，只服务教师端，不开放学生自由问答。

## 目标

- 教师可以基于某个班级的真实学习数据生成一份 AI 助教报告。
- 报告帮助教师快速决定下一节课讲什么、先辅导谁、哪些错误需要集中讲解。
- DeepSeek 未配置、调用失败或返回异常时，教师看板继续可用，并显示规则型降级建议。
- 代码层保留 OpenAI 兼容 provider 边界，后续可替换模型供应商或扩展到学生端助学。

## 不做

- 不做学生端自由聊天。
- 不做公开平台注册、多租户模型配额或复杂计费。
- 不把学生密码、session、原始 cookie、教师账号敏感信息发送给模型。
- 不让前端传系统提示词或任意 prompt。
- 不依赖流式输出；首版使用普通非流式 JSON 结果。

## DeepSeek 配置

后端新增环境变量：

- `DEEPSEEK_API_KEY`：DeepSeek API key。未配置时不调用模型。
- `DEEPSEEK_BASE_URL`：默认 `https://api.deepseek.com`。
- `DEEPSEEK_MODEL`：默认 `deepseek-v4-flash`。
- `AI_REQUEST_TIMEOUT_MS`：默认 `15000`，避免课堂页面长时间卡住。

DeepSeek 使用 OpenAI 兼容 Chat Completions 接口。模型默认使用 `deepseek-v4-flash`，因为它更适合课堂看板里的快速生成；如果教师或部署者追求更高质量，可把环境变量改为 `deepseek-v4-pro`。

## 后端接口

新增接口：

`POST /api/teacher/classes/:id/assistant-report`

权限规则：

- 必须登录。
- 仅教师角色可访问。
- 教师只能生成自己任课班级的报告。

响应结构：

```json
{
  "source": "ai",
  "generatedAt": "2026-07-01T10:00:00.000Z",
  "report": {
    "lessonFocus": "下节课重点",
    "riskStudents": [
      {
        "studentId": 1,
        "name": "李同学",
        "reason": "全加器完成率低且重复缺少 Cout",
        "suggestion": "先复盘进位逻辑，再独立重连参考结构"
      }
    ],
    "groupingPlan": [
      {
        "group": "基础巩固组",
        "criteria": "完成率低于 60%",
        "activity": "跟随参考结构重建半加器和全加器"
      }
    ],
    "commonMisconceptions": [
      "把 Sum 和 Cout 当成同一路输出"
    ],
    "nextClassPlan": [
      "5 分钟复盘输入、门电路、输出端口",
      "8 分钟集中讲解全加器进位分叉",
      "10 分钟学生独立重连并提交"
    ],
    "teacherScript": "今天先看 Cout 是怎么从 A、B、Cin 三个输入共同决定的..."
  },
  "fallbackReason": null
}
```

未配置或失败时返回：

```json
{
  "source": "fallback",
  "generatedAt": "2026-07-01T10:00:00.000Z",
  "report": {
    "lessonFocus": "基于规则的下节课重点",
    "riskStudents": [],
    "groupingPlan": [],
    "commonMisconceptions": [],
    "nextClassPlan": [],
    "teacherScript": "请先导入学生或等待学生提交后再生成 AI 报告。"
  },
  "fallbackReason": "DEEPSEEK_API_KEY 未配置"
}
```

## 数据摘要与脱敏

后端根据 `getClassOverview` 和学生详情构造发送给 DeepSeek 的教学摘要。摘要只包含：

- 班级名称。
- 学生 id、姓名、学号。
- 每名学生的完成率、平均分、尝试次数、累计耗时。
- 每关状态、最好分、尝试次数、最近错误。
- 班级高频错误和平均指标。

摘要不包含：

- 密码哈希。
- session token。
- cookie。
- 原始请求头。
- 教师或学生的敏感配置。
- 学生笔记全文。首版只发送笔记数量，不发送内容。

## AI Provider 边界

新增后端模块：

- `server/aiClient.js`
  - 读取 DeepSeek 配置。
  - 发起 OpenAI 兼容请求。
  - 处理超时、401、429、非 2xx、非 JSON。

- `server/teacherAssistant.js`
  - 构造脱敏班级摘要。
  - 构造固定 system/user prompt。
  - 校验模型返回结构。
  - 生成规则型 fallback。

业务路由只调用 `generateTeacherAssistantReport(db, teacherId, classId)`，不直接拼 prompt、不直接访问外部 API。

## Prompt 约束

系统提示固定在后端：

- 角色：计算机组成原理实训课助教。
- 输出语言：中文。
- 输出格式：严格 JSON。
- 输出边界：只根据给定班级数据生成建议，不编造未提供的学生行为。
- 教学目标：帮助教师备课、分层辅导和错误纠正。
- 安全要求：不输出隐私敏感数据，不建议惩罚性措辞。

如果 DeepSeek 返回 Markdown 包裹的 JSON，后端可提取第一段 JSON 再校验；校验失败走 fallback。

## 前端交互

教师看板当前已有 “智能助教” 面板。首版改为：

- 默认展示规则型摘要。
- 新增 “生成 AI 助教建议” 按钮。
- 生成中显示加载状态，按钮禁用。
- 成功后展示：
  - 下节课重点。
  - 重点关注学生列表。
  - 分层辅导建议。
  - 共性错误。
  - 课堂安排。
  - 教师讲解提示。
- 失败或未配置 key 时显示明确提示，并保留规则型建议。
- 报告只在当前页面状态保存；首版不要求持久化历史报告。

## 错误处理

- 未配置 `DEEPSEEK_API_KEY`：返回 fallback，前端显示“未启用 DeepSeek”。
- DeepSeek 401/403：返回 fallback，前端提示“API Key 无效或无权限”。
- 429 或超时：返回 fallback，前端提示“AI 服务繁忙，已显示本地建议”。
- 非 JSON 或字段缺失：返回 fallback，并在服务端日志记录错误类型。
- 未登录或权限不足：保持现有 401/403/404 权限语义。

## 测试计划

后端单元测试：

- 班级摘要不包含 `password_hash`、session、cookie。
- 未配置 key 时返回 fallback。
- mock DeepSeek 成功时返回 `source: "ai"` 和完整字段。
- mock DeepSeek 超时、401、非 JSON 时返回 fallback。
- 教师不能生成非自己班级的报告。

前端 smoke：

- 教师进入看板，看到智能助教面板。
- 未配置 key 时点击生成，显示 fallback 原因。
- mock API 成功时，页面展示 AI 报告各区块。

构建验证：

- `npm.cmd test`
- `npm.cmd run build`
- `node scripts/verify-ui.mjs`

## 后续扩展

- 学生端“智能助学”：基于当前关卡、当前错误和导线状态生成提示，但需要限流和防直接给答案。
- 智能助评：对学生笔记和实验过程生成成长性评价。
- 报告持久化：新增 `assistant_reports` 表，保存最近一次报告和生成来源。
- 供应商切换：把 `DeepSeekClient` 扩展为通用 OpenAI-compatible provider。
