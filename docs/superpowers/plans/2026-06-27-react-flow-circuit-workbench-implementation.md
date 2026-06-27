# React Flow 电路工作台开发交接文档

> 目标：让任何接手工程师都能把当前手写实验画布迁移为 React Flow 驱动的电路工作台，同时保留现有中文教学闭环。

## 0. 当前项目事实

项目位置：

- `D:\workspace\zcyl_training\prototype`

技术栈：

- React 19
- Vite 6
- Node test runner
- Playwright smoke check

当前关键文件：

- `src/App.jsx`
  - 当前主应用和实验台都在这里，约 2000 行。
- `src/platformLogic.js`
  - 当前关卡数据、判题、学习记录、演示仿真。
- `src/labWiring.js`
  - 当前手写拖线、端点、导线渲染辅助逻辑。
- `src/labPlacement.js`
  - 当前元件放置槽位和放置判题。
- `src/labWorkbench.js`
  - 当前信号徽标和错误 marker。
- `scripts/verify-ui.mjs`
  - 当前浏览器 smoke check。

现有验证命令：

```powershell
cd D:\workspace\zcyl_training\prototype
npm.cmd test
npm.cmd run build
```

注意：

- Vite build 可能会写 `node_modules/.vite-temp`。如果沙箱拦截，需用提升权限重跑。
- 当前工作区可能已有未提交改动，接手前必须先看 `git status --short`，不要回滚别人改动。

## 1. 总体策略

不要一次性重写整个平台。

执行顺序：

1. 安装 `@xyflow/react`。
2. 新增结构化电路模型和纯函数测试。
3. 用半加器做 React Flow POC。
4. POC 通过后再替换六个关卡。
5. 最后拆薄 `App.jsx`。

成功判断：

- 半加器可以用 React Flow 完成拖线、删线、提交检测、运行测试用例。
- 旧的首页、学习记录、笔记、设置不回退。
- 新代码不把判题规则写进 React 组件。

## 2. 依赖安装

命令：

```powershell
cd D:\workspace\zcyl_training\prototype
npm.cmd install @xyflow/react
```

安装后需要确认：

- `package.json` 新增 `@xyflow/react`。
- `package-lock.json` 更新。
- `npm.cmd test` 仍通过。

React Flow 样式导入方式：

```js
import "@xyflow/react/dist/style.css";
```

建议先在 `src/main.jsx` 或新的 `CircuitFlowCanvas.jsx` 中导入。若只在 POC 使用，优先放在组件附近，后续稳定后再整理。

## 3. 新增文件建议

第一批新增：

```text
src/circuit/challengeCircuitModel.js
src/circuit/reactFlowMapping.js
src/circuit/circuitValidation.js
src/circuit/circuitSimulation.js
src/circuit/challengeCircuitModel.test.mjs
src/circuit/reactFlowMapping.test.mjs
src/circuit/circuitValidation.test.mjs
src/circuit/circuitSimulation.test.mjs
src/components/CircuitFlowCanvas.jsx
src/components/CircuitNode.jsx
```

如果项目暂时没有 `src/components` 目录，可以新增。

## 4. 数据模型任务

### Task 1：定义结构化半加器模型

文件：

- 新增 `src/circuit/challengeCircuitModel.js`
- 新增 `src/circuit/challengeCircuitModel.test.mjs`

先只实现半加器：

- `input-a`
- `input-b`
- `xor-1`
- `and-1`
- `sum-output`
- `carry-output`

每个节点必须有：

- `id`
- `type`
- `label`
- `position`
- `ports`

每个端口必须有：

- `id`
- `label`
- `direction`: `"in"` 或 `"out"`
- `signal`: 初期统一 `"bit"`

测试必须覆盖：

- 每个节点 id 唯一。
- 每个节点内端口 id 唯一。
- `requiredEdges` 指向的节点和端口都存在。
- `testCases` 至少包含 `00`、`01`、`10`、`11`。

验收命令：

```powershell
npm.cmd test
```

## 5. React Flow 映射任务

### Task 2：模型和 React Flow 互转

文件：

- 新增 `src/circuit/reactFlowMapping.js`
- 新增 `src/circuit/reactFlowMapping.test.mjs`

需要导出：

```js
export function circuitModelToFlow(model, { includeRequiredEdges = false } = {}) {}
export function flowEdgesToCircuitEdges(edges) {}
export function circuitEdgeToFlowEdge(edge) {}
export function makeCircuitEdgeId(edge) {}
```

React Flow node 格式：

```js
{
  id: node.id,
  type: "circuitNode",
  position: node.position,
  data: {
    label: node.label,
    componentType: node.type,
    ports: node.ports
  }
}
```

React Flow edge 格式：

```js
{
  id: "input-a:out->xor-1:a",
  source: "input-a",
  sourceHandle: "out",
  target: "xor-1",
  targetHandle: "a",
  type: "smoothstep"
}
```

测试必须覆盖：

- 节点数量正确。
- 端口保存在 `data.ports`。
- `requiredEdges` 能转换成带 `sourceHandle` / `targetHandle` 的 React Flow edges。
- React Flow edges 能转换回平台 `from/to` 结构。
- edge id 稳定。

## 6. 判题任务

### Task 3：结构验证

文件：

- 新增 `src/circuit/circuitValidation.js`
- 新增 `src/circuit/circuitValidation.test.mjs`

需要导出：

```js
export function validateCircuitStructure(model, studentEdges) {}
export function canConnectPorts(model, connection) {}
```

`studentEdges` 使用平台结构：

```js
{
  from: { nodeId: "input-a", portId: "out" },
  to: { nodeId: "xor-1", portId: "a" }
}
```

必须检查：

- from 端口存在。
- to 端口存在。
- from 是 out。
- to 是 in。
- 同一输入端口不能被多条边驱动。
- 必要连接缺失。
- 多余连接存在。

返回结构建议：

```js
{
  passed: false,
  score: 67,
  missingEdges: [],
  extraEdges: [],
  invalidEdges: [],
  errors: [
    {
      type: "输入端未连接",
      message: "输入A没有进入异或门，和位无法判断。",
      nodeId: "xor-1",
      portId: "a"
    }
  ]
}
```

测试必须覆盖：

- 完整半加器通过。
- 缺少 `input-a -> xor-1.a` 时不通过。
- 输入连输入被拒绝。
- 同一输入端口重复驱动被拒绝。
- 多余连接扣分。

## 7. 仿真任务

### Task 4：组合逻辑小引擎

文件：

- 新增 `src/circuit/circuitSimulation.js`
- 新增 `src/circuit/circuitSimulation.test.mjs`

需要导出：

```js
export function simulateCircuit(model, studentEdges, inputs) {}
export function runCircuitTestCases(model, studentEdges) {}
```

信号值：

- `0`
- `1`
- `"unknown"`
- `"error"`

半加器元件行为：

- `input`：从 `inputs` 注入值。
- `xor`：`a ^ b`。
- `and`：`a & b`。
- `output`：读取输入端口。

测试必须覆盖：

- 半加器四组输入输出。
- 缺线时对应输出为 `unknown`。
- 非法结构不运行或返回 `error`。

注意：

- 第一阶段不支持反馈环。
- 如果拓扑排序失败，返回 `error` 和可读错误信息。

## 8. React Flow 画布 POC

### Task 5：实现 `CircuitNode`

文件：

- 新增 `src/components/CircuitNode.jsx`

使用 React Flow：

```js
import { Handle, Position } from "@xyflow/react";
```

要求：

- 输入端口显示在左侧。
- 输出端口显示在右侧。
- 每个端口使用稳定 handle id。
- 节点显示中文 label。
- 节点选中态由 React Flow 默认或 className 控制。

端口示例：

```jsx
<Handle
  id={port.id}
  type={port.direction === "out" ? "source" : "target"}
  position={port.direction === "out" ? Position.Right : Position.Left}
/>
```

### Task 6：实现 `CircuitFlowCanvas`

文件：

- 新增 `src/components/CircuitFlowCanvas.jsx`

使用 React Flow：

```js
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
```

最低功能：

- 渲染半加器模型节点。
- 支持拖动节点。
- 支持端口连线。
- 支持选中 edge 后删除。
- 支持“填入参考结构”。
- 支持“提交检测”并显示中文错误。

`onConnect` 中必须：

1. 转换成平台 connection。
2. 调用 `canConnectPorts`。
3. 合法才添加 edge。
4. 非法时设置 status message，不创建 edge。

不要在 `onConnect` 里写关卡特例。

## 9. 接入现有 App

### Task 7：增加半加器 POC 入口

文件：

- 修改 `src/App.jsx`

建议加一个最小切换：

- 只在 `selectedChallengeId === "half-adder"` 时显示 `CircuitFlowCanvas`。
- 其他关卡继续使用旧画布。

这样可以低风险验证 React Flow 方案。

接入要求：

- 不删除旧 `ChallengeScene`。
- 不影响首页、记录页、笔记、设置。
- 状态消息仍显示在现有 UI 中。
- 提交通过后仍调用现有 `recordAttempt`，或先只在 POC 内展示通过状态。

## 10. 样式任务

### Task 8：新增 React Flow 相关样式

文件：

- 修改 `src/styles.css`

建议 class：

```css
.circuit-flow-shell {}
.circuit-flow-canvas {}
.circuit-node {}
.circuit-node.selected {}
.circuit-port-label {}
.circuit-feedback {}
```

视觉要求：

- 不要做花哨 landing 风格。
- 画布仍是主视觉。
- 节点和端口要比装饰更清晰。
- 错误状态要直接关联到节点或端口。
- 移动端可以先只保证不崩，复杂编辑以桌面为主。

## 11. 浏览器验证

### Task 9：更新 smoke check

文件：

- 修改 `scripts/verify-ui.mjs`

最低验证流程：

1. 打开首页。
2. 进入半加器。
3. 确认 React Flow 画布存在。
4. 拖一条合法连接。
5. 删除一条连接。
6. 填入参考结构。
7. 提交检测通过。
8. 截图保存。

注意：

- React Flow handle 是小元素，Playwright 定位时建议使用自定义 `data-testid`。
- `CircuitNode` 中可以给端口增加 `data-testid={`port-${nodeId}-${port.id}`}`。

## 12. 全关卡迁移顺序

POC 通过后按这个顺序迁移：

1. `data-flow`
2. `half-adder`
3. `full-adder`
4. `mux`
5. `multi-adder`
6. `alu`

原因：

- `data-flow` 最简单，适合验证基础输入输出。
- `half-adder` 适合验证多端口和测试用例。
- `full-adder` 适合验证多级传播。
- `mux` 适合验证控制信号。
- `multi-adder` 和 `alu` 更复杂，放后面。

## 13. 提交前检查清单

每个任务完成后至少运行：

```powershell
npm.cmd test
```

涉及 UI 后运行：

```powershell
npm.cmd run build
```

涉及浏览器流程后运行：

```powershell
$env:QA_ARTIFACT_DIR="$env:TEMP\zcyl-training-qa"
node scripts/verify-ui.mjs
```

提交前检查：

```powershell
git status --short
```

不要提交：

- 临时截图目录，除非团队明确要求。
- `dist/`，除非当前仓库本来追踪构建产物。
- unrelated formatting churn。

## 14. 常见错误

错误：把中文显示名当作节点 id。

处理：id 必须稳定，例如 `xor-1`；中文放 `label`。

错误：判题直接读 React Flow edge。

处理：先转成平台 `CircuitEdge`，判题只认平台模型。

错误：一次替换所有关卡。

处理：只做半加器 POC，旧画布保留。

错误：在 React 组件里写半加器特例。

处理：半加器规则必须在模型、验证、仿真函数里。

错误：只检查结构，不跑测试用例。

处理：通过标准必须包含结构检查和多组输入输出检查。

## 15. 建议 PR 拆分

PR 1：安装 React Flow，新增结构化半加器模型和映射测试。

PR 2：新增结构验证和组合逻辑仿真测试。

PR 3：新增 `CircuitNode` 和 `CircuitFlowCanvas`，半加器 POC 可交互。

PR 4：接入现有 App 半加器入口，更新 smoke check。

PR 5：迁移剩余关卡，拆薄 `App.jsx`。

每个 PR 都应保持 `npm test` 通过。

## 16. 当前实现进度（2026-06-27）

已完成：

- 已安装 `@xyflow/react`。
- 已新增 `src/circuit` 结构化模型、React Flow 映射、结构验证、组合逻辑仿真。
- 六个运算器路线关卡均已有结构化模型：`data-flow`、`half-adder`、`full-adder`、`multi-adder`、`mux`、`alu`。
- `CircuitFlowCanvas` 已接入 App，当前六个关卡优先使用 React Flow 工作台。
- 旧手写画布仍保留为无结构化模型时的回退路径。
- `scripts/verify-ui.mjs` 已更新为六关 React Flow smoke，并验证通过。
- `npm.cmd test` 覆盖 47 项测试并通过。
- `node scripts/verify-ui.mjs` 已验证通过。
- `npm.cmd run build` 已验证通过。

剩余风险：

- 旧手写画布仍保留为回退代码，后续确认不再需要后可以删除。
- React Flow 引入后生产 bundle 超过 500 kB，后续可通过动态导入或 manualChunks 做拆包优化。
- 当前交付重点是学生端实训工作台；后端持久化、教师端和内容后台仍不在本批范围。
