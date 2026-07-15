import { lazy, Suspense } from "react";
import { ArrowLeft, Cpu, Flame, GearSix, Play, SealCheck, Sparkle, Target, WarningCircle } from "@phosphor-icons/react";
import { CHALLENGES } from "../platformLogic.js";
import { getJourneyStepsForChallenge } from "../dataJourney.js";
import { challengeRouteMeta, challengeControlMeta, labDescription } from "./labPageData.js";
import { MobileLabFallback } from "./MobileLabFallback.jsx";
import { MachineNumberPanel } from "./MachineNumberPanel.jsx";
import { MemorySystemPanel } from "./MemorySystemPanel.jsx";
import { ChallengeCanvas } from "./ChallengeCanvas.jsx";
import { OverviewExplodedView } from "./OverviewExplodedView.jsx";
import { statusText, statusTone, formatEndpointLabel } from "./labUtils.js";

const CircuitFlowCanvas = lazy(() => import("./CircuitFlowCanvas.jsx").then((m) => ({ default: m.CircuitFlowCanvas })));

function formatOutputs(outputs) {
  return Object.entries(outputs).map(([k, v]) => `${outputLabel(k)}=${v}`).join(" · ");
}
function outputLabel(key) {
  const m = { sum: "S", carry: "进位", output: "Y", result: "F", value: "整数", signMagnitude: "原码", onesComplement: "反码", twosComplement: "补码", zero: "零标志" };
  return m[key] ?? key;
}

export function LabPage({
  lab, isMobile, memoryAddress, memoryOperation, memoryWriteValue,
  setMemoryAddress, setMemoryOperation, setMemoryWriteValue,
  memoryAccessState, setShowSettings, student, statusMessage, changeView,
}) {
  const l = lab;
  const cur = l.currentChallenge;
  if (cur.id === "computer-components") return ComputerOverviewLab();
  if (l.currentCircuitModel) return ReactFlowLab();
  return LegacyLab();

  function ComputerOverviewLab() {
    return (
      <div className="lab-studio" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <header className="lab-studio-header">
          <div className="lab-studio-brand"><button aria-label="返回课程首页" className="lab-studio-icon-button" onClick={() => changeView("home")} type="button"><ArrowLeft size={19} /></button><span className="lab-studio-mark"><Cpu size={24} /></span><div><strong>计算机组成探索</strong><small>3D 爆炸视图</small></div></div>
          <div className="lab-studio-current"><span>第一章计算机概述</span><strong>{cur.title}</strong><em>探索模式</em></div>
          <div className="lab-studio-score"><span>视角</span><strong>3D</strong><small>自由旋转</small></div>
          <div className="lab-studio-user"><span>{student.name}</span><button aria-label="\u6253\u5f00\u4e2a\u4eba\u8bbe\u7f6e" className="lab-studio-icon-button" onClick={() => setShowSettings(true)} type="button"><GearSix size={19} /></button></div>
        </header>
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <OverviewExplodedView
            autoPlay={true}
            completed={l.currentRecord?.status === "completed"}
            onComplete={l.completeOverviewChallenge}
          />
        </div>
      </div>
    );
  }

  function ReactFlowLab() {
    const idx = CHALLENGES.findIndex((c) => c.id === cur.id);
    const meta = challengeRouteMeta[cur.id] ?? {};
    const reqEdges = l.currentCircuitModel?.requiredEdges.length ?? cur.requiredConnections.length;
    const tc = l.currentCircuitModel?.testCases.length ?? 0;
    const st = statusText(l.currentRecord?.status ?? "not-started");
    const js = getJourneyStepsForChallenge(cur.id);
    return (
      <div className="lab-studio">
        <header className="lab-studio-header">
          <div className="lab-studio-brand"><button className="lab-studio-icon-button" onClick={() => changeView("home")} type="button" aria-label="返回课程首页"><ArrowLeft size={19} /></button><span className="lab-studio-mark"><Cpu size={24} /></span><div><strong>电路实验室</strong><small>计算机组成原理实训平台</small></div></div>
          <div className="lab-studio-current"><span>当前挑战 · {idx + 1} / {CHALLENGES.length}</span><strong>{cur.title}</strong><em>{st}</em></div>
          <div className="lab-studio-score"><span>得分</span><strong>{l.currentRecord?.bestScore ?? 0}</strong><small>/ 100</small></div>
          <div className="lab-studio-user"><span>{student.name}</span><button className="lab-studio-icon-button" onClick={() => setShowSettings(true)} type="button" aria-label="打开个人设置"><GearSix size={19} /></button></div>
        </header>
        <main className="lab-studio-grid">
          <aside className="lab-studio-route" aria-label="挑战路径">
            <div className="lab-studio-route-title"><strong>挑战路径</strong><span>共 {CHALLENGES.length} 关</span></div>
            <div className="lab-studio-stepper">{CHALLENGES.map((c, i) => { const r = l._progress?.[c.id] ?? {}; const m = challengeRouteMeta[c.id] ?? {}; const sel = c.id === l.selectedChallengeId; return (<button className={`lab-studio-step ${statusTone(r?.status ?? "not-started")} ${sel ? "selected" : ""}`} disabled={r?.status === "locked"} key={c.id} onClick={() => l.selectChallenge(c.id)} type="button"><span className="lab-studio-step-number">{i + 1}</span><span className="lab-studio-step-copy"><strong>{c.title}</strong><small>{m.focus ?? c.shortTitle}</small></span><span className="lab-studio-step-score">{r?.bestScore ?? 0} / 100</span></button>); })}</div>
            <section className="lab-studio-hint"><Sparkle size={18} /><strong>学习提示</strong><p>{meta.detail ?? cur.objective}</p></section>
          </aside>
          <section className="lab-studio-workspace">
            <div className="lab-studio-controls"><div><span className="eyebrow">主画布</span><h1>{cur.title}</h1><p>{labDescription(cur.id)}</p></div><div className="lab-studio-actionbar"><button onClick={l.runStep} type="button"><Play size={17} weight="fill" />单步执行</button><button onClick={l.runAll} type="button"><Flame size={17} weight="fill" />自动运行</button></div></div>
            <div className="lab-studio-inputs">{(challengeControlMeta[cur.id] ?? []).map((ctrl) => ctrl.type === "bit" ? <Toggle key={ctrl.key} label={ctrl.label} value={l.inputState[ctrl.key]} onChange={(v) => l.handleInputChange(ctrl.key, v)} /> : <Stepper key={ctrl.key} label={ctrl.label} value={l.inputState[ctrl.key]} min={ctrl.min} max={ctrl.max} onChange={(v) => l.handleInputChange(ctrl.key, v)} />)}</div>
            <div className="lab-studio-canvas-shell">{isMobile ? <MobileLabFallback challengeTitle={cur.title} /> : (<Suspense fallback={<div className="flow-loading">正在加载 React Flow 工作台...</div>}><CircuitFlowCanvas key={l.currentCircuitModel.id} model={l.currentCircuitModel} onResult={l.handleCircuitFlowResult} /></Suspense>)}</div>
            {js.length > 0 ? <DataJourneyPanel steps={js} activeStep={l.activeStep} /> : null}
            {cur.id === "memory-address" ? <MemorySystemPanel address={memoryAddress} operation={memoryOperation} state={memoryAccessState} writeValue={memoryWriteValue} onAddressChange={setMemoryAddress} onOperationChange={setMemoryOperation} onWriteValueChange={setMemoryWriteValue} /> : null}
            {cur.id === "machine-number" ? <MachineNumberPanel value={l.inputState.signedValue ?? -5} /> : null}
            <div className="lab-studio-inspector">
              <section><span className="eyebrow">元件属性</span><strong>{l.selectedComponent}</strong><p>{l.selectedComponentDetail?.description ?? "选择一个元件查看端口、职责和信号走向。"}</p></section>
              <section><span className="eyebrow">实时状态</span><strong>{statusMessage}</strong><p>必要连线 {reqEdges} 条 · 测试用例 {tc || cur.requiredConnections.length} 组 · 最近得分 {l.currentRecord?.bestScore ?? 0}</p></section>
              <section><span className="eyebrow">检测反馈</span>{l.feedback ? l.feedback.passed ? <p className="lab-studio-feedback passed"><SealCheck size={18} weight="fill" /> 本关通过，记录已保存。</p> : <p className="lab-studio-feedback failed"><WarningCircle size={18} weight="fill" /> 发现 {l.feedback.errors.length} 类问题，请按提示修正。</p> : <p className="lab-studio-feedback neutral"><Target size={18} /> 等待提交检测。</p>}</section>
              <section className={`realtime-diagnostics ${l.realtimeDiagnostics.status}`}><strong>实时数据流检测</strong><p>{l.realtimeDiagnostics.summary}</p><div className="diagnostic-test-list">{l.realtimeDiagnostics.testRows.map((r) => <div className={r.passed ? "passed" : "needs-work"} key={r.label}><span>{r.label}</span><small>实际：{r.actual}</small></div>)}</div>{l.realtimeDiagnostics.issues.length ? <div className="diagnostic-issues">{l.realtimeDiagnostics.issues.slice(0, 3).map((i) => <span key={`${i.type}-${i.message}`}>{i.type}</span>)}</div> : null}</section>
            </div>
          </section>
        </main>
      </div>
    );
  }

  function LegacyLab() {
    return (
      <div className="lab-screen">
        <div className="lab-stage-layout legacy">
          <aside className="lab-palette-panel">
            <div className="lab-panel-heading"><strong>元件区</strong><small>拖动元件到目标槽位，或点击参考结构快速对照。</small></div>
            <div className="component-palette">{l.placementBlueprint.map((slot) => (<button draggable className="component-chip" key={slot.id} onClick={() => { l.setExpandedComponent(slot.displayLabel); l.setSelectedComponent(slot.displayLabel); }} onDragStart={(e) => l.handlePaletteDragStart(e, slot)} type="button"><Cpu size={18} /><span>{slot.displayLabel}</span><small>{slot.role}</small></button>))}</div>
            <div className="lab-actions"><button className="primary-button" onClick={l.submitChallenge} type="button">提交检测</button><button className="ghost-button" onClick={l.resetChallenge} type="button">重置本关</button><button className="ghost-button" onClick={l.fillReferenceStructure} type="button">查看参考结构</button></div>
          </aside>
          <section className="lab-stage-panel"><div className="circuit-canvas" onDragOver={(e) => e.preventDefault()}><Suspense fallback={<div>加载中...</div>}><ChallengeCanvas activeStep={l.activeStep} challenge={cur} challengeId={cur.id} connectionBlueprint={l.connectionBlueprint} connections={l.connections} expandedComponent={l.expandedComponent} feedback={l.feedback} inputState={l.inputState} onBoardDragOver={(e) => e.preventDefault()} onBoardDrop={l.handleDrop} onPlacedComponentDragStart={l.handlePlacedComponentDragStart} onRemoveConnection={l.handleRemoveConnection} outputText={formatOutputs(l.simulation.outputs)} placementBlueprint={l.placementBlueprint} placementPreview={l.placementPreview} placedComponents={l.placedComponents} selectedComponent={l.selectedComponent} setExpandedComponent={l.setExpandedComponent} setSelectedComponent={l.setSelectedComponent} simulation={l.simulation} simulationStep={l.simulationStep} wireDrag={l.wireDrag} wireHoverEndpoint={l.wireHoverEndpoint} onWireDragEnd={l.handleWireDragEnd} onWireHoverChange={l.handleWireHoverChange} onWireDragMove={l.handleWireDragMove} onWireDragStart={l.handleWireDragStart} wirePreviewCopy={l.wirePreviewCopy} wirePreviewStatus={l.wirePreviewStatus} /></Suspense></div></section>
        </div>
      </div>
    );
  }
}

function Toggle({ label, value, onChange }) { return <label className="toggle-row"><span>{label}</span><button className={value === 0 ? "toggle-btn zero" : "toggle-btn one"} onClick={() => onChange(value === 0 ? 1 : 0)} type="button">{value === 0 ? "0" : "1"}</button></label>; }
function Stepper({ label, value, min = 0, max, onChange }) { return <label className="stepper-row"><span>{label}</span><div className="stepper"><button onClick={() => onChange(Math.max(min, value - 1))} type="button">-</button><strong>{value}</strong><button onClick={() => onChange(Math.min(max, value + 1))} type="button">+</button></div></label>; }
function DataJourneyPanel({ steps, activeStep }) { const ci = steps.length > 0 ? activeStep % steps.length : 0; return (<section className="data-journey-panel"><div className="section-heading"><div><span className="eyebrow">数据旅程检查点</span><h2>取指、译码、执行的课堂观察线</h2><p>按步骤观察地址、数据和控制信号如何经过寄存器与总线。</p></div></div><div className="journey-step-grid">{steps.map((s, i) => (<article className={i === ci ? "journey-step-card active" : "journey-step-card"} key={s.id}><div className="journey-step-head"><span>{String(i + 1).padStart(2, "0")}</span><strong>{s.title}</strong></div><code>{s.transfer}</code><p>{s.description}</p><div className="journey-registers">{s.registers.map((r) => <small key={r}>{r}</small>)}</div><div className="journey-checkpoint"><b>{s.checkpoint.question}</b><span>{s.checkpoint.answer}</span></div></article>))}</div></section>); }
