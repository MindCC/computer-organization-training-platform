# Blender 教学主机资产交付规范

首套原创 Blender 教学主机已接入装机工作台。概述爆炸图继续使用现有模型；装机页按需加载本地 GLB，失败时显示提示并使用程序化模型。

## 文件与单位

当前精修源文件为 `art-source/computer/teaching-pc-v2.blend`，保留 `teaching-pc.blend` 作为初版；运行资源为 `public/models/teaching-pc.glb`，512×512 原创 PCB 丝印贴图内嵌 GLB。源文件不打包进 dist。场景使用米，以尺寸约 0.45m 的机箱为参照。glTF 为右手 Y-up，使用 Blender 导出器自动转换；不手工重复旋转。适配器读取安装锚点的世界位置、四元数和缩放，再统一转换为当前教学场景的 3.1 倍单位。

## 节点约定

| 独立部件节点 | 对应教学语义 | 安装锚点 |
|---|---|---|
| case | 机箱骨架 | assembly_origin |
| side_panel | 可拆侧板 | socket_side_panel |
| motherboard | 主板 | socket_motherboard |
| psu | 电源 | socket_psu |
| cpu | 处理器 | socket_cpu |
| cooler | CPU 散热器 | socket_cooler |
| ram_0 | 内存 | socket_memory |
| gpu | 独立显卡 | socket_gpu |
| storage | SATA SSD | socket_storage |

锚点为 Empty 导出节点，表示部件正确安装后的原点/旋转。每个部件的局部原点位于安装接触面中心，模型向上方向一致。建模源中保留 CPU 方向三角、DIMM 缺口、PCIe 金手指、接口防呆形状。

`assembly_origin` 的自定义属性 `schemaVersion` 为 `2`。各 `socket_*` 的 `approach` 属性定义局部安装方向，`focus_*` 子节点定义近景观察点。运行时保留完整锚点姿态，并沿安装方向吸附；背面拖入被拒绝。精修时部件几何应保持在对应局部坐标内，通过安装锚点调整装入后的姿态。

接口 Empty 必须保留在所属部件下面，并包含 `connectorId` 和业务 `partId`。端点位置从运行时世界矩阵读取，拆装部件时线缆会随动。

| 线缆 | 两端节点 | 所属部件 |
|---|---|---|
| 主板供电 | `port_psu-atx` → `port_board-atx` | psu → motherboard |
| CPU 供电 | `port_psu-cpu` → `port_cpu-power` | psu → motherboard |
| 散热风扇 | `port_cooler-fan` → `port_cpu-fan` | cooler → motherboard |
| SATA 数据 | `port_ssd-data` → `port_board-sata` | storage → motherboard |
| SSD 供电 | `port_psu-sata` → `port_ssd-power` | psu → storage |

可动节点：`cpu_retention_lever`、`dimm_latch_front/back`、`cooler_fan_rotor`、`gpu_fan_left/right`。压杆/卡扣动作命名为 `<节点名>_close`，首帧打开、末帧闭合，只保留该节点的局部旋转轨道；运行时根据安装状态采样这条轨道，不依赖 GLB 导出的默认显示帧。风扇动作命名为 `<节点名>_spin`，转子中心为局部旋转原点，glTF 局部 Y 轴为转轴。减少动态效果时压杆/卡扣直接到位、风扇停止持续旋转。

渲染节点名和业务类型之间使用显式映射（例如 `ram_0` → `memory`），不能依靠场景遍历序号。每个 mesh 的拾取必须向上找到所属可操作部件；轮廓和预览不参与拾取。

## 材质和性能

- Principled BSDF 对应 glTF PBR；金属度、粗糙度、底色、法线使用可导出的纹理通道。
- 复杂节点先烘焙，保持足够的粗糙度，避免无环境反射时金属全黑。
- 机箱透明侧板单独材质；避免所有部件启用透明或双面。
- 拟定首套模型及贴图合计 ≤5MB，可见三角面 ≤100k；大多数纹理 1K，重点部件至多 2K。实际验收看集显帧率及内存，不单看文件大小。
- 第一套资产使用原创通用造型；不依赖游戏提取资产、品牌模型或远程 CDN。

## 加载与交互责任

Three.js GLTFLoader 按需加载本地 GLB，仅缓存验证后的二进制字节；每个挂载场景独立解析为可操作实例。`src/teachingPcManifest.json` 记录版本、URL、字节数、三角面和 SHA-256，加载 URL 带内容哈希；浏览器检查格式、节点和字节数，在支持 Web Crypto 的安全上下文检查 SHA-256。实例控制器拥有相机、拾取、安装预览和动画。React/纯函数拥有安装规则、配置变动失效和自检状态。Blender 中的动画只提供动作素材，不作为业务状态真相。

释放实例时释放本实例材料、几何、纹理和事件监听；在节点移出导入场景前记录资源集合，确保已拆离的部件也被释放。当前实例之间不共享 GPU 资源，缓存仅保留一份约 0.91 MB 的源字节。加载失败显示明确原因并保留现有教学替代操作。金属使用本地 64×64 六面环境反射，避免新增外部 HDR 请求。

## 接入验收

在 `npm run qa:production` 中增加真实 GLB 请求检查：节点齐全、尺寸合理、无外部资源请求；每个可拆件能选中、预览、装入、拆出；核显配置不出现独显卡；模型加载失败、WebGL 丢失能降级；切换十次场景后内存增长受控。不得仅检查 Blender 渲染图或 Vite 开发页。


## 精修、独立导出与重新生成

- 建模脚本：[create_teaching_pc.py](../art-source/computer/create_teaching_pc.py)，使用 Blender Python 创建原创通用造型。
- 当前可编辑源文件：[teaching-pc-v2.blend](../art-source/computer/teaching-pc-v2.blend)。
- 网页资产：[teaching-pc.glb](../public/models/teaching-pc.glb)，909,000 字节、12,879 三角面、1 张内嵌丝印纹理、8 条机械动作，无外部贴图或模型依赖。
- 制作工具：Blender 4.5.9 LTS 官方 Windows 便携版。下载文件已与官方 SHA-256 校验表核对；工具留在忽略目录 qa-artifacts/blender-tools/，不进入版本库或 dist。

日常精修流程：在 Blender 打开 v2 源文件 → 修改几何/材质/锚点并保存 → 在 `prototype` 目录运行 `npm run assets:export` → 运行 `npm run qa:production`。导出脚本只读取已保存源文件，校验节点、资源和预算后替换 GLB，同时生成清单；不会重新建模或覆盖源文件。支持 `npm run assets:export -- art-source/computer/another.blend` 导出其他符合规范的源文件。

导出入口优先使用环境变量 `BLENDER_BIN`，其次使用本项目已有便携版，最后查找 PATH 中的 `blender`。例如 PowerShell：

```powershell
$env:BLENDER_BIN = 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe'
npm run assets:export
```

只有需要新的基础模型时才运行生成脚本，必须指定不存在的输出文件：

```powershell
blender --background --factory-startup --python-exit-code 1 --python art-source/computer/create_teaching_pc.py -- --output art-source/computer/teaching-pc-new.blend
```

生成脚本拒绝覆盖已有源文件，也不直接更新网页 GLB。精修和导出属于两个独立步骤。提交交付时应一起包含精修源、GLB、资源清单及必要脚本变更。

## 当前教学操作

侧板开合、主板/电源固定和散热器安装采用明确按钮操作；CPU、内存、SSD 和独显保留直接拾取、拖放与插槽预览。鼠标无法使用或 WebGL 不可用时，按钮路径仍可完成教学。

点击“连接线缆”进入场景接线模式：点击插头标记或标签，再点目标接口；两侧标签通过引线定位真实接口，匹配目标和线路预览为青绿色。提供主板 24-pin、CPU 8-pin、CPU 风扇、SATA 数据和硬盘供电五条简化连接；错误配对或缺少端点部件会被拒绝。普通视图保留下拉框辅助操作。当前通用独显由 PCIe 插槽供电，不模拟各品牌高功耗显卡的外接供电差异。

开机必须同时满足核心部件、主板、电源、散热器和所有必要连接。CPU 更换会使散热器及受影响连接失效；拆电源会清除连接；主板有部件时不能直接拆下。结构草稿与核心部件一样按学生/订单隔离，恢复后必须重新自检。侧板打开时允许教学自检。

当前是可编辑的教学模型 v2，具备 PBR 材质、原创丝印纹理和机械动作。尚不包含品牌标识、螺钉物理、软线物理或电气/温度仿真；视觉目标是清楚辨认装配结构和接口。

## 自动验证入口

- npm test：包含真实 GLB 格式、节点、面数、独立实例释放和装配前置条件测试。
- npm run assets:export：独立导出当前源并更新资源清单；Python 出错时返回非零状态。
- npm run qa:production：真实 GLB 请求、核心拖放、错误接线、完整自检、草稿隔离、模型请求失败降级以及无 WebGL 路径。
- npm run qa:3d-budget：包含按需加载的 GLTFLoader 依赖，沿用 220 KiB gzip 总预算和单包 500 KiB 上限。
- node scripts/run-browser-qa.mjs scripts/verify-performance.mjs --production：完整模型/散热器/接线场景的十次生命周期与帧率。


## 2026-09-07 验收记录

- 全量自动测试：332 项通过；最终受影响的状态与 GLB 检查 8 项复验通过。
- 生产 3D 回归：32/32 通过，包含真实 GLB 加载与请求失败后的程序化降级。
- 全平台生产 UI 回归：通过，覆盖新装配前置步骤及交付流程。
- 首屏 JavaScript：459,170 字节；3D 与 GLTFLoader 依赖合计 gzip 191,060 字节；最大 3D 单包 505,375 字节，均在既定预算内。
- 本机完整装配场景：约 60.42 FPS，P95 帧间隔 16.8 ms，十次进出后 JS 堆增长 1,029,800 字节。概述场景约 60.37 FPS。
- 性能结果来自本机无头 Edge/Chromium，JS 堆指标不等同于 GPU 显存，也不能代替全部教室集显机器的实测。
- 检查日志和桌面/移动端截图位于 qa-artifacts/，不进入版本库。
- 此记录只说明本次 3D 改进的验证结果；此前平台审计中的身份校验和项目提交问题仍须单独修复，不能据此认定整个平台可正式部署。

## 2026-09-08 v2 验收记录

验证对象为本次 v2 最终工作树（基于 `2cc1b88`），Windows 本机、单个无头 Chromium；日志和截图保存于忽略目录 `qa-artifacts/`。

| 检查 | 结果 |
|---|---|
| `npm test` | 352/352 通过；最终动作关键帧修正后，模型/姿态相关 7/7 再次通过 |
| `npm run qa:production` | 生产模块导入通过，3D 回归 32/32；覆盖场景五条线缆、错接、拖放、草稿、开机、移动布局及降级 |
| 最终构建的 3D / 首屏 / 图片预算脚本 | 全部通过；3D gzip 195,777 字节，最大单包 505,383 字节，首屏 JS 459,586 字节 |
| 开机风扇运转的生产性能 | 60.43 FPS，P95 16.7 ms；十次装配场景进出后 JS 堆增长 1,378,316 字节 |
| 概述场景性能 | 60.42 FPS，P95 16.8 ms；十次进出后 JS 堆增长 1,863,464 字节 |
| 独立导出 | 成功，源文件 SHA-256 前后相同，重复导出得到相同 GLB 哈希 |

当前 GLB SHA-256 为 `de70665b22f50f26f948a0e78efc92342a74cbb44364838e23ab180162c19e98`。源文件 SHA-256 为 `961359e17111b1c5f2fb36d1e09ebeeba2dc74afef93c12ce3182195d7ca7d47`。

截图复查覆盖近景、专注装配、场景接线、开机和移动端。接线标签重叠问题已在真实点击回归中复现并修复；压杆/卡扣的导出默认姿态问题通过真实 GLB 动画轨道检查修复。性能是本机测量，仍需在目标教室集显设备上抽测；JS 堆增长不代表 GPU 显存。
