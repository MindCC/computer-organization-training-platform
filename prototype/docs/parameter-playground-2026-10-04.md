# 实时性能参数实验

## 入口和交互

课程课件页的八章卡片下方新增“性能参数实验”。参照用户提供的 PhET 截图，把滑块、结果和曲线放在同一实验区域。章节切换时优先打开相关主题，三个主题也可手动切换；各主题保留本次页面内的参数值。

| 主题 | 可调整参数 | 实时结果 | 优先章节 |
| --- | --- | --- | --- |
| CPU 性能 | 频率、平均 CPI、实际执行指令量 | 程序运行时间、周期总数、单周期时间 | 第一章与第六章；其他章节默认此主题 |
| Cache 访问 | 命中率、Cache 查找时间、未命中额外内存延迟 | AMAT、未命中平均延迟贡献 | 第四章 |
| 总线带宽 | 数据位宽、时钟频率、每周期传输次数 | 理论峰值带宽、每次传输字节数 | 第七章与第八章 |

图表可选择横轴，保持另外两项参数为当前值。绿色为当前条件，灰色虚线为初始条件，橙色圆点为当前滑块位置。移动横轴对应滑块时圆点移动；移动其他参数时曲线与参考条件之间的差异即时更新。恢复按钮只重置当前主题的三项参数。窄屏中的图表在卡片内横向滑动，避免压缩刻度文字。

## 模型口径

- CPU 时间为执行指令量 × 平均 CPI ÷ 频率，输入单位为百万条、GHz，输出为 ms。三项作为独立教学变量。
- 单级串行 Cache 的 AMAT 为查找时间 + 未命中率 × 未命中额外延迟，单位为 ns；额外延迟不包含已计入的 Cache 查找时间。
- 总线理论峰值为位宽 × 时钟频率 × 每周期传输次数 ÷ 8。使用十进制 MB/s、GB/s，不包含协议及等待开销。
- 零指令量、零额外延迟等平坦曲线说明为“保持不变”。这些探索不提交成绩或实验进度。

## 文件

- 计算模型：`src/parameterExperiments.js`。
- 实验面板：`src/components/ParameterPlayground.jsx`、`src/components/parameterPlayground.css`。
- 当前入口：顶栏“互动演示”，组件 `src/components/InteractiveDemos.jsx`；工作台另有可随时返回原接线的“参数实验”模式。
- 验证：`src/parameterExperiments.test.mjs`、`scripts/verify-parameter-playground.mjs`。

运行计算检查：`node --test --test-isolation=none src/parameterExperiments.test.mjs`。

运行浏览器检查：先构建，再运行 `node scripts/run-browser-qa.mjs scripts/verify-parameter-playground.mjs --production --seed-demo`。检查使用隔离 SQLite 数据库和一个无头浏览器，覆盖实际键盘及鼠标滑动、数值更新、曲线比较、恢复、横轴切换和手机布局。截图与日志位于 `qa-artifacts/parameter-playground-*`。
