# 画板 Token Dance 识图接入

## 配置

Token Dance 通过 OpenAI 兼容接口调用，生产接入地址 `https://tokendance.space/gateway/v1`。Hermes 当前 Windows 配置位于 `C:/Users/shaolijiang/AppData/Local/hermes/config.yaml`，其 `tokendance` 提供商含 Key，`auth.json` 的凭据池记录接入地址。未复制或修改 Hermes 配置。

新增独立图片配置，图片转导图使用它，文字生成和导图重绘继续使用原有 `MINDMAP_*` / DeepSeek 配置：

```dotenv
MINDMAP_VISION_API_KEY=<通过受限配置注入>
MINDMAP_VISION_BASE_URL=https://tokendance.space/gateway/v1
MINDMAP_VISION_MODEL=qwen3-vl-plus
MINDMAP_VISION_ENABLED=1
MINDMAP_VISION_TIMEOUT_MS=60000
```

现有 `MINDMAP_*` 配置仍兼容。独立视觉地址/模型不完整或未启用时，能力接口返回 `imageAi=false`，请求在发送前拒绝；不会把视觉 Key 发给文字服务。前端仅获得能力布尔值，不获得配置和密钥。现有显式发送勾选、5MB 图片限制、每用户限流、结构校验、错误保留画板、账号归属保持原行为。

## 验证

- 先新增配置隔离测试，在旧实现中两项失败：独立视觉配置未生效。实现后 `node --test server/mindMapGeneration.test.mjs server/mindMapRoutes.test.mjs` 共 **11 项通过**，覆盖专属请求目标/Key/model、文字保留、配置缺失、旧配置、同意/输入校验、真实 HTTP 认证及账户隔离。
- 使用 Hermes 配置的 Key 调用 Token Dance `/models`，HTTP200，确认 `qwen3-vl-plus` 可用。
- 真实模型输入是程序绘制的 **17,326 B CPU 结构图**，含 CPU → ALU / Control Unit / Registers，补充文字不提供节点名称。识别成功 `source=ai`，4 节点，耗时约 **4.7s**，四个概念均被识别，图结构经服务器标准化并自动布局。无学生身份、成绩、历史或教师反馈。
- 原图、返回图、无密钥日志位于 gitignored `qa-artifacts`；真实返回不是测试替身。一次清晰示例成功不代表所有模糊教材、手绘箭头和复杂图片均可准确识别，页面继续提示核对原图。

## 生产

用户已明确确认生产接收目标，并追加要求小芯吉祥物也使用同一 Token Dance Key。已通过 SSH stdin 配置 `/etc/zcyl/vision.env`（640 root:zcyl），systemd 单独 EnvironmentFile，未向命令参数、Git、前端或日志输出密钥。部署保留其他助教环境，先备份程序、数据库和已有配置；生产完成以服务环境及真实页面验收为准。

## 小芯吉祥物

独立 `STUDY_ASSISTANT_API_KEY` / `STUDY_ASSISTANT_BASE_URL` / `STUDY_ASSISTANT_MODEL` / `STUDY_ASSISTANT_TIMEOUT_MS`，Token Dance 模型 `deepseek-v4-flash`，15s 单调用预算和原有22s总预算。问题审核、回答生成、完整回答审核都使用同一专属配置。旧文字模型仍为 DeepSeek，因此现有“AI 讲解 · DeepSeek”标签对应实际模型；接入网关改为 Token Dance。保留旧客户端 consent 标识以兼容版本，用户错误信息使用“课程助教服务”。

新增专属配置测试先失败，接入后画板及小芯服务/路由 **34 项测试通过**。真实 Token Dance 小芯调用成功，课程问题的三阶段审核/生成都在新接口；无关、关键词伪装、混合要求、指令覆盖四类请求仍拒答，合计约13.5s。独立配置缺地址或模型时不会发送凭据，也不会把专属 Key 发给默认官方接口。

## 生产交付验收（2026-10-06）

- 已推送 Gitee，部署代码版本 `63d1702330c2d897c5a25eb3815e29090a640140`。发布前完整备份位于服务器 `/var/backups/zcyl/vision-code-20261006-63d1702`，包含原程序、前端、SQLite、服务配置和助教配置。
- 从该 Git 版本的干净源码构建和验证，避免将共享工作树中其他尚未提交的教师功能带入此次发布。构建成功，首屏 JS 门禁 **509,523 / 512,000 字节**，画板浏览器回归通过。合并远端课程内容时发现提纲缩进丢失和小数前缀误删，已修复并增加中文编号测试。
- 服务重启后健康检查返回该版本及 `db=ok`；读取实际服务进程配置确认画板 `qwen3-vl-plus`、小芯 `deepseek-v4-flash` 均使用 Token Dance，Key 相同且非空，配置权限640。其他模块的原 DeepSeek 配置保留。
- 生产页面上传上述 CPU 图，真实生成接口 HTTP200、`source=ai`、4节点，生成约 **8.3s**；画板可保存，刷新页面并重新进入思维画板后可打开原画板。验收创建的临时画板已删除。
- 生产小芯真实答疑 HTTP200、`source=ai`；无关、关键词伪装、混合要求、指令覆盖四类请求均被拒绝。服务器上的34项相关测试全部通过。
- 移动端390×844实测和截图检查通过，无横向溢出，画板保存控件和小芯问答可使用；两个页面均无浏览器错误。
- 浏览器验收使用 Chromium，通过 Node fetch 转发到公开服务的真实静态资源与接口，以绕开本机 Chromium 直接访问公网的网络故障；此结果验证生产功能，不代表浏览器直连网络速度。较广的本地画板交互回归使用模拟识图响应，以上生产图片生成与小芯答疑使用真实模型。

验收日志与截图保存在 gitignored `prototype/qa-artifacts/tokendance-production-*.log`、`production-vision-mobile.png`、`assistant-live-mobile.png`，未记录密钥。

接口参考：[Token Dance](https://tokendance.space/)，[Qwen 结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)。
