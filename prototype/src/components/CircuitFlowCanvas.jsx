import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addEdge,
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { canConnectPorts, validateCircuitStructure } from "../circuit/circuitValidation.js";
import { runCircuitTestCases } from "../circuit/circuitSimulation.js";
import {
  circuitEdgeToFlowEdge,
  circuitModelToFlow,
  flowConnectionToCircuitEdge,
  flowEdgesToCircuitEdges,
} from "../circuit/reactFlowMapping.js";
import { CircuitNode } from "./CircuitNode.jsx";

const nodeTypes = { circuitNode: CircuitNode };

function resultSummary(structure, tests) {
  if (structure.passed && tests.passed) return `本关通过：结构正确，${tests.cases.length} 组测试全部通过。`;
  if (!structure.passed) return structure.errors[0]?.message ?? "结构仍有问题，请检查端口和导线。";
  return "结构已完成，但至少一组测试用例输出不正确。";
}

export function CircuitFlowCanvas({ model, onResult }) {
  const initialFlow = useMemo(() => circuitModelToFlow(model), [model]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [status, setStatus] = useState(() => `拖动两个端口即可连接，系统会自动识别输出端和输入端，完成${model.title}结构。`);
  const [report, setReport] = useState(null);

  useEffect(() => {
    const nextFlow = circuitModelToFlow(model);
    setNodes(nextFlow.nodes);
    setEdges(nextFlow.edges);
    setSelectedEdgeId(null);
    setReport(null);
    setStatus(`拖动两个端口即可连接，系统会自动识别输出端和输入端，完成${model.title}结构。`);
  }, [model, setEdges, setNodes]);

  const onConnect = useCallback((connection) => {
    const circuitEdge = flowConnectionToCircuitEdge(connection, model);
    const existingEdges = flowEdgesToCircuitEdges(edges);
    const validation = canConnectPorts(model, circuitEdge, existingEdges);

    if (!validation.ok) {
      setStatus(validation.message);
      return;
    }

    const edge = circuitEdgeToFlowEdge(circuitEdge);
    setEdges((currentEdges) => addEdge({ ...edge, animated: false }, currentEdges));
    setReport(null);
    setStatus("导线已连接。继续完成剩余端口，或提交检测。");
  }, [edges, model, setEdges]);

  const fillReference = useCallback(() => {
    setEdges(model.requiredEdges.map((edge) => circuitEdgeToFlowEdge(edge)));
    setReport(null);
    setStatus(`已填入${model.title}参考结构，可以提交检测或继续观察端口。`);
  }, [model, setEdges]);

  const reset = useCallback(() => {
    setEdges([]);
    setSelectedEdgeId(null);
    setReport(null);
    setStatus(`已重置${model.title} React Flow 画布。`);
  }, [model, setEdges]);

  const removeSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    setReport(null);
    setStatus("已删除选中的导线。");
  }, [selectedEdgeId, setEdges]);

  const submit = useCallback(() => {
    const studentEdges = flowEdgesToCircuitEdges(edges);
    const structure = validateCircuitStructure(model, studentEdges);
    const tests = runCircuitTestCases(model, studentEdges);
    const nextReport = {
      passed: structure.passed && tests.passed,
      score: structure.passed && tests.passed ? 100 : structure.score,
      structure,
      tests,
    };

    setReport(nextReport);
    setStatus(resultSummary(structure, tests));
    onResult?.(nextReport);
  }, [edges, model, onResult]);

  return (
    <div className="circuit-flow-workbench">
      <div className="circuit-flow-toolbar">
        <div>
          <span className="eyebrow">React Flow 工作台</span>
          <h3>{model.title}</h3>
          <p>{model.goal}</p>
        </div>
        <div className="circuit-flow-actions">
          <button className="ghost-button" onClick={fillReference} type="button">填入参考结构</button>
          <button className="ghost-button" disabled={!selectedEdgeId} onClick={removeSelectedEdge} type="button">删除选中导线</button>
          <button className="ghost-button" onClick={reset} type="button">重置</button>
          <button className="primary-button" onClick={submit} type="button">提交检测</button>
        </div>
      </div>

      <div className="circuit-flow-status" aria-live="polite">{status}</div>

      <div className="circuit-flow-canvas" data-testid="react-flow-circuit-canvas">
        <ReactFlow
          connectionMode={ConnectionMode.Loose}
          edges={edges}
          fitView
          nodes={nodes}
          nodeTypes={nodeTypes}
          onConnect={onConnect}
          onEdgesChange={onEdgesChange}
          onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
          onNodesChange={onNodesChange}
        >
          <Background gap={18} />
          <Controls />
        </ReactFlow>
      </div>

      {report ? (
        <div className={`circuit-flow-report ${report.passed ? "passed" : "failed"}`}>
          <strong>{report.passed ? "本关通过" : "仍需修正"}</strong>
          <span>结构得分：{report.structure.score} · 测试用例：{report.tests.cases.filter((item) => item.passed).length}/{report.tests.cases.length}</span>
          {report.structure.errors.length > 0 ? <small>{report.structure.errors[0].message}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
