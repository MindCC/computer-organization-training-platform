# 原生 Three.js 场景优化设计

日期：2026-08-12

## 背景

计算机组成探索关卡已经按需加载，但 `OverviewExplodedView` 生产块约为 1.00 MiB，gzip 约 277 KiB。主要体积来自 Three.js、React Three Fiber 和 Drei 运行时，而不是模型资源。当前首屏和普通电路实验不受影响，但 3D 关卡仍触发 Vite 的 500 KiB 单块警告。

## 目标

- 移除 `@react-three/fiber` 和 `@react-three/drei`，使用原生 Three.js 驱动场景。
- 保留自动爆炸、装配/爆炸/全展开、分步装配、相机旋转缩放、部件选择、X-ray、总线、数据流动画和完成结算。
- 允许简化 PBR 环境光、高分辨率阴影和 Drei 专用视觉辅助，以部件辨识度、交互稳定性和加载性能优先。
- 3D 路径所有 JavaScript 的 gzip 合计小于 220 KiB。
- 任一 3D JavaScript 块的未压缩大小小于 500 KiB，不通过调高 Vite 警告阈值规避限制。

## 非目标

- 不重做计算机部件模型或教学文案。
- 不改变关卡进度、评分、结算和后端接口。
- 不把 3D 代码重新合并进首屏或普通实验包。
- 不引入外部模型、纹理、CDN 或运行时网络依赖。

## 架构

### React 层

`OverviewExplodedView` 继续负责教学状态和界面控件：

- 模式、装配步骤和爆炸距离。
- 当前选中部件和部件说明卡。
- X-ray 开关、提示和完成按钮。
- WebGL fallback 与结算回调。

React 通过一个场景容器引用和明确的场景控制器 API 更新 Three.js，不直接管理 renderer、camera、材质生命周期或帧循环。

### 场景控制器

新增单一原生 Three.js 场景控制器，职责包括：

- 创建 scene、camera、renderer、灯光和网格辅助线。
- 从现有 `computerParts.js` 构建部件、主板细节、总线和数据流粒子。
- 根据 React 状态更新可见部件、爆炸距离、高亮和 X-ray 材质。
- 使用 `OrbitControls` 提供旋转、缩放和阻尼控制。
- 使用 Raycaster 处理部件点击和总线悬停。
- 在 resize、devicePixelRatio 变化和容器尺寸变化时更新相机与 renderer。
- 在卸载时停止动画帧、移除监听器并释放 GPU 资源。

场景控制器对 React 暴露最小接口：

```js
createNativeComputerScene(container, options) -> {
  setViewState(viewState),
  resize(),
  dispose(),
}
```

`viewState` 只包含场景表现所需的序列化状态，例如可见部件 ID、爆炸距离、高亮部件 ID、X-ray 和总线可见性。

### 数据复用

继续复用 `computerParts.js` 中的几何体、材质、连接定义和位置计算。场景控制器克隆需要独立修改的材质，避免 X-ray 或高亮状态污染共享材质。原有数据模块不感知 React 或 DOM。

## 视觉策略

- 使用 ambient light、两到三个 directional light 和低成本背景色代替 `Environment`、`Lightformer` 与 PBR 环境贴图。
- 默认关闭实时阴影；若视觉对比不足，仅为主方向光启用低分辨率阴影。
- 使用原生 `GridHelper` 代替 Drei `Grid`。
- 总线仍用圆柱或线段显示，X-ray 时关闭深度测试。
- 数据流粒子使用复用的 BufferGeometry 和 Material，避免每条总线创建重复资源。
- 总线标签使用 DOM 覆盖层；每帧把总线中点投影到屏幕坐标，隐藏相机背后的标签。

## 交互与状态流

1. React 挂载场景容器并创建控制器。
2. 控制器创建 Three.js 场景并报告初始化成功或失败。
3. React 的模式、步骤、X-ray 或选中状态变化后调用 `setViewState`。
4. 控制器在帧循环中插值部件位置、更新粒子和标签坐标，然后渲染。
5. Raycaster 命中部件时，通过 `onPartSelect(partId)` 回调 React。
6. React 卸载或进入 fallback 时调用 `dispose()`，释放全部控制器拥有的资源。

## 错误处理

- `canUseWebGL()` 为 false 时不创建控制器，直接使用现有 `ThreeSceneFallback`。
- renderer 或场景初始化抛错时捕获错误、释放已创建资源并切换 fallback。
- 监听 `webglcontextlost`，阻止默认恢复流程并切换 fallback；避免页面停留在空画布。
- ResizeObserver 不可用时退化为 window resize 监听。
- 控制器的 `dispose()` 必须可重复调用，防止 React StrictMode 重挂载导致二次释放错误。

## 构建预算

新增独立 3D 构建预算脚本。脚本先生成 Vite manifest，再从 `OverviewExplodedView` 动态入口递归收集静态 JavaScript 依赖：

- 统计每个文件的未压缩大小并断言小于 500 KiB。
- 对每个文件执行 gzip，断言路径总和小于 220 KiB。
- 不把主入口中已缓存的 React 公共代码重复计入 3D 专项下载；报告中同时列出完整依赖与增量依赖，避免口径不透明。

## 测试与验收

### 单元测试

- 视图状态到部件可见性、位置和材质状态的映射。
- 屏幕投影与背面标签隐藏逻辑。
- 资源注册和 `dispose()` 的幂等行为。
- 3D manifest 依赖收集和 gzip 预算计算。

### 浏览器测试

扩展 `qa:3d` 验证：

- 自动爆炸和三档爆炸距离。
- 八步装配、键盘前后切换和完成结算。
- OrbitControls 旋转与缩放。
- 部件点击、详情卡关闭和高亮。
- X-ray 开关、四类总线与标签。
- WebGL fallback 和上下文丢失处理。
- 页面重载与重复进入 3D 关卡时无控制台错误或重复 canvas。

### 回归命令

- `npm test`
- `npm run qa:3d`
- `npm run qa:ui`
- `npm run qa:assets`
- `npm run qa:build-budget`
- 新增的 3D 构建预算命令

## 迁移顺序

1. 先建立 3D 构建预算和场景纯逻辑测试，并观察预期失败。
2. 实现原生场景控制器和资源生命周期。
3. 将 `OverviewExplodedView` 切换到原生场景容器。
4. 补齐标签、X-ray、粒子和选择交互。
5. 删除 Fiber/Drei 依赖和遗留组件代码。
6. 执行完整自动化、3D 浏览器与构建预算回归。

## 风险控制

- 原生事件拾取和 React 状态同步是主要回归风险，统一封装在控制器回调中，不允许组件各自监听 canvas。
- GPU 资源泄漏通过集中资源注册表和幂等 `dispose()` 防护。
- 视觉简化以浏览器截图和部件/总线可辨识断言验收，不仅以包体积作为成功标准。
- 如果移除 Fiber/Drei 后仍未达到 gzip 220 KiB，优先检查 Three.js 导入和重复几何体，不降低教学交互或调高预算。
