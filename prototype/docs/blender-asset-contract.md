# Blender 教学主机资产交付规范

首套原创 Blender 教学主机已接入装机工作台。概述爆炸图继续使用现有模型；装机页按需加载本地 GLB，失败时显示提示并使用程序化模型。

## 文件与单位

源文件放在 `art-source/computer/teaching-pc.blend`；运行资源放在 `public/models/teaching-pc.glb`，贴图内嵌 GLB。源文件不打包进 dist。场景使用米，统一缩放应用后再导出；以尺寸约 0.45m 的机箱为参照。glTF 为右手 Y-up，使用 Blender 导出器自动轴向转换，不手工重复旋转。加载器在模型根节点上统一缩放以适配目前教学场景单位。

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

渲染节点名和业务类型之间使用显式映射（例如 `ram_0` → `memory`），不能依靠场景遍历序号。每个 mesh 的拾取必须向上找到所属可操作部件；轮廓和预览不参与拾取。

## 材质和性能

- Principled BSDF 对应 glTF PBR；金属度、粗糙度、底色、法线使用可导出的纹理通道。
- 复杂节点先烘焙，保持足够的粗糙度，避免无环境反射时金属全黑。
- 机箱透明侧板单独材质；避免所有部件启用透明或双面。
- 拟定首套模型及贴图合计 ≤5MB，可见三角面 ≤100k；大多数纹理 1K，重点部件至多 2K。实际验收看集显帧率及内存，不单看文件大小。
- 第一套资产使用原创通用造型；不依赖游戏提取资产、品牌模型或远程 CDN。

## 加载与交互责任

Three.js GLTFLoader 按需加载本地 GLB，仅缓存验证后的二进制字节；每个挂载场景独立解析为可操作实例。核心安装位置读取对应 socket 锚点并统一缩放 3.1 倍。实例控制器拥有相机、拾取、安装预览和动画。React/纯函数拥有安装规则、配置变动失效和自检状态。Blender 中的动画只提供动作素材，不作为业务状态真相。

释放实例时释放本实例材料、几何、纹理和事件监听；在节点移出导入场景前记录资源集合，确保已拆离的部件也被释放。当前实例之间不共享 GPU 资源，缓存仅保留一份约 0.79 MB 的源字节。加载失败显示明确原因并保留现有教学替代操作。

## 接入验收

在 `npm run qa:production` 中增加真实 GLB 请求检查：节点齐全、尺寸合理、无外部资源请求；每个可拆件能选中、预览、装入、拆出；核显配置不出现独显卡；模型加载失败、WebGL 丢失能降级；切换十次场景后内存增长受控。不得仅检查 Blender 渲染图或 Vite 开发页。


## 当前交付与重新生成

- 建模脚本：[create_teaching_pc.py](../art-source/computer/create_teaching_pc.py)，使用 Blender Python 创建原创通用造型。
- 可编辑源文件：[teaching-pc.blend](../art-source/computer/teaching-pc.blend)。
- 网页资产：[teaching-pc.glb](../public/models/teaching-pc.glb)，791,196 字节、11,472 三角面，无外部贴图或模型依赖。
- 制作工具：Blender 4.5.9 LTS 官方 Windows 便携版。下载文件已与官方 SHA-256 校验表核对；工具留在忽略目录 qa-artifacts/blender-tools/，不进入版本库或 dist。
- 在 prototype 目录运行：blender --background --factory-startup --python art-source/computer/create_teaching_pc.py。如果没有加入 PATH，使用本机 Blender 可执行文件的完整路径。
- 脚本重新生成会覆盖同目录的 .blend 和 public/models 下的 GLB；手工精修后应保留修改后的源文件，不再直接运行生成脚本覆盖。
- 手工导出时保留命名部件、Empty 安装锚点、米制比例和 Y-up 自动转换。网页安装点以锚点为准。

## 当前教学操作

侧板开合、主板/电源固定和散热器安装采用明确按钮操作；CPU、内存、SSD 和独显保留直接拾取、拖放与插槽预览。鼠标无法使用或 WebGL 不可用时，按钮路径仍可完成教学。

连接通过选择线缆端与目标接口完成，提供主板 24-pin、CPU 8-pin、CPU 风扇、SATA 数据和硬盘供电五条简化连接；错误配对或缺少端点部件会被拒绝。当前通用独显由 PCIe 插槽供电，不模拟各品牌高功耗显卡的外接供电差异。

开机必须同时满足核心部件、主板、电源、散热器和所有必要连接。CPU 更换会使散热器及受影响连接失效；拆电源会清除连接；主板有部件时不能直接拆下。结构草稿与核心部件一样按学生/订单隔离，恢复后必须重新自检。侧板打开时允许教学自检。

当前是可编辑的教学模型初版，材质使用纯 PBR 色值，未使用写实贴图、品牌标识、螺钉物理、软线物理或电气/温度仿真。

## 自动验证入口

- npm test：包含真实 GLB 格式、节点、面数、独立实例释放和装配前置条件测试。
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
