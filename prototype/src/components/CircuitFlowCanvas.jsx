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

import { simulateCircuit, runCircuitTestCases } from "../circuit/circuitSimulation.js";
import { canConnectPorts, validateCircuitStructure } from "../circuit/circuitValidation.js";
import {
  circuitEdgeToFlowEdge,
  circuitModelToFlow,
  flowConnectionToCircuitEdge,
  flowEdgesToCircuitEdges,
} from "../circuit/reactFlowMapping.js";
import { CircuitNode } from "./CircuitNode.jsx";

const nodeTypes = { circuitNode: CircuitNode };

const copy = {
  actionDelete: "\u5220\u9664\u9009\u4e2d\u5bfc\u7ebf",
  actionFill: "\u586b\u5165\u53c2\u8003\u7ed3\u6784",
  actionReset: "\u91cd\u7f6e",
  actionSubmit: "\u63d0\u4ea4\u68c0\u6d4b",
  actual: "\u5b9e\u9645",
  allCasesPassed: "\u7ec4\u6d4b\u8bd5\u5168\u90e8\u901a\u8fc7",
  casePanel: "\u7528\u4f8b\u5c55\u793a",
  dataFlow: "\u5b9e\u65f6\u6570\u636e\u6d41\u52a8\u68c0\u6d4b",
  edgeConnected: "\u5bfc\u7ebf\u5df2\u8fde\u63a5\u3002\u7ee7\u7eed\u5b8c\u6210\u5269\u4f59\u7aef\u53e3\uff0c\u6216\u63d0\u4ea4\u68c0\u6d4b\u3002",
  edgeDeleted: "\u5df2\u5220\u9664\u9009\u4e2d\u7684\u5bfc\u7ebf\u3002",
  expected: "\u671f\u671b",
  input: "\u8f93\u5165",
  noSignal: "\u6682\u65e0\u5df2\u8fde\u63a5\u5bfc\u7ebf",
  output: "\u8f93\u51fa",
  pending: "\u5f85\u63d0\u4ea4",
  score: "\u7ed3\u6784\u5f97\u5206",
  selectedCase: "\u5f53\u524d\u7528\u4f8b",
  statusFailed: "\u672a\u901a\u8fc7",
  statusPassed: "\u901a\u8fc7",
  testCases: "\u6d4b\u8bd5\u7528\u4f8b",
  title: "React Flow \u5de5\u4f5c\u53f0",
  unknown: "\u672a\u77e5",
};

function resultSummary(structure, tests) {
  if (structure.passed && tests.passed) return `\u672c\u5173\u901a\u8fc7\uff1a\u7ed3\u6784\u6b63\u786e\uff0c${tests.cases.length} ${copy.allCasesPassed}\u3002`;
  if (!structure.passed) return structure.errors[0]?.message ?? "\u7ed3\u6784\u4ecd\u6709\u95ee\u9898\uff0c\u8bf7\u68c0\u67e5\u7aef\u53e3\u548c\u5bfc\u7ebf\u3002";
  return "\u7ed3\u6784\u5df2\u5b8c\u6210\uff0c\u4f46\u81f3\u5c11\u4e00\u7ec4\u6d4b\u8bd5\u7528\u4f8b\u8f93\u51fa\u4e0d\u6b63\u786e\u3002";
}

function formatSignal(value) {
  if (value === 0 || value === 1) return String(value);
  if (value === "error") return "ERR";
  return "?";
}

function signalTone(value) {
  if (value === 0) return "zero";
  if (value === 1) return "one";
  if (value === "error") return "error";
  return "unknown";
}

function portValueKey(nodeId, portId) {
  return `${nodeId}.${portId}`;
}

function portLabel(model, key) {
  const [nodeId, portId] = String(key).split(".");
  const node = model.nodes.find((item) => item.id === nodeId);
  const port = node?.ports.find((item) => item.id === portId);
  return `${node?.label ?? nodeId}.${port?.label ?? portId}`;
}

function valuesMatch(actual, expected) {
  return actual === expected;
}

export function CircuitFlowCanvas({ model, onResult }) {
  const initialFlow = useMemo(() => circuitModelToFlow(model), [model]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);
  const [status, setStatus] = useState(() => `\u62d6\u52a8\u4e24\u4e2a\u7aef\u53e3\u5373\u53ef\u8fde\u63a5\uff0c\u7cfb\u7edf\u4f1a\u81ea\u52a8\u8bc6\u522b\u8f93\u51fa\u7aef\u548c\u8f93\u5165\u7aef\uff0c\u5b8c\u6210${model.title}\u7ed3\u6784\u3002`);
  const [report, setReport] = useState(null);

  const studentEdges = useMemo(() => flowEdgesToCircuitEdges(edges), [edges]);
  const selectedCase = model.testCases[Math.min(selectedCaseIndex, model.testCases.length - 1)] ?? model.testCases[0] ?? null;
  const liveSimulation = useMemo(
    () => simulateCircuit(model, studentEdges, selectedCase?.inputs ?? {}),
    [model, selectedCase, studentEdges],
  );
  const liveExpectedEntries = Object.entries(selectedCase?.expected ?? {});
  const liveCasePassed = liveExpectedEntries.length > 0
    && liveExpectedEntries.every(([key, expected]) => valuesMatch(liveSimulation.values?.[key], expected));

  const displayEdges = useMemo(() => edges.map((edge) => {
    const value = liveSimulation.values?.[portValueKey(edge.source, edge.sourceHandle)];
    const tone = signalTone(value);
    return {
      ...edge,
      animated: value === 1,
      className: `signal-${tone}`,
      label: formatSignal(value),
      markerEnd: undefined,
    };
  }), [edges, liveSimulation.values]);

  useEffect(() => {
    const nextFlow = circuitModelToFlow(model);
    setNodes(nextFlow.nodes);
    setEdges(nextFlow.edges);
    setSelectedEdgeId(null);
    setSelectedCaseIndex(0);
    setReport(null);
    setStatus(`\u62d6\u52a8\u4e24\u4e2a\u7aef\u53e3\u5373\u53ef\u8fde\u63a5\uff0c\u7cfb\u7edf\u4f1a\u81ea\u52a8\u8bc6\u522b\u8f93\u51fa\u7aef\u548c\u8f93\u5165\u7aef\uff0c\u5b8c\u6210${model.title}\u7ed3\u6784\u3002`);
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
    setStatus(copy.edgeConnected);
  }, [edges, model, setEdges]);

  const fillReference = useCallback(() => {
    setEdges(model.requiredEdges.map((edge) => circuitEdgeToFlowEdge(edge)));
    setReport(null);
    setStatus(`\u5df2\u586b\u5165${model.title}\u53c2\u8003\u7ed3\u6784\uff0c\u53ef\u4ee5\u63d0\u4ea4\u68c0\u6d4b\u6216\u7ee7\u7eed\u89c2\u5bdf\u7aef\u53e3\u3002`);
  }, [model, setEdges]);

  const reset = useCallback(() => {
    setEdges([]);
    setSelectedEdgeId(null);
    setReport(null);
    setStatus(`\u5df2\u91cd\u7f6e${model.title} React Flow \u753b\u5e03\u3002`);
  }, [model, setEdges]);

  const removeSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    setReport(null);
    setStatus(copy.edgeDeleted);
  }, [selectedEdgeId, setEdges]);

  const submit = useCallback(() => {
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
  }, [model, onResult, studentEdges]);

  return (
    <div className="circuit-flow-workbench">
      <div className="circuit-flow-toolbar">
        <div>
          <span className="eyebrow">{copy.title}</span>
          <h3>{model.title}</h3>
          <p>{model.goal}</p>
        </div>
        <div className="circuit-flow-actions">
          <button className="ghost-button" onClick={fillReference} type="button">{copy.actionFill}</button>
          <button className="ghost-button" disabled={!selectedEdgeId} onClick={removeSelectedEdge} type="button">{copy.actionDelete}</button>
          <button className="ghost-button" onClick={reset} type="button">{copy.actionReset}</button>
          <button className="primary-button" onClick={submit} type="button">{copy.actionSubmit}</button>
        </div>
      </div>

      <div className="circuit-flow-status" aria-live="polite">{status}</div>

      <div className="circuit-flow-canvas-grid">
        <div className="circuit-flow-canvas" data-testid="react-flow-circuit-canvas">
          <ReactFlow
            connectionMode={ConnectionMode.Loose}
            edges={displayEdges}
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

        <aside className="circuit-flow-live-panel">
          <section className="circuit-flow-case-panel">
            <div className="circuit-flow-panel-heading">
              <strong>{copy.casePanel}</strong>
              <span>{model.testCases.length} {copy.testCases}</span>
            </div>
            <div className="circuit-flow-case-tabs" role="tablist" aria-label={copy.testCases}>
              {model.testCases.map((testCase, index) => (
                <button
                  className={index === selectedCaseIndex ? "active" : ""}
                  key={testCase.name}
                  onClick={() => setSelectedCaseIndex(index)}
                  type="button"
                >
                  {index + 1}
                </button>
              ))}
            </div>
            {selectedCase ? (
              <div className={`circuit-flow-case-detail ${liveCasePassed ? "passed" : "failed"}`}>
                <strong>{selectedCase.name}</strong>
                <span>{liveCasePassed ? copy.statusPassed : copy.statusFailed}</span>
              </div>
            ) : null}
            <SignalList label={copy.input} model={model} values={selectedCase?.inputs ?? {}} />
            <CompareList
              actual={liveSimulation.values ?? {}}
              expected={selectedCase?.expected ?? {}}
              model={model}
            />
          </section>

          <section className="circuit-flow-signal-panel">
            <div className="circuit-flow-panel-heading">
              <strong>{copy.dataFlow}</strong>
              <span>{copy.selectedCase} {selectedCaseIndex + 1}</span>
            </div>
            {edges.length > 0 ? (
              <div className="circuit-flow-edge-signals">
                {edges.map((edge) => {
                  const value = liveSimulation.values?.[portValueKey(edge.source, edge.sourceHandle)];
                  return (
                    <div className={`circuit-flow-edge-signal ${signalTone(value)}`} key={edge.id}>
                      <strong>{portLabel(model, portValueKey(edge.source, edge.sourceHandle))}</strong>
                      <span>{formatSignal(value)}</span>
                      <small>{portLabel(model, portValueKey(edge.target, edge.targetHandle))}</small>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="circuit-flow-empty">{copy.noSignal}</p>
            )}
          </section>
        </aside>
      </div>

      {report ? (
        <div className={`circuit-flow-report ${report.passed ? "passed" : "failed"}`}>
          <strong>{report.passed ? "\u672c\u5173\u901a\u8fc7" : "\u4ecd\u9700\u4fee\u6b63"}</strong>
          <span>{copy.score}\uff1a{report.structure.score} · {copy.testCases}\uff1a{report.tests.cases.filter((item) => item.passed).length}/{report.tests.cases.length}</span>
          {report.structure.errors.length > 0 ? <small>{report.structure.errors[0].message}</small> : null}
        </div>
      ) : null}
    </div>
  );
}

function SignalList({ label, model, values }) {
  return (
    <div className="circuit-flow-value-list">
      <span>{label}</span>
      {Object.entries(values).map(([key, value]) => (
        <div className="circuit-flow-value-row" key={key}>
          <strong>{portLabel(model, key)}</strong>
          <em>{formatSignal(value)}</em>
        </div>
      ))}
    </div>
  );
}

function CompareList({ actual, expected, model }) {
  return (
    <div className="circuit-flow-value-list">
      <span>{copy.output}</span>
      {Object.entries(expected).map(([key, value]) => {
        const actualValue = actual[key];
        const matched = valuesMatch(actualValue, value);
        return (
          <div className={`circuit-flow-value-row ${matched ? "matched" : "mismatch"}`} key={key}>
            <strong>{portLabel(model, key)}</strong>
            <em>{copy.expected} {formatSignal(value)} / {copy.actual} {formatSignal(actualValue)}</em>
          </div>
        );
      })}
    </div>
  );
}
