# 装机店：客户呈现修复与任务变化建议

## 已实现的修复

阿宁原先进入 `HardwareCustomerStory` 文字工单，只有小林使用 `ShopStoryScene`。这不是图片地址过期，而是后续客户缺少场景接入。现为阿宁补充独立立绘和店铺接待场景，沿用真实的需求、报价、装配、开机和服务器交付流程。返回柜台时保留已安装元件；切换工单仍清除上一单的开机与回执。

以上为最初的阿宁修复记录。后续六位客户均已接入独立立绘与互动接待，见 `shop-all-customers-2026-10-04.md`。目前已制作三张“诊断与定向升级”工单：小周的内存换页、小许的机械硬盘加载、阿澄的 CPU 导出，见 `shop-service-game-2026-10-04.md`。下表中的资料救援、咨询结单和售后仍是后续建议。

验收：7 项剧情与交付状态单元测试通过；生产浏览器流程通过，覆盖小林真实装配/开机、离线与同步交付、阿宁立绘解码/追问/报价/工作台/返回柜台、桌面和手机布局。首次切到阿宁没有继承开机与回执。主入口 JavaScript 510852 B，符合 512000 B 限制。

## 建议方向：经营装机店，解决不同的电脑问题

参考 [PC Building Simulator 官方介绍](https://www.pcbuildingsim.com/) 中经营、维修、工具解锁的组合，结合本平台的课程内容设计不同业务。以下剧情与机制是本项目的原创建议。

| 客户 / 业务 | 玩家主要操作 | 课程知识 | 收尾 |
| --- | --- | --- | --- |
| 阿宁：新生购机咨询 | 询问专业和软件、对比新机与旧机升级、解释预算取舍 | 计算机组成与性能指标 | 客户可只购买咨询方案，预约装机也可作为后续事件 |
| 小周：编程环境卡顿 | 看资源监视器、复现多任务、判断 CPU / 内存 / 磁盘瓶颈 | 存储层次、多任务与性能 | 只更换需要升级的元件，再运行同一任务对照 |
| 陈老师：资料救援 | 检查文件位置、估算空间、选择备份目标、验证副本 | 存储容量、文件与数据保护 | 资料完整性与备份覆盖作为验收目标 |
| 小许：开机黑屏 | 观察指示灯、检查供电和显示接线、逐步排除故障 | 输入输出、启动流程 | 修好后开机验证，不必重装整台电脑 |
| 阿澄：剪辑导出变慢 | 阅读负载信息、选择单项升级、比较导出耗时 | 计算、存储、总线协同 | 给出升级报告，预约回访 |
| 回头客：售后 | 阅读原工单、追问新症状、解释处理方式 | 综合应用 | 维修、保修或指导使用，影响信任和评价 |

### 一天的节奏

每天安排 2～3 位客户，混合一个短咨询、一个诊断或升级单、一个主线事件；完整装机用于重要工单。客户可能再次来店，保留此前的方案和对话事实。收入、时间、客户信任产生取舍，例如临近下课的新生、急着做汇报的行政人员、预算有限但坚持保留资料的老师。

### 交互原则

- 对话用于获取线索，线索交给可操作的诊断或演示工作台；连续点选对话不能替代实际判断。
- 给错误诊断可解释的反馈，允许撤销和再次测试。不同方案可达成目标，不限定一套答案。
- 客户说生活中的症状，界面展示测试证据；需要时再展开专业指标。
- AI 可生成客户背景、追问与反馈，任务类型、故障真相、工具效果和验收条件由程序确定。
- 不改写原装机关卡 ID 或成绩。咨询、维修、升级分别定义任务与评分依据，完成后统一接入学习记录和错题本。

### 推荐下一步

诊断升级流程现已可玩：客户描述 → 三项可复现测试 → 判断瓶颈 → 真实 3D 拆换元件 → 开机 → 同一测试复测 → 客户验收。后续可扩展咨询、资料救援与售后。

## 阿宁立绘来源

- 内置 ImageGen，生成 ID `exec-241e26bd-c370-41b0-a2c4-27d2005a7b20`。
- 原稿：`../public/shop-story/aning.png`；网页素材：`../public/shop-story/aning.webp`。
- 请求透明背景；生成 RGBA，alpha 范围 0～254。Pillow 仅编码 WebP，不改绘图像内容。
- 最终生成提示词：

> Create a production game character sprite with a genuinely transparent background, a single original Chinese university freshman named Aning, age 18-20, young man with short slightly tousled dark hair, natural approachable slightly shy expression, warm cream overshirt over muted blue T-shirt, dark casual trousers, canvas backpack on one shoulder, holding a slim notebook with both hands at waist height. Realistic photographic character art for a cozy sunny neighborhood computer repair shop visual novel. Warm natural window light from upper left, believable hands and anatomy, restrained realistic clothing, no logo, no text, no scene, no other people. Three-quarter length from head to below knees, front view slightly turned toward viewer, complete head and shoulders with generous transparent margins, tall vertical composition. Character should be visually distinct from a woman in mint vest and a grey-haired repair-shop mentor. Asset will be composited over an existing warm workshop background.
