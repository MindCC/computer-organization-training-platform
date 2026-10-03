# Gitee 参考图驱动的教学主机 3D 模型

## 目标

用 Gitee 上的元件三视图重新制作现有教学主机的可编辑 Blender 模型，并替换运行时 GLB。保留原有 3D 旋转、拾取、拖放装配、安装锚点、侧板与卡扣、风扇动画、接线、开机自检、评分和进度恢复。

## 范围与依赖

- 以 Gitee `984aef8`、`5ec960f` 的 CPU、内存、显卡、主板、机箱、电源、散热器、SSD、HDD 三视图为现有主机模型的造型参考；显示器、键盘、鼠标重建为工作台外设，显示器保留开机响应，不改变当前机箱内装配规则。
- 从 `prototype/art-source/computer/teaching-pc-v2.blend` 派生新源文件，保持现有节点名、`socket_*`、`port_*`、动作名称和 `schemaVersion: 2`；在这些节点内重做几何与材质。
- 用项目的 `assets:export` 流程生成 `prototype/public/models/teaching-pc.glb` 和 `prototype/src/teachingPcManifest.json`。恢复原有 `OverviewExplodedView`、`NativeComputerScene` 和装机工作台，不在运行时显示参考图片。
- 若硬盘型号需要在 3D 中区分 SSD/HDD，以不改变安装和接线契约的方式加入外观变体。

## 风险与验收

- 模型几何不能超出 5 MiB / 100k 三角面；锚点位姿、可拆件名称、接口及动作必须与现有代码兼容。
- 验证 GLB 清单与字节一致、构建与单元测试通过；生产浏览器回归覆盖真实 GLB 请求、选中拖放、安装/拆卸、接线和自检。检查截图中的部件造型是否与参考图的轮廓、配色和关键结构一致。
- 完成条件：学生概述与装机工作台都使用新 3D 资产，旧功能可用，源 `.blend` 可继续编辑，预览可由现有一键演示登录进入。
