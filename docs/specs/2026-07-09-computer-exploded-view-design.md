# 计算机 3D 爆炸视图 — 设计文档

日期：2026-07-09

## 1. 概述

为"计算机概述"关卡和"硬件游戏"两个场景提供统一的 3D 计算机爆炸视图。学生可以直观看到计算机内部结构、部件如何组装/拆卸、不同元件如何协作。

### 1.1 核心目标

- **概述关卡**：展示五大部件（输入/存储/控制/运算/输出），自动播放爆炸→装配动画，支持手动旋转缩放
- **硬件游戏**：让学生"装机"——从零件库拖拽 CPU/内存/硬盘/显卡到机箱对应槽位，系统实时评分

### 1.2 技术选型

| 项 | 选择 |
|----|------|
| 3D 引擎 | Three.js + @react-three/fiber + @react-three/drei |
| 模型方案 | 几何体（BoxGeometry/CylinderGeometry），预留 glTF 加载接口 |
| 架构 | 共享核心 + 两个独立场景组件 |
| 桌面优先 | 不考虑移动端，目标 60fps |

### 1.3 不做什么

- 不做真实照片级渲染（PBR 材质不做）
- 不做 WebXR/VR
- 不做多人协同编辑
- 不做自定义机箱外观（首版固定布局）

---

## 2. 组件架构

```
src/components/
├── ComputerExplodedView.jsx    # 共享核心：Three.js Canvas 封装，灯光/相机/地面
├── OverviewExplodedView.jsx    # 概述场景：五大部件爆炸动画 + 标签
├── HardwareBuilderView.jsx     # 装机场景：拖拽零件→槽位 + 实时评分
├── computerParts.js            # 部件几何体工厂函数（cpuGeometry, ramGeometry...）
├── computerPartLabels.js       # 部件中英文标签 + 描述
└── ComputerExplodedView.css    # 场景容器 + 覆盖层样式
```

### 2.1 ComputerExplodedView（共享核心）

```
Props:
  - mode: 'overview' | 'builder'
  - explodedDistance: number      # 爆炸展开距离（0=装好, 1=全展开）
  - children: ReactNode           # 3D 内容

Responsibility:
  - 创建 Three.js Canvas
  - 设置 PerspectiveCamera + OrbitControls（旋转/缩放/平移）
  - 环境光 + 方向光
  - 深色背景 + 网格地面
  - 窗口 resize 自适应
```

### 2.2 OverviewExplodedView（概述场景）

```
Props:
  - autoPlay: boolean            # 是否自动播放爆炸动画
  - step: number                 # 当前步骤（0-6）
  - onStepChange: (step) => void

Responsibility:
  - 渲染 6 个 3D 部件（输入设备/存储器/控制器/运算器/输出设备/电源）
  - 每个部件：几何体 + 标签（CSS overlay 或 sprite）
  - 爆炸动画：部件沿各自轴向向外平移 + 轻微旋转
  - 步骤控制：「自动播放」循环展开/合拢，「上一步/下一步」手动步进
  - 点击部件：高亮 + 弹出信息卡（名称/功能/数据流方向）
```

**步骤设计：**

| 步骤 | 行为 | 视觉效果 |
|------|------|----------|
| 0 | 全部装好 | 所有部件紧凑排列，电源线可见 |
| 1 | 输出设备弹出 | 显示器/打印机向外滑出 |
| 2 | 输入设备弹出 | 键盘/鼠标向外滑出 |
| 3 | 运算器弹出 | CPU/ALU 单独浮出 |
| 4 | 控制器弹出 | 控制单元浮出 |
| 5 | 存储器弹出 | 内存/硬盘浮出 |
| 6 | 全爆炸 | 所有部件完全展开，显示连线 |

### 2.3 HardwareBuilderView（装机场景）

```
Props:
  - caseId: string               # 当前客户案例 ID
  - parts: { cpu, memory, storage, gpu }  # 学生当前选择
  - onPartChange: (slot, partId) => void
  - score: { profit, satisfaction, bottlenecks }

Responsibility:
  - 渲染机箱框架（半透明机箱）
  - 4 个槽位（CPU槽/内存槽/硬盘槽/显卡槽），高亮显示空槽位
  - 零件面板（屏幕右侧/底部）：可选零件卡片，点击选中→自动飞入槽位
  - 装机动画：零件从面板飞入槽位
  - 实时评分覆盖层：预算/利润/满意度
  - 提交按钮
```

**机箱槽位布局（俯视图）：**
```
┌─────────────────────────────┐
│  [电源]         [CPU 槽]    │  主板区域
│  [显卡槽]       [内存槽×4]  │
│  [硬盘槽×2]                  │  存储区域
└─────────────────────────────┘
```

---

## 3. 部件模型定义

### 3.1 几何体蓝图

```javascript
// computerParts.js

// CPU: 扁平方块 + 底部针脚圆柱
function createCPUGeometry() {
  const body = new BoxGeometry(0.4, 0.05, 0.4);
  const pins = Array.from({length: 16}, (_, i) => {
    const pin = new CylinderGeometry(0.01, 0.01, 0.06, 8);
    pin.translate(-0.15 + (i%4)*0.1, -0.05, -0.15 + Math.floor(i/4)*0.1);
    return pin;
  });
  return mergeGeometries([body, ...pins]);
}

// 内存条: 长条 PCB + 底部金手指
function createRAMGeometry() {
  return new BoxGeometry(0.08, 0.5, 0.02);  // 简化：长条方块
}

// 主板: 大平面
function createMotherboardGeometry() {
  return new BoxGeometry(0.8, 0.02, 0.9);  // 扁平大板
}

// 显卡: 类似 CPU 但更大，带散热器
function createGPUGeometry() {
  return new BoxGeometry(0.35, 0.06, 0.25); // 简化
}

// 硬盘: 金属扁盒
function createStorageGeometry() {
  return new BoxGeometry(0.2, 0.12, 0.35); // SSD/HDD
}

// 电源: 大方块
function createPSUGeometry() {
  return new BoxGeometry(0.3, 0.25, 0.4);
}
```

### 3.2 材质方案

| 部件 | 颜色 | 材质参数 |
|------|------|----------|
| CPU | 银色金属 | MeshStandardMaterial({ color: '#C0C0C0', metalness: 0.8, roughness: 0.2 }) |
| 内存 | 深绿 PCB | MeshStandardMaterial({ color: '#1a5c2a', metalness: 0.1, roughness: 0.6 }) |
| 主板 | 暗绿 | MeshStandardMaterial({ color: '#0d3320', metalness: 0.05, roughness: 0.8 }) |
| 显卡 | 暗灰+红条纹 | 两个 material 混合 |
| 硬盘 | 银色 | 类似 CPU |
| 电源 | 深灰金属 | MeshStandardMaterial({ color: '#333', metalness: 0.6 }) |

---

## 4. 动画系统

### 4.1 爆炸动画

使用 react-spring 或 gsap 驱动 `explodedDistance`（0→1）：

```javascript
// 每个部件的位置 = basePosition + direction * explodedDistance * maxOffset
const position = useMemo(() => {
  return basePosition.clone().add(
    direction.clone().multiplyScalar(explodedDistance * maxOffset)
  );
}, [explodedDistance]);
```

### 4.2 装机飞入动画

```javascript
// 零件点击 → 从面板位置 lerp 到槽位位置
const { position } = useSpring({
  from: { position: panelPosition },
  to: { position: slotPosition },
  config: { tension: 200, friction: 20 },
});
```

---

## 5. 与现有系统集成

### 5.1 替代 computer-components 关卡

将 `ChallengeCanvas` 中的 `computer-components` 场景替换为 `OverviewExplodedView`：

```jsx
// 在 LabPage.jsx 或 renderLabStudioScreen 中
{currentChallenge.id === 'computer-components' ? (
  <OverviewExplodedView autoPlay={true} />
) : currentCircuitModel ? (
  <ReactFlowLab />
) : (
  <LegacyLab />
)}
```

### 5.2 增强硬件游戏

在 `HardwareGamePage` 中嵌入 `HardwareBuilderView`，替换当前的纯表单：

```jsx
// HardwareGamePage.jsx
<HardwareBuilderView
  caseId={selectedHardwareCaseId}
  parts={hardwareSelection}
  onPartChange={setHardwareSelection}
  score={preview}
/>
```

---

## 6. 实现计划（Task 分解）

### Phase 1: 基础设施（预计 6 tasks）

| Task | 内容 | 文件 |
|------|------|------|
| 1 | 安装 three.js + @react-three/fiber + @react-three/drei | package.json |
| 2 | 创建 computerParts.js 部件几何体工厂 | src/components/computerParts.js |
| 3 | 创建 ComputerExplodedView 共享核心 | src/components/ComputerExplodedView.jsx |
| 4 | 验证：渲染一个简单场景（CPU 方块+旋转），build 通过 | 临时 test |
| 5 | 添加 CSS 样式 | src/components/ComputerExplodedView.css |
| 6 | Commit | |

### Phase 2: 概述场景（预计 5 tasks）

| Task | 内容 | 文件 |
|------|------|------|
| 7 | 创建 OverviewExplodedView：6 个部件排列 | src/components/OverviewExplodedView.jsx |
| 8 | 添加爆炸动画（react-spring 驱动） | 同上 |
| 9 | 添加步骤控制（自动播放/上一步/下一步） | 同上 |
| 10 | 集成到 computer-components 关卡 | App.jsx / LabPage |
| 11 | 验证 + Commit | |

### Phase 3: 装机场景（预计 6 tasks）

| Task | 内容 | 文件 |
|------|------|------|
| 12 | 创建 HardwareBuilderView：机箱框架+槽位 | src/components/HardwareBuilderView.jsx |
| 13 | 添加零件面板（右侧） | 同上 |
| 14 | 添加点击→飞入动画 | 同上 |
| 15 | 添加实时评分覆盖层 | 同上 |
| 16 | 集成到 HardwareGamePage | HardwareGamePage.jsx |
| 17 | 验证 + Commit | |

---

## 7. 风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| @react-three/fiber 与 Vite 打包不兼容 | 中 | 已验证 Vite + R3F 组合成熟稳定 |
| 几何体过于简陋，教学效果差 | 低 | 颜色+材质+标签弥补辨识度 |
| 动画性能（60fps） | 低 | 6-8 个部件，几何体总面数 <1000 |
| 与现有 React Flow 冲突 | 低 | 不同关卡，不同组件树，无交集 |

---

## 8. 验收标准

- [ ] computer-components 关卡打开后 3D 场景渲染在 2s 内
- [ ] 自动播放爆炸动画流畅无卡顿
- [ ] 鼠标可以旋转/缩放/平移场景
- [ ] 点击部件显示名称和功能说明
- [ ] 硬件游戏装机场景：点击零件→飞入槽位→实时评分更新
- [ ] npm test 全部通过（不影响现有测试）
- [ ] npm run build 通过
