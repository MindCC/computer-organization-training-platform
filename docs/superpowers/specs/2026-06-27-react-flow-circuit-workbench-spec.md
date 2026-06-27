# React Flow 电路工作台迁移规格

日期：2026-06-27

## 1. 背景

当前原型已经实现了元件拖放、端点拖线、连线预览、导线删除、放置判题、结构判题和中文反馈。但这些能力主要由 `src/App.jsx`、`src/labWiring.js`、`src/labPlacement.js` 手写完成。

现状问题：

- 元件和引线交互仍然不够稳定，端口命中、导线选择、缩放和平移都需要继续补大量基础能力。
- `src/App.jsx` 已超过 2000 行，实验台、课程页、记录页、设置页、画布交互混在一起。
- 判题仍依赖 `requiredConnections` 字符串集合，适合固定关卡，不适合扩展到更复杂的运算器、ALU 或后续 CPU 结构。
- 仿真是按 `challengeId` 写死的教学演示，不是根据学生搭建的图结构执行信号传播。

结论：画布层不要继续手写，优先引入成熟的 React 节点/连线编辑器，把自研精力留给教学模型、判题和仿真。

## 2. 选型结论

首选：React Flow，当前包名为 `@xyflow/react`。

原因：

- 与当前 React/Vite 技术栈匹配。
- 原生支持节点拖动、连线、删除、选择、缩放、平移、视图适配。
- 支持自定义节点和多个端口 handle，可用 `sourceHandle` / `targetHandle` 精确描述连线落到哪个端口。
- 可控程度足够高，能继续保留当前中文教学反馈、关卡进度和判题流程。
- MIT 许可，生态成熟。

参考资料：

- React Flow 官网：https://reactflow.dev/
- Handles 文档：https://reactflow.dev/learn/customization/handles
- GitHub：https://github.com/xyflow/xyflow

辅助参考：

- DigitalJS：https://github.com/tilk/digitaljs
  - 用于参考电路 JSON 模型和小型数字逻辑仿真设计。
  - 不建议直接接管 UI。
- CircuitVerse：https://github.com/CircuitVerse/CircuitVerse
  - 用于参考产品体验和教学闭环。
  - 不建议整体嵌入当前 React 原型。
- Logisim Evolution：https://github.com/logisim-evolution/logisim-evolution
  - 用于参考电路概念。
  - Java 桌面应用，GPL-3.0，不适合作为当前 Web 原型依赖。

## 3. 产品目标

把当前实验台升级为更接近 Turing Complete 风格的可操作工作台：

- 学生可以稳定拖动元件。
- 学生可以从明确端口拉线到另一个明确端口。
- 合法/非法目标要在拖线过程中即时反馈。
- 连线要能选中、删除、重连。
- 画布支持缩放、平移、适配视图。
- 关卡仍然是教学任务，不做完全自由沙盒。
- 先服务运算器路线，不提前扩展完整 CPU。

## 4. 非目标

本阶段不做：

- 完整通用 EDA 工具。
- 任意自由电路仿真沙盒。
- 完整 CPU 取指、译码、执行流程。
- 复杂时序仿真、毛刺、电平延迟、总线竞争。
- 后端用户系统、教师端、班级管理。
- AI 出题或大规模个性化学习系统。

## 5. 目标架构

迁移后核心模块建议如下：

```text
src/
  circuit/
    challengeCircuitModel.js
    circuitValidation.js
    circuitSimulation.js
    reactFlowMapping.js
  components/
    LabWorkbench.jsx
    CircuitFlowCanvas.jsx
    CircuitNode.jsx
    ComponentPalette.jsx
    InspectorPanel.jsx
    SimulationControls.jsx
  platformLogic.js
  App.jsx
```

职责边界：

- `challengeCircuitModel.js`
  - 定义结构化关卡模型。
  - 从现有 `CHALLENGES` 迁移出节点、端口、要求连接、测试用例、提示规则。
- `reactFlowMapping.js`
  - 在平台电路模型和 React Flow `nodes/edges` 之间转换。
  - 处理 `sourceHandle`、`targetHandle`、节点位置、端口方向。
- `CircuitFlowCanvas.jsx`
  - 只负责画布交互。
  - 不直接写判题规则。
- `circuitValidation.js`
  - 检查结构合法性、缺失连接、多余连接、端口方向、输入端重复驱动。
- `circuitSimulation.js`
  - 第一阶段只做组合逻辑小引擎。
  - 支持 `input`、`output`、`and`、`or`、`xor`、`not`、`mux`、`halfAdder`、`fullAdder` 等教学元件。
- `LabWorkbench.jsx`
  - 组织工具箱、画布、反馈、inspector、运行控制。

## 6. 结构化关卡模型

新模型示例：

```js
{
  id: "half-adder",
  title: "半加器",
  goal: "连接异或门和与门，实现 1 位二进制加法。",
  nodes: [
    {
      id: "input-a",
      type: "input",
      label: "输入A",
      position: { x: 80, y: 120 },
      ports: [
        { id: "out", label: "A", direction: "out", signal: "bit" }
      ]
    },
    {
      id: "xor-1",
      type: "xor",
      label: "异或门",
      position: { x: 320, y: 100 },
      ports: [
        { id: "a", label: "A", direction: "in", signal: "bit" },
        { id: "b", label: "B", direction: "in", signal: "bit" },
        { id: "s", label: "S", direction: "out", signal: "bit" }
      ]
    }
  ],
  requiredEdges: [
    {
      id: "a-to-xor",
      from: { nodeId: "input-a", portId: "out" },
      to: { nodeId: "xor-1", portId: "a" },
      hint: {
        type: "输入端未连接",
        message: "输入A没有进入异或门，和位无法判断。"
      }
    }
  ],
  testCases: [
    {
      name: "0 + 0",
      inputs: { "input-a.out": 0, "input-b.out": 0 },
      expected: { "sum.in": 0, "carry.in": 0 }
    },
    {
      name: "1 + 1",
      inputs: { "input-a.out": 1, "input-b.out": 1 },
      expected: { "sum.in": 0, "carry.in": 1 }
    }
  ]
}
```

约束：

- 节点 id 和端口 id 必须稳定，不能用中文显示名当唯一标识。
- 中文只用于 `label`、`message`、`summary`。
- 连接必须落到具体端口，不能只落到组件名。
- 一个输入端口默认只能被一条边驱动。
- 一个输出端口可以驱动多个输入端口。
- 判题不得依赖 React Flow 内部对象，必须依赖平台自己的结构化模型。

## 7. React Flow 映射规则

React Flow node：

```js
{
  id: "xor-1",
  type: "circuitNode",
  position: { x: 320, y: 100 },
  data: {
    label: "异或门",
    componentType: "xor",
    ports: [...]
  }
}
```

React Flow edge：

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

映射要求：

- 平台模型到 React Flow：用于初始化关卡、填入参考结构。
- React Flow 到平台模型：用于提交检测、运行仿真、保存学习记录。
- 不允许把判题写死在 React Flow 事件里。
- `onConnect` 只负责收集连接意图并调用验证函数。

## 8. 交互规则

必须支持：

- 从输出端口连到输入端口。
- 从输入端口拖出时给出方向错误提示。
- 拖到非法端口时禁止创建边，并显示中文提示。
- 重复连接同一输入端口时提示“该输入端已被驱动”。
- 选中导线后可删除。
- 选中节点后 inspector 展示元件说明、端口状态、相关提示。
- 运行演示时，高亮当前活跃边和端口。
- 提交检测后，在相关节点或边附近显示错误标记。

应该支持：

- 画布缩放和平移。
- 一键适配当前关卡。
- 填入参考结构。
- 重置当前关卡。

暂不要求：

- 手动画导线折点。
- 自动布线。
- 总线束。
- 复杂嵌套子电路编辑。

## 9. 判题规则

判题分三层：

1. 结构检查
   - 必要节点是否存在。
   - 必要端口是否连接。
   - 是否存在多余连接。
   - 方向是否正确。
   - 输入端是否重复驱动。

2. 结果检查
   - 使用 `testCases` 运行多组输入。
   - 对比指定输出端口。
   - 不能只靠单一输入状态判定通过。

3. 教学反馈
   - 缺失连接返回具体端口位置。
   - 多余连接返回对应边。
   - 方向错误返回起点和终点。
   - 多次失败后给更明确提示，但不直接公布完整答案。

## 10. 小型仿真引擎范围

第一阶段只支持组合逻辑。

信号值：

- `0`
- `1`
- `unknown`
- `error`

元件：

- `input`
- `output`
- `and`
- `or`
- `xor`
- `not`
- `mux2`
- `halfAdder`
- `fullAdder`

执行策略：

- 从输入节点注入信号。
- 按拓扑顺序传播。
- 遇到环路或无法排序时返回 `error`，并提示当前阶段不支持反馈环。
- 每次仿真输出：
  - 每个端口的信号值。
  - 每条边的信号值。
  - 可用于 UI 高亮的 step 列表。

## 11. 兼容与迁移

迁移原则：

- 不一次性删除旧实验台。
- 先用半加器做 `CircuitFlowCanvas` POC。
- POC 通过后再迁移数据流、全加器、多位加法器、多路选择器、简化 ALU。
- 旧的 `gradeConnections` 可以在第一阶段保留，但新关卡应逐步切到 `circuitValidation`。
- 当前学习记录、笔记、设置、首页不在本次重构范围。

## 12. 验收标准

半加器 POC 通过标准：

- 可以从工具箱放置或显示半加器所需节点。
- 每个节点展示清晰端口。
- 可以从 `输入A.out` 连到 `异或门.a`。
- 不能从输入端连到输入端。
- 不能让同一输入端被重复驱动。
- 删除导线后判题能发现缺失连接。
- 填入参考结构后提交通过。
- 至少覆盖 `00`、`01`、`10`、`11` 四组测试用例。
- `npm test` 通过。
- `npm run build` 通过。
- 浏览器 smoke check 能完成至少一次拖线、删除、提交检测。

整批迁移通过标准：

- 六个运算器路线关卡都使用 React Flow 画布。
- 不再依赖 `App.jsx` 内部手写端点拖线逻辑完成主流程。
- 新增关卡不需要修改 `App.jsx` 主结构。
- 判题和仿真均由结构化模型驱动。
- 旧的可用学习记录、笔记、设置功能不回退。

## 13. 风险

- React Flow 引入后样式需要重新适配当前中文工作台视觉。
- 当前自定义画布的坐标是百分比，React Flow 使用像素坐标，需要做映射。
- 旧关卡使用中文字符串当连接 id，迁移时需要建立稳定 id。
- 如果直接一次性替换所有关卡，风险过高。

控制方式：

- 先做半加器 POC。
- 通过 feature flag 或局部入口保留旧画布。
- 所有模型转换和判题先写纯函数测试。
- UI 集成后再写 Playwright smoke check。
