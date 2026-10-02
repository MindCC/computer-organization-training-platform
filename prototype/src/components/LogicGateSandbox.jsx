import { useCallback, useMemo, useState } from "react";
import {
  addEdge,
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { simulateCircuit } from "../circuit/circuitSimulation.js";
import { canConnectPorts } from "../circuit/circuitValidation.js";
import {
  circuitEdgeToFlowEdge,
  flowConnectionToCircuitEdge,
  flowEdgesToCircuitEdges,
} from "../circuit/reactFlowMapping.js";
import { CircuitNode } from "./CircuitNode.jsx";
import { CircuitBridgeEdge } from "./CircuitBridgeEdge.jsx";

const nodeTypes = { circuitNode: CircuitNode };
const edgeTypes = { bridge: CircuitBridgeEdge };

function inPort(id, label = id) {
  return { id, label, direction: "in", signal: "bit" };
}
function outPort(id, label = id) {
  return { id, label, direction: "out", signal: "bit" };
}

/** 调色板里的逻辑门定义：端口 id 必须与 circuitSimulation 的 computeNode 一致。 */
const GATE_DEFS = [
  { kind: "input", label: "输入开关", componentType: "input", icon: "⏻", desc: "点一下切换 0/1", ports: [outPort("out", "OUT")] },
  { kind: "output", label: "输出灯", componentType: "output", icon: "💡", desc: "显示计算结果", ports: [inPort("in", "IN")] },
  { kind: "and", label: "与门 AND", componentType: "and", icon: "&", desc: "两个都为 1 才出 1", ports: [inPort("a", "A"), inPort("b", "B"), outPort("c", "C")] },
  { kind: "or", label: "或门 OR", componentType: "or", icon: "≥1", desc: "任一为 1 就出 1", ports: [inPort("a", "A"), inPort("b", "B"), outPort("out", "Y")] },
  { kind: "not", label: "非门 NOT", componentType: "not", icon: "1", desc: "把输入取反", ports: [inPort("in", "IN"), outPort("out", "OUT")] },
  { kind: "xor", label: "异或门 XOR", componentType: "xor", icon: "=1", desc: "不一样才出 1", ports: [inPort("a", "A"), inPort("b", "B"), outPort("s", "S")] },
  { kind: "buffer", label: "缓冲 BUF", componentType: "buffer", icon: "▷", desc: "原样传递信号", ports: [inPort("in", "IN"), outPort("out", "OUT")] },
];

let gateSequence = 0;
function makeGateNode(def, position) {
  gateSequence += 1;
  const id = `${def.kind}-${gateSequence}`;
  return {
    id,
    type: "circuitNode",
    position,
    data: {
      nodeId: id,
      label: def.label,
      componentType: def.componentType,
      ports: def.ports.map((port) => ({ ...port })),
    },
  };
}

function starterNodes() {
  return [
    makeGateNode(GATE_DEFS.find((def) => def.kind === "input"), { x: 40, y: 60 }),
    makeGateNode(GATE_DEFS.find((def) => def.kind === "input"), { x: 40, y: 220 }),
    makeGateNode(GATE_DEFS.find((def) => def.kind === "and"), { x: 340, y: 130 }),
    makeGateNode(GATE_DEFS.find((def) => def.kind === "output"), { x: 640, y: 130 }),
  ];
}

function signalTone(value) {
  if (value === 0) return "zero";
  if (value === 1) return "one";
  if (value === "error") return "error";
  return "unknown";
}

function SandboxInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState(starterNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [inputValues, setInputValues] = useState({});
  const [status, setStatus] = useState("把左边的逻辑门拖进画布，连好线就能看到实时结果。");
  const { screenToFlowPosition } = useReactFlow();

  /** 把当前画布还原成仿真模型（节点 + 端口） */
  const model = useMemo(() => ({
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.componentType,
      label: node.data.label,
      position: node.position,
      ports: node.data.ports,
    })),
    requiredEdges: [],
    testCases: [],
  }), [nodes]);

  const circuitEdges = useMemo(() => flowEdgesToCircuitEdges(edges), [edges]);

  const inputs = useMemo(() => Object.fromEntries(
    nodes
      .filter((node) => node.data.componentType === "input")
      .map((node) => [`${node.id}.out`, inputValues[node.id] ?? 0]),
  ), [nodes, inputValues]);

  const simulation = useMemo(
    () => (nodes.length === 0 ? { values: {}, status: "ok", errors: [] } : simulateCircuit(model, circuitEdges, inputs)),
    [model, circuitEdges, inputs, nodes.length],
  );

  /** 给节点挂上当前端口值，CircuitNode 据此显示数值 */
  const displayNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      portValues: Object.fromEntries(
        node.data.ports.map((port) => [port.id, simulation.values?.[`${node.id}.${port.id}`]]),
      ),
    },
  })), [nodes, simulation.values]);

  const displayEdges = useMemo(() => edges.map((edge) => {
    const value = simulation.values?.[`${edge.source}.${edge.sourceHandle}`];
    const tone = signalTone(value);
    return {
      ...edge,
      type: "bridge",
      animated: value === 1,
      className: `signal-${tone}`,
      label: value === 0 || value === 1 ? String(value) : "",
      data: { ...(edge.data ?? {}), bridgeMarkers: [] },
    };
  }), [edges, simulation.values]);

  const onConnect = useCallback((connection) => {
    const circuitEdge = flowConnectionToCircuitEdge(connection, model);
    const validation = canConnectPorts(model, circuitEdge, flowEdgesToCircuitEdges(edges));
    if (!validation.ok) {
      setStatus(validation.message);
      return;
    }
    setEdges((current) => addEdge({ ...circuitEdgeToFlowEdge(circuitEdge, { type: "bridge" }), animated: false }, current));
    setStatus("导线已连接。继续完成剩余端口，或切换输入开关看结果。");
  }, [edges, model, setEdges]);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/x-sandbox-gate");
    const def = GATE_DEFS.find((item) => item.kind === kind);
    if (!def) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setNodes((current) => [...current, makeGateNode(def, position)]);
    setStatus(`已放入「${def.label}」：从输出端口拖线到别的输入端口。`);
  }, [screenToFlowPosition, setNodes]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onNodeClick = useCallback((_event, node) => {
    if (node.data.componentType !== "input") return;
    setInputValues((current) => ({ ...current, [node.id]: (current[node.id] ?? 0) ? 0 : 1 }));
  }, []);

  const clearAll = useCallback(() => {
    setNodes(starterNodes());
    setEdges([]);
    setInputValues({});
    setStatus("已重置为一个与门示例：A · B → 输出。自己接着拖别的门试试。");
  }, [setNodes, setEdges]);

  return (
    <div className="sandbox">
      <aside className="sandbox-palette" aria-label="逻辑门调色板">
        <strong>逻辑门</strong>
        <small>拖到画布上</small>
        <div className="sandbox-palette-list">
          {GATE_DEFS.map((def) => (
            <div
              className="sandbox-gate"
              data-kind={def.kind}
              draggable
              key={def.kind}
              onDragStart={(event) => {
                event.dataTransfer.setData("application/x-sandbox-gate", def.kind);
                event.dataTransfer.effectAllowed = "move";
              }}
              title={def.desc}
            >
              <span className="sandbox-gate-icon">{def.icon}</span>
              <span className="sandbox-gate-label">{def.label}</span>
            </div>
          ))}
        </div>
        <button className="ghost-button" onClick={clearAll} type="button">↺ 清空重来</button>
        <div className="sandbox-help">
          <p>① 把门拖到画布上</p>
          <p>② 从<b>输出端口</b>拖线到<b>输入端口</b></p>
          <p>③ 点「输入开关」切换 0/1</p>
          <p>④ 选中后按 Delete 删除</p>
        </div>
      </aside>

      <div className="sandbox-stage">
        <div className="sandbox-status" role="status">{status}</div>
        <div className="sandbox-canvas">
          <ReactFlow
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={["Backspace", "Delete"]}
            edgeTypes={edgeTypes}
            edges={displayEdges}
            fitView
            maxZoom={2.4}
            minZoom={0.4}
            nodeTypes={nodeTypes}
            nodes={displayNodes}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodesChange={onNodesChange}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export function LogicGateSandbox() {
  return (
    <ReactFlowProvider>
      <SandboxInner />
    </ReactFlowProvider>
  );
}
