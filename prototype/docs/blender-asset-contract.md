# Blender 教学主机资产交付规范

用于下一阶段替换当前程序化部件。当前未包含 Blender 制作的模型；现有网页仍使用 Three.js 组合模型。

## 文件与单位

源文件建议放在 `art-source/computer/teaching-pc.blend`；运行资源放在 `public/models/teaching-pc.glb`，贴图内嵌 GLB。源文件不打包进 dist。场景使用米，统一缩放应用后再导出；以尺寸约 0.45m 的机箱为参照。glTF 为右手 Y-up，使用 Blender 导出器自动轴向转换，不手工重复旋转。加载器在模型根节点上统一缩放以适配目前教学场景单位。

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

Three.js GLTFLoader 按需加载本地 GLB，缓存源资产；每个挂载场景生成可独立操作的实例。实例控制器拥有相机、拾取、安装预览和动画。React/纯函数拥有安装规则、配置变动失效和自检状态。Blender 中的动画只提供动作素材，不作为业务状态真相。

释放实例时释放本实例材料、辅助几何和事件监听；共享缓存的几何和纹理通过引用计数或统一资产管理器释放。加载失败显示明确原因并保留现有教学替代操作。

## 接入验收

在 `npm run qa:production` 中增加真实 GLB 请求检查：节点齐全、尺寸合理、无外部资源请求；每个可拆件能选中、预览、装入、拆出；核显配置不出现独显卡；模型加载失败、WebGL 丢失能降级；切换十次场景后内存增长受控。不得仅检查 Blender 渲染图或 Vite 开发页。
