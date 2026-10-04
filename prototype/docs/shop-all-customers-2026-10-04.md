# 装机店全角色接入 · 2026-10-04

## 角色与入口

小林的首日剧情、老赵的引导和自定义 AI 客户保留。阿宁、小周、陈老师、小许、阿澄统一进入暖色店铺接待场景；菜单显示客户姓名与原工单，切换客户会重置开机和交付状态。每位客户均有需求追问、工单、方案对比、报价、实际 3D 工作台、服务器验收及下一位客户入口。

| 角色 | 对话重点 | 立绘 |
| --- | --- | --- |
| 阿宁 | 网课、作业与入门编程 | aning.webp（既有） |
| 小周 | IDE、虚拟机、多任务，CPU 与内存取舍 | xiaozhou.webp |
| 陈老师 | 课程归档、容量优先、另外备份 | chen.webp |
| 小许 | 大型软件加载、存储响应 | xiaoxu.webp |
| 阿澄 | 视频素材容量、读写、图形加速协同 | acheng.webp |

移除了旧文字工单渲染分支。人物显示和对话使用同一个可复用接待组件，各工单原 ID、预算、性能目标和服务器评分保留。

## 修复不能完成的视频工单

阿澄需要至少 2048GB 存储，但原目录最大只有 1024GB。新增 `ssd-2tb`（2048GB、性能 92、元件价 ¥1050），沿用现有 SSD 教学模型与 SATA 连接，不降低评分目标。配置推荐从真实目录计算，所有六个既有工单均有通过原评分规则的方案。无法满足的自定义工单仍明确显示不满足条件，不伪造通过。

## 素材来源与保存

四张立绘使用内置 ImageGen，透明背景，原创虚构人物。原始 PNG 和网页 WebP 均保存在 `prototype/public/shop-story/`。RGBA alpha 范围均为 0～254；Pillow 仅编码为 WebP（quality 84、method 6），未改绘图像内容。

### xiaozhou

- 生成 ID：`exec-4b54f135-ed0e-40fe-b485-afdf4232a6dd`
- 原图：[xiaozhou.png](../public/shop-story/xiaozhou.png)
- 网页资源：[xiaozhou.webp](../public/shop-story/xiaozhou.webp)
- 最终生成提示词：

> Use case: photorealistic-natural. Original character portrait asset for a warm sunny Chinese neighborhood PC assembly shop story game. Single fictional Chinese adult, friendly believable cinematic photography, detailed natural face and clothing, warm soft sunlight from upper left, eye-level facing viewer, waist-to-knee portrait centered with entire head and both hands within frame, modest everyday styling. Vertical composition. Genuinely transparent RGBA background, crisp natural cutout edges around hair/clothes, no scenery, no color plate, no floor, no cast shadow outside silhouette, no text, logos, frames or watermark. Match a realistic warm shop visual novel aesthetic. Subject: Xiao Zhou, male university programming club member aged 22, short neat black hair, thin black rectangular glasses, navy zip hoodie over pale grey T-shirt, relaxed dark trousers, holding a closed charcoal laptop with one hand and lightly gesturing with the other, thoughtful curious smile. Distinct face and silhouette.

### chen

- 生成 ID：`exec-978432ad-1a08-4b3b-b0e0-cbad08d38227`
- 原图：[chen.png](../public/shop-story/chen.png)
- 网页资源：[chen.webp](../public/shop-story/chen.webp)
- 最终生成提示词：

> Use case: photorealistic-natural. Original character portrait asset for a warm sunny Chinese neighborhood PC assembly shop story game. Single fictional Chinese adult, friendly believable cinematic photography, detailed natural face and clothing, warm soft sunlight from upper left, eye-level facing viewer, waist-to-knee portrait centered with entire head and both hands within frame, modest everyday styling. Vertical composition. Genuinely transparent RGBA background, crisp natural cutout edges around hair/clothes, no scenery, no color plate, no floor, no cast shadow outside silhouette, no text, logos, frames or watermark. Match a realistic warm shop visual novel aesthetic. Subject: Teacher Chen, female university course archive manager aged 43, shoulder-length dark hair neatly tied back, thin bronze reading glasses, pale sage cardigan over cream collared blouse, dark straight trousers, holding a labelled-free kraft document folder with a slim portable external hard drive, composed patient expression and warm small smile. Distinct mature face.

### xiaoxu

- 生成 ID：`exec-d4123430-68d5-4681-ad1c-f75343f2c723`
- 原图：[xiaoxu.png](../public/shop-story/xiaoxu.png)
- 网页资源：[xiaoxu.webp](../public/shop-story/xiaoxu.webp)
- 最终生成提示词：

> Use case: photorealistic-natural. Original character portrait asset for a warm sunny Chinese neighborhood PC assembly shop story game. Single fictional Chinese adult, friendly believable cinematic photography, detailed natural face and clothing, warm soft sunlight from upper left, eye-level facing viewer, waist-to-knee portrait centered with entire head and both hands within frame, modest everyday styling. Vertical composition. Genuinely transparent RGBA background, crisp natural cutout edges around hair/clothes, no scenery, no color plate, no floor, no cast shadow outside silhouette, no text, logos, frames or watermark. Match a realistic warm shop visual novel aesthetic. Subject: Xiao Xu, male university laboratory assistant aged 28, short slightly wavy black hair, muted teal overshirt rolled sleeves over white T-shirt, dark trousers, holding a small unbranded silver SSD case in one hand and a notebook in the other, energetic approachable smile, no lab coat. Distinct face.

### acheng

- 生成 ID：`exec-f6026c0b-5388-4511-b1a7-af3dea139fc0`
- 原图：[acheng.png](../public/shop-story/acheng.png)
- 网页资源：[acheng.webp](../public/shop-story/acheng.webp)
- 最终生成提示词：

> Use case: photorealistic-natural. Original character portrait asset for a warm sunny Chinese neighborhood PC assembly shop story game. Single fictional Chinese adult, friendly believable cinematic photography, detailed natural face and clothing, warm soft sunlight from upper left, eye-level facing viewer, waist-to-knee portrait centered with entire head and both hands within frame, modest everyday styling. Vertical composition. Genuinely transparent RGBA background, crisp natural cutout edges around hair/clothes, no scenery, no color plate, no floor, no cast shadow outside silhouette, no text, logos, frames or watermark. Match a realistic warm shop visual novel aesthetic. Subject: A Cheng, female course video editor aged 26, chin-length dark bob hair, muted rust-orange loose overshirt over cream T-shirt, dark jeans, small black over-ear headphones resting around neck, holding a compact unbranded black external drive and a slim video storyboard notebook, confident expressive smile. Distinct face.

## 验证

生产构建、包体预算、所有角色的真实浏览器接待与交付验证见 `scripts/verify-shop-story.mjs`，日志保存在未入库的 `qa-artifacts/all-customers-browser.log`。测试通过 UI 逐位接待、读取图片、询问三项需求、打开工单、比较方案、接单、安装元件和连接线缆、开机、真实服务器交付并点击下一位客户；窄屏与桌面均检查布局。

最终结果：针对性装配/评分/恢复测试 26 / 26 通过，完整服务端与课程测试 500 / 500 通过，生产构建通过。浏览器验证小林首日完整剧情，以及阿宁、小周、陈老师、小许、阿澄各自的实际安装、开机、服务器交付及下一客户，所有流程通过，无未捕获运行错误。对新角色检查 1366 和 390 像素宽度；选择当前客户也会正确关闭订单菜单，避免遮挡对话。

主入口 JavaScript 480647 字节，3D 增量 gzip 198795 字节，均通过现有预算。完整日志见 `qa-artifacts/all-customers-full-unit.log` 和 `qa-artifacts/all-customers-browser.log`。本地预览后台已重启以读取新增元件目录，保留原数据库。

新增角色接入是原有装机玩法的完整呈现；咨询、维修与升级的独立任务玩法仍属于经营扩展方案。
