import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { simulateCircuit, runAllCircuitTests } from "../circuit/circuitSimulation.js";
import { canConnectPorts, validateCircuitStructure } from "../circuit/circuitValidation.js";
import {
  circuitEdgeToFlowEdge,
  circuitModelToFlow,
  flowConnectionToCircuitEdge,
  flowEdgesToCircuitEdges,
} from "../circuit/reactFlowMapping.js";
import { CircuitNode } from "./CircuitNode.jsx";
import { CircuitBridgeEdge } from "./CircuitBridgeEdge.jsx";
import { findWireBridgeMarkers } from "../circuit/wireIntersections.js";
import { useCircuitViewport } from './useCircuitViewport.js';
import { ArrowsOut, ArrowsIn, ArrowCounterClockwise, ArrowClockwise, Trash, ArrowBendUpRight } from '@phosphor-icons/react';

const nodeTypes = { circuitNode: CircuitNode };
const edgeTypes = { bridge: CircuitBridgeEdge };

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
  title: "电路工作台",
  unknown: "\u672a\u77e5",
};

function resultSummary(structure, tests) {
  if (structure.passed && tests.passed) return `\u672c\u5173\u901a\u8fc7\uff1a\u7ed3\u6784\u6b63\u786e\uff0c${tests.cases.length} ${copy.allCasesPassed}\u3002`;
  if (!structure.passed) return structure.errors[0]?.message ?? "\u7ed3\u6784\u4ecd\u6709\u95ee\u9898\uff0c\u8bf7\u68c0\u67e5\u7aef\u53e3\u548c\u5bfc\u7ebf\u3002";
  return "\u7ed3\u6784\u5df2\u5b8c\u6210\uff0c\u4f46\u81f3\u5c11\u4e00\u7ec4\u6d4b\u8bd5\u7528\u4f8b\u8f93\u51fa\u4e0d\u6b63\u786e\u3002";
}

function formatSignal(value) {
  if (Number.isFinite(value)) return String(value);
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

export function CircuitFlowCanvas({ model, onResult, onDraft, submitBlocked = false, submitBlockedReason = "" }) {
  const initialFlow = useMemo(() => circuitModelToFlow(model), [model]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);
  const [manualInputs, setManualInputs] = useState({});   // 手动探测：点输入节点切换 0/1
  const [manualMode, setManualMode] = useState(false);
  const [status, setStatus] = useState(() => `拖动两个端口即可连接，系统会自动识别输出端和输入端，完成${model.title}结构。`);
  const [report, setReport] = useState(null);
  const [hintLevel,setHintLevel]=useState(0);
  const [traceIndex,setTraceIndex]=useState(null);
  const [expanded,setExpanded]=useState(false);
  const [showLivePanel,setShowLivePanel]=useState(false);
  const [showValues,setShowValues]=useState(true),[showLabels,setShowLabels]=useState(true);
  const flowApi=useRef(null);
  const canvasRef=useCircuitViewport(options=>flowApi.current?.fitView(options));
  const workbenchRef=useRef(null);
  useEffect(()=>{
    if(!expanded)return;
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    const escape=event=>{
      if(event.key==='Escape'){event.preventDefault();setExpanded(false);}
      if(event.key==='Tab'){
        const focusable=[...workbenchRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(element=>element.getClientRects().length);
        const first=focusable[0],last=focusable.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('keydown',escape);
    return ()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',escape);};
  },[expanded]);

  // Undo/redo history stack
  const MAX_HISTORY = 50;
  const historyRef = useRef([initialFlow.edges]);
  const historyPosRef = useRef(0);
  const skipHistoryRef = useRef(false);

  const canUndo = historyPosRef.current > 0;
  const canRedo = historyPosRef.current < historyRef.current.length - 1;

  function pushHistory(nextEdges) {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    const stack = historyRef.current;
    // Drop any redo future when pushing new state
    stack.length = historyPosRef.current + 1;
    stack.push(nextEdges);
    if (stack.length > MAX_HISTORY) stack.shift();
    historyPosRef.current = stack.length - 1;
  }

  function undo() {
    if (historyPosRef.current <= 0) return;
    historyPosRef.current -= 1;
    skipHistoryRef.current = true;
    setEdges(historyRef.current[historyPosRef.current]);
    setReport(null);
  }

  function redo() {
    if (historyPosRef.current >= historyRef.current.length - 1) return;
    historyPosRef.current += 1;
    skipHistoryRef.current = true;
    setEdges(historyRef.current[historyPosRef.current]);
    setReport(null);
  }

  useEffect(() => {
    function handleKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "y" || (event.key === "z" && event.shiftKey))) {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const studentEdges = useMemo(() => flowEdgesToCircuitEdges(edges), [edges]);
  const selectedCase = model.testCases[Math.min(selectedCaseIndex, model.testCases.length - 1)] ?? model.testCases[0] ?? null;
  // 手动探测时用手动输入（点输入节点切的 0/1），否则用选中用例的输入
  const effectiveInputs = useMemo(() => {
    if (!manualMode) return selectedCase?.inputs ?? {};
    return Object.fromEntries(
      (model.nodes ?? []).filter((n) => n.type === "input").map((n) => [`${n.id}.out`, manualInputs[n.id] ?? 0]),
    );
  }, [manualMode, manualInputs, model.nodes, selectedCase]);
  const fullSimulation = useMemo(
    () => simulateCircuit(model, studentEdges, effectiveInputs),
    [model, effectiveInputs, studentEdges],
  );
  useEffect(()=>{onDraft?.({model,edges:studentEdges,inputs:effectiveInputs});},[model,studentEdges,effectiveInputs,onDraft]);
  useEffect(()=>{setTraceIndex(null);setReport(null);},[effectiveInputs,studentEdges]);
  const liveSimulation=traceIndex===null?fullSimulation:{...fullSimulation,values:fullSimulation.steps[traceIndex]?.values??effectiveInputs};
  const setInputValue=useCallback((nodeId,value)=>{
    setManualMode(true);
    setManualInputs(Object.fromEntries(model.nodes.filter(n=>n.type==='input').map(n=>[n.id,n.id===nodeId?value:effectiveInputs[`${n.id}.out`]??0])));
    setStatus('手动探测：改变输入并观察真实输出；公开用例可恢复预设输入。');
  },[effectiveInputs,model.nodes]);

  const toggleInput=useCallback(nodeId=>{
    const currentValue=effectiveInputs[`${nodeId}.out`]??0;
    setManualMode(true);
    setManualInputs(Object.fromEntries(model.nodes.filter(node=>node.type==='input').map(node=>[node.id,node.id===nodeId?(currentValue?0:1):effectiveInputs[`${node.id}.out`]??0])));
    setStatus('手动探测：切换开关，观察输出灯和导线的信号变化。点右侧用例可回到预设场景。');
  },[effectiveInputs,model.nodes]);

  // 给每个节点挂当前端口值：画布上每个门/输入都实时显示信号（点输入节点可切 0/1）
  const displayNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      onToggle:node.data.componentType==='input'?()=>toggleInput(node.id):undefined,
      onValueChange:node.data.componentType==='input'?value=>setInputValue(node.id,value):undefined,
      portValues: Object.fromEntries(
        (node.data.ports ?? []).map((port) => [port.id, liveSimulation.values?.[`${node.id}.${port.id}`]]),
      ),
    },
  })), [nodes, liveSimulation.values,toggleInput,setInputValue]);

  const onNodeClick = useCallback((_event, node) => {
    if (node.data?.componentType !== "input"||node.data.inputControl) return;
    toggleInput(node.id);
  }, [toggleInput]);
  const liveExpectedEntries = Object.entries(selectedCase?.expected ?? {});
  const liveCasePassed = liveExpectedEntries.length > 0
    && liveExpectedEntries.every(([key, expected]) => valuesMatch(liveSimulation.values?.[key], expected));
  const bridgeMarkers = useMemo(() => findWireBridgeMarkers(edges, nodes), [edges, nodes]);
  const bridgeMarkersByEdge = useMemo(() => {
    const map = new Map();
    for (const marker of bridgeMarkers) {
      map.set(marker.edgeId, [...(map.get(marker.edgeId) ?? []), marker]);
    }
    return map;
  }, [bridgeMarkers]);

  const displayEdges = useMemo(() => edges.map((edge) => {
    const value = liveSimulation.values?.[portValueKey(edge.source, edge.sourceHandle)];
    const tone = signalTone(value);
    return {
      ...edge,
      type: "bridge",
      animated: value === 1,
      className: `signal-${tone}`,
      label: formatSignal(value),
      markerEnd: undefined,
      data: { ...(edge.data ?? {}), bridgeMarkers: bridgeMarkersByEdge.get(edge.id) ?? [] },
    };
  }), [edges, bridgeMarkersByEdge, liveSimulation.values]);

  useEffect(() => {
    const nextFlow = circuitModelToFlow(model);
    setNodes(nextFlow.nodes);
    setEdges(nextFlow.edges);
    setSelectedEdgeId(null);
    setSelectedCaseIndex(0);
    setManualInputs({});
    setManualMode(false);
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
    setEdges((currentEdges) => {
      const next = addEdge({ ...edge, animated: false }, currentEdges);
      pushHistory(next);
      return next;
    });
    setReport(null);
    setStatus(copy.edgeConnected);
  }, [edges, model, setEdges]);

  const fillReference = useCallback(() => {
    const next = model.requiredEdges.map((edge) => circuitEdgeToFlowEdge(edge));
    setEdges(next);
    pushHistory(next);
    setReport(null);
    setStatus(`已填入${model.title}参考结构，可以提交检测或继续观察端口。`);
  }, [model, setEdges]);

  const reset = useCallback(() => {
    setEdges([]);
    pushHistory([]);
    setSelectedEdgeId(null);
    setReport(null);
    setStatus(`已重置${model.title}电路画布。`);
  }, [model, setEdges]);

  const removeSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    setEdges((currentEdges) => {
      const next = currentEdges.filter((edge) => edge.id !== selectedEdgeId);
      pushHistory(next);
      return next;
    });
    setSelectedEdgeId(null);
    setReport(null);
    setStatus(copy.edgeDeleted);
  }, [selectedEdgeId, setEdges]);

  const submit = useCallback(() => {
    if (submitBlocked) { setStatus(submitBlockedReason || "本关尚未解锁，暂时不能提交检测。"); return; }
    const structure = validateCircuitStructure(model, studentEdges);
    const tests = runAllCircuitTests(model, studentEdges);
    const failure=tests.allCases.find(item=>!item.passed);
    const nextReport = {
      passed: structure.passed && tests.passed,
      score: structure.passed && tests.passed ? 100 : Math.min(79,structure.score),
      structure:{...structure,errors:[...structure.errors,...(structure.passed&&failure?[{type:'输出不符',message:`${failure.name}：存在输出与目标不符，请查看反例。`}]:[])]},
      tests,
      circuitEdges: studentEdges,
    };

    setReport(nextReport);
    setStatus(resultSummary(structure, tests));
    onResult?.(nextReport);
  }, [model, onResult, studentEdges, submitBlocked, submitBlockedReason]);

  return (
    <div ref={workbenchRef} role={expanded?'dialog':'region'} aria-modal={expanded?true:undefined} aria-label={model.title+'电路工作台'} className={'circuit-flow-workbench'+(expanded?' expanded':'')} data-show-values={showValues} data-show-labels={showLabels}>
      <div className="circuit-flow-toolbar">
        <div>
          <strong className="circuit-workbench-title">{copy.title}</strong>
        </div>
        <div className="circuit-flow-actions">
          <button className="ghost-button" disabled={!canUndo} onClick={undo} title="Ctrl+Z" type="button"><ArrowCounterClockwise size={17}/>撤销</button>
          <button className="ghost-button" disabled={!canRedo} onClick={redo} title="Ctrl+Y" type="button"><ArrowClockwise size={17}/>重做</button>
          <button className="ghost-button" onClick={fillReference} type="button"><ArrowBendUpRight size={17}/>{copy.actionFill}</button>
          <button className="ghost-button" disabled={!selectedEdgeId} onClick={removeSelectedEdge} type="button"><Trash size={17}/>{copy.actionDelete}</button>
          <button className="ghost-button" onClick={reset} type="button">{copy.actionReset}</button>
          <button className="primary-button" disabled={submitBlocked} onClick={submit} title={submitBlocked ? submitBlockedReason : undefined} type="button">{copy.actionSubmit}</button>
          <button className="ghost-button" aria-expanded={showLivePanel} aria-controls="circuit-live-panel" onClick={()=>setShowLivePanel(current=>!current)} type="button">{showLivePanel?'收起数据面板':'显示数据面板'}</button>
          <button className="ghost-button circuit-expand-button" onClick={()=>setExpanded(current=>!current)} type="button">{expanded?<ArrowsIn size={17}/>:<ArrowsOut size={17}/>} {expanded?'退出放大':'放大工作台'}</button>
        </div>
      </div>

      <div className="circuit-stage">
      <section className="workbench-mission" aria-label="关卡任务">
        <div><small>{model.section??'课程电路挑战'} · {model.gradingMode==='functional'?'功能等价方案均可通过':'引导探索'}</small><p>{model.goal}</p><span>公开样例 {model.testCases.length} 组 · 完整检测 {model.testCases.length+(model.hiddenTestCases?.length??0)} 组</span></div>
        <button type="button" className="ghost-button" disabled={hintLevel>=(model.hints?.length??0)} onClick={()=>setHintLevel(level=>level+1)}>提示 {hintLevel}/{model.hints?.length??0}</button>
        {hintLevel>0?<ol className="workbench-hints">{model.hints.slice(0,hintLevel).map((hint,index)=><li key={index}>{hint}</li>)}</ol>:null}
      </section>

      <div className="circuit-flow-canvas-grid">
        <div ref={canvasRef} className="circuit-flow-canvas" data-testid="react-flow-circuit-canvas">
          <ReactFlow
            connectionMode={ConnectionMode.Loose}
            edges={displayEdges}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{padding:.2,maxZoom:1.3}}
            minZoom={.2}
            onInit={api=>{flowApi.current=api;}}
            nodes={displayNodes}
            nodeTypes={nodeTypes}
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
            onNodeClick={onNodeClick}
            onNodesChange={onNodesChange}
          >
            <Background gap={18} />
            <Controls />
          </ReactFlow>
        </div>

        <aside id="circuit-live-panel" className="circuit-flow-live-panel" hidden={!showLivePanel}>
          <section className="circuit-flow-case-panel">
            <div className="circuit-flow-panel-heading">
              <strong>{copy.casePanel}</strong>
              <span>{model.testCases.length} {copy.testCases}</span>
            </div>
            <div className="circuit-flow-case-tabs" role="group" aria-label={copy.testCases}>
              {model.testCases.map((testCase, index) => (
                <button
                  className={index === selectedCaseIndex && !manualMode ? "active" : ""}
                  aria-pressed={index===selectedCaseIndex&&!manualMode}
                  key={testCase.name}
                  onClick={() => { setSelectedCaseIndex(index); setManualMode(false); }}
                  type="button"
                >
                  {index + 1}
                </button>
              ))}
              {manualMode ? <span className="circuit-flow-manual-badge" title="正在手动探测，点用例返回预设场景">手动探测中</span> : null}
            </div>
            {selectedCase ? (
              <div className={`circuit-flow-case-detail ${liveCasePassed ? "passed" : "failed"}`}>
                <strong>{manualMode?'自由探测':selectedCase.name}</strong>
                <span>{manualMode?'观察中':liveCasePassed ? copy.statusPassed : copy.statusFailed}</span>
              </div>
            ) : null}
            <SignalList label={copy.input} model={model} values={effectiveInputs} />
            {manualMode?<SignalList label={copy.output} model={model} values={Object.fromEntries(model.nodes.filter(node=>node.type==='output').flatMap(node=>node.ports.filter(port=>port.direction==='in').map(port=>[`${node.id}.${port.id}`,liveSimulation.values?.[`${node.id}.${port.id}`]])))}/>:<CompareList
              actual={liveSimulation.values ?? {}}
              expected={selectedCase?.expected ?? {}}
              model={model}
            />}
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
      <div className="circuit-stage-footer">
        <div className="workbench-trace-controls"><button type="button" onClick={()=>setTraceIndex(index=>index===null?0:Math.min(fullSimulation.steps.length-1,index+1))}>单步传播</button><button type="button" onClick={()=>setTraceIndex(null)}>运行到结果</button><span>{traceIndex===null?'实时结果':`传播步骤 ${traceIndex+1}/${fullSimulation.steps.length}`}</span></div>
        <div className="circuit-flow-status" aria-live="polite">{status}</div>
        <div className="circuit-view-options"><span className="circuit-signal-key"><i className="one"/>1 高电平<i className="zero"/>0 低电平<i className="unknown"/>? 未知</span><label><input type="checkbox" checked={showValues} onChange={event=>setShowValues(event.target.checked)}/>信号数值</label><label><input type="checkbox" checked={showLabels} onChange={event=>setShowLabels(event.target.checked)}/>端口名称</label><small>拖动端口连线 · 点击开关探测</small></div>
      </div>
      </div>

      {report ? (
        <div className={`circuit-flow-report ${report.passed ? "passed" : "failed"}`}>
          <strong>{report.passed ? "\u672c\u5173\u901a\u8fc7" : "\u4ecd\u9700\u4fee\u6b63"}</strong>
          <span>完整检测：{report.tests.allCases.filter(item=>item.passed).length}/{report.tests.allCases.length} 组通过</span>
          {report.tests.allCases.find(item=>!item.passed)?<small className="workbench-counterexample">反例 · {Object.entries(report.tests.allCases.find(item=>!item.passed).inputs).map(([key,value])=>`${portLabel(model,key)}=${value}`).join('，')}；{report.tests.allCases.find(item=>!item.passed).mismatches.map(([key,expected])=>`${portLabel(model,key)} 应为 ${expected}，实际 ${formatSignal(report.tests.allCases.find(item=>!item.passed).actual[key])}`).join('；')}</small>:null}
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
