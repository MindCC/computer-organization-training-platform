import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useCircuitViewport } from './useCircuitViewport.js';
import { CircuitBridgeEdge } from "./CircuitBridgeEdge.jsx";

const nodeTypes = { circuitNode: CircuitNode };
const edgeTypes = { bridge: CircuitBridgeEdge };

function inPort(id, label = id) {
  return { id, label, direction: "in", signal: "bit" };
}
function outPort(id, label = id) {
  return { id, label, direction: "out", signal: "bit" };
}

/** 全部可拖的逻辑门；端口 id 与 circuitSimulation 的 computeNode 严格对应。 */
export const GATE_DEFS = [
  { kind: "input", label: "输入开关", componentType: "input", icon: "⏻", desc: "点一下切换 0/1", ports: [outPort("out", "OUT")] },
  { kind: "output", label: "输出灯", componentType: "output", icon: "💡", desc: "显示计算结果", ports: [inPort("in", "IN")] },
  { kind: "and", label: "与门 AND", componentType: "and", icon: "&", desc: "两个都为 1 才出 1", ports: [inPort("a", "A"), inPort("b", "B"), outPort("c", "C")] },
  { kind: "nand", label: "与非门 NAND", componentType: "nand", icon: "&○", desc: "与结果取反；可构建其他门", ports: [inPort("a", "A"), inPort("b", "B"), outPort("out", "Y")] },
  { kind: "or", label: "或门 OR", componentType: "or", icon: "≥1", desc: "任一为 1 就出 1", ports: [inPort("a", "A"), inPort("b", "B"), outPort("out", "Y")] },
  { kind: "not", label: "非门 NOT", componentType: "not", icon: "1", desc: "把输入取反", ports: [inPort("in", "IN"), outPort("out", "OUT")] },
  { kind: "xor", label: "异或门 XOR", componentType: "xor", icon: "=1", desc: "不一样才出 1", ports: [inPort("a", "A"), inPort("b", "B"), outPort("s", "S")] },
  { kind: "buffer", label: "缓冲 BUF", componentType: "buffer", icon: "▷", desc: "原样传递信号", ports: [inPort("in", "IN"), outPort("out", "OUT")] },
];

let gateSequence = 0;
export function makeGateNode(def, position, idSuffix = null) {
  gateSequence += 1;
  const id = `${def.kind}-${idSuffix ?? gateSequence}`;
  return {
    id,
    type: "circuitNode",
    position,
    data: {
      nodeId: id,
      label: def.label,
      componentType: def.componentType,
      ports: def.ports.map((port) => ({ ...port })),
      ioIndex: def.ioIndex,
    },
  };
}

export function gateDefOf(kind) {
  return GATE_DEFS.find((item) => item.kind === kind) ?? null;
}

function signalTone(value) {
  if (value === 0) return "zero";
  if (value === 1) return "one";
  if (value === "error") return "error";
  return "unknown";
}

/**
 * 共享的逻辑门装配画布：调色板拖拽 + 连线校验 + 实时仿真 + 数值显示。
 * 沙盒与「自由拼装闯关」共用。通过 onCircuit 把当前仿真结果透传给父级，
 * 通过 footer render prop 让父级在画布下方放自己的操作区（如提交按钮）。
 */
function AssemblyInner({ paletteDefs, initialNodes, statusText, onCircuit, footer }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [inputValues, setInputValues] = useState({});
  const [status, setStatus] = useState(statusText);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const viewportRef=useCircuitViewport(fitView);

  const model = useMemo(() => ({
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.componentType,
      label: node.data.label,
      position: node.position,
      ports: node.data.ports,
      ioIndex: node.data.ioIndex,
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

  const toggleInput = useCallback((nodeId) => {
    setInputValues((current) => ({ ...current, [nodeId]: (current[nodeId] ?? 0) ? 0 : 1 }));
  }, []);

  const displayNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      onToggle:node.data.componentType==='input'?()=>toggleInput(node.id):undefined,
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
    setStatus("导线已连接。继续完成剩余端口。");
  }, [edges, model, setEdges]);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/x-sandbox-gate");
    const def = paletteDefs.find((item) => item.kind === kind);
    if (!def) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setNodes((current) => [...current, makeGateNode(def, position)]);
    setStatus(`已放入「${def.label}」：从输出端口拖线到别的输入端口。`);
  }, [paletteDefs, screenToFlowPosition, setNodes]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onNodeClick = useCallback((_event, node) => {
    if (node.data.componentType === "input") toggleInput(node.id);
  }, [toggleInput]);

  const clearAll = useCallback(() => {
    setNodes(initialNodes.map((node) => ({ ...node, data: { ...node.data, ports: node.data.ports.map((port) => ({ ...port })) } })));
    setEdges([]);
    setInputValues({});
    setStatus(statusText);
  }, [initialNodes, setNodes, setEdges, statusText]);

  // 把当前电路状态透传给父级（用于判分/提交），渲染提交后再通知，避免渲染期 setState。
  // 依赖收敛到电路相关值，父级因判分重渲染不会反复触发。
  useEffect(() => {
    if (onCircuit) onCircuit({ nodes, edges, model, circuitEdges, inputs, inputValues, simulation, toggleInput, clearAll, setStatus });
  }, [nodes, edges, model, circuitEdges, inputs, inputValues, simulation, toggleInput, clearAll, onCircuit]);

  return (
    <div className="sandbox">
      <aside className="sandbox-palette" aria-label="逻辑门调色板">
        <strong>逻辑门</strong>
        <small>拖到画布上</small>
        <div className="sandbox-palette-list">
          {paletteDefs.map((def) => (
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
        <div ref={viewportRef} className="sandbox-canvas" onDragOver={onDragOver} onDrop={onDrop}>
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
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodesChange={onNodesChange}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {footer ? footer({ simulation, inputValues, nodes, edges }) : null}
      </div>
    </div>
  );
}

export function GateAssemblyCanvas(props) {
  return (
    <ReactFlowProvider>
      <AssemblyInner {...props} />
    </ReactFlowProvider>
  );
}
