import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, Cpu, Flame, GearSix, Play, SealCheck, Sparkle, Target, WarningCircle } from "@phosphor-icons/react";
import { CHALLENGES, challengeOrderOf } from "../platformLogic.js";
import { COURSE_CHAPTERS, isParticipationChallenge } from "../courseChapters.js";
import { getJourneyStepsForChallenge } from "../dataJourney.js";

/** 侧栏与信息栏的分数文案：参与型关卡不计分，避免显示成「0 / 100」。 */
function labScoreText(challenge, record) {
  return isParticipationChallenge(challenge) ? "参与型" : `${record?.bestScore ?? 0} / 100`;
}

// 挑战路径与课程首页保持同一种划分：按教材章节分组展示关卡。
const LAB_STEP_CHAPTERS = COURSE_CHAPTERS.map((chapter) => ({
  chapter,
  items: CHALLENGES.filter((challenge) => challenge.chapterId === chapter.id),
})).filter((group) => group.items.length > 0);
import { challengeRouteMeta, challengeControlMeta, labDescription } from "./labPageData.js";
import { MobileLabFallback } from "./MobileLabFallback.jsx";
import { MachineNumberPanel } from "./MachineNumberPanel.jsx";
import { MemorySystemPanel } from "./MemorySystemPanel.jsx";
import { statusText, statusTone, formatEndpointLabel } from "./labUtils.js";
import { MissionHud } from "./classroom/student/MissionHud.jsx";
import { MissionPauseOverlay } from "./classroom/student/MissionPauseOverlay.jsx";
import { MissionSettlement } from "./classroom/student/MissionSettlement.jsx";
import { LabAssistantPanel } from "./LabAssistantPanel.jsx";
import { CpuExecutionPanel } from "./CpuExecutionPanel.jsx";
import { LogicGateSandbox } from "./LogicGateSandbox.jsx";
import { GateAssemblyChallenge } from "./GateAssemblyChallenge.jsx";
import { freeformSpecOf } from "../circuit/freeformGrading.js";

const CircuitFlowCanvas = lazy(() => import("./CircuitFlowCanvas.jsx").then((m) => ({ default: m.CircuitFlowCanvas })));
const OverviewExplodedView = lazy(() => import("./OverviewExplodedView.jsx").then((m) => ({ default: m.OverviewExplodedView })));

export function LabPage({
  lab, isMobile, memoryAddress, memoryOperation, memoryWriteValue,
  setMemoryAddress, setMemoryOperation, setMemoryWriteValue,
  memoryAccessState, setShowSettings, student, statusMessage, changeView,
  classroomLabViewModel,
  courseGuide,
}) {
  const l = lab;
  const cur = l.currentChallenge;
  const cl = classroomLabViewModel;

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y redo
  useEffect(() => {
    const handler = (e) => {
      if (cl?.paused || cl?.ended) return;
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) { e.preventDefault(); l.undoLab?.(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); l.redoLab?.(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [l, cl?.paused, cl?.ended]);

  // Classroom settlement: replace entire lab with settlement view
  if (cl?.ended) {
    return (
      <MissionSettlement
        viewModel={cl}
        onReturn={() => changeView("home")}
        onReview={() => changeView("home")}
      />
    );
  }

  // Wrap content with HUD and pause overlay for active classroom session
  function wrapClassroom(children) {
    if (!cl?.active) return children;
    return (
      <div>
        <MissionHud viewModel={cl} />
        <MissionPauseOverlay visible={cl.paused}>
          {children}
        </MissionPauseOverlay>
      </div>
    );
  }
  if (cur.id === "computer-components") return ComputerOverviewLab();
  // 每个课程关卡都必须在 challengeCircuitModel 中登记（由一致性单测保证）。
  // 缺少模型时给出明确提示，而不是退回已删除的旧画布。
  if (!l.currentCircuitModel) {
    return wrapClassroom(
      <div className="lab-screen">
        <div className="lab-stage-layout">
          <section className="lab-stage-panel">
            <div className="empty-state">
              <strong>这一关还没有可用的电路模型</strong>
              <p>请在 circuit/challengeCircuitModel.js 中登记该关卡后重试。</p>
            </div>
          </section>
        </div>
      </div>,
    );
  }
  return ReactFlowLab();

  function ComputerOverviewLab() {
    return wrapClassroom(
      <div className="lab-studio" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <header className="lab-studio-header">
          <div className="lab-studio-brand"><button aria-label="返回课程首页" className="lab-studio-icon-button" onClick={() => changeView("home")} type="button"><ArrowLeft size={19} /></button><span className="lab-studio-mark"><Cpu size={24} /></span><div><strong>计算机组成探索</strong><small>3D 爆炸视图</small></div></div>
          <div className="lab-studio-current"><span>第一章计算机概述</span><strong>{cur.title}</strong><em>探索模式</em></div>
          <div className="lab-studio-score"><span>视角</span><strong>3D</strong><small>自由旋转</small></div>
          <div className="lab-studio-user"><span>{student.name}</span><button aria-label="打开个人设置" className="lab-studio-icon-button" onClick={() => setShowSettings(true)} type="button"><GearSix size={19} /></button></div>
        </header>
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <Suspense fallback={<div className="flow-loading">正在加载 3D 概览...</div>}>
            <OverviewExplodedView
              autoPlay={false}
              completed={l.currentRecord?.status === "completed"}
              onComplete={l.completeOverviewChallenge}
              courseGuide={courseGuide}
            />
          </Suspense>
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
    const [sandboxMode, setSandboxMode] = useState(false);
    const [assemblyMode, setAssemblyMode] = useState(false);
    const freeformSpec = freeformSpecOf(cur.id);
    // 切换关卡时退出自由拼装
    useEffect(() => { setAssemblyMode(false); }, [cur.id]);
    return wrapClassroom(
      <div className="lab-studio">
        <header className="lab-studio-header">
          <div className="lab-studio-brand"><button className="lab-studio-icon-button" onClick={() => changeView("home")} type="button" aria-label="返回课程首页"><ArrowLeft size={19} /></button><span className="lab-studio-mark"><Cpu size={24} /></span><div><strong>电路实验室</strong><small>计算机组成原理实训平台</small></div></div>
          <div className="lab-studio-current"><span>当前挑战 · {idx + 1} / {CHALLENGES.length}</span><strong>{cur.title}</strong><em>{st}</em></div>
          <div className="lab-studio-score">{isParticipationChallenge(cur)
            ? <><span>计分方式</span><strong>参与型</strong><small>探索完成即通过</small></>
            : <><span>得分</span><strong>{l.currentRecord?.bestScore ?? 0}</strong><small>/ 100</small></>}</div>
          <div className="lab-studio-user"><span>{student.name}</span><button className="lab-studio-icon-button" onClick={() => setShowSettings(true)} type="button" aria-label="打开个人设置"><GearSix size={19} /></button></div>
        </header>
        <main className="lab-studio-grid">
          <aside className="lab-studio-route" aria-label="挑战路径">
            <div className="lab-studio-route-title"><strong>挑战路径</strong><span>共 {CHALLENGES.length} 关</span></div>
            <div className="lab-studio-stepper">{LAB_STEP_CHAPTERS.map((group) => (
              <div className="lab-studio-step-chapter-group" key={group.chapter.id}>
                <div className="lab-studio-step-chapter">{group.chapter.title}</div>
                {group.items.map((c) => { const r = l._progress?.[c.id] ?? {}; const m = challengeRouteMeta[c.id] ?? {}; const sel = c.id === l.selectedChallengeId; return (<button className={`lab-studio-step ${statusTone(r?.status ?? "not-started")} ${sel ? "selected" : ""}`} key={c.id} onClick={() => l.selectChallenge(c.id)} title={r?.status === "locked" ? "尚未解锁：可以进去练习，解锁后才能提交检测" : undefined} type="button"><span className="lab-studio-step-number">{challengeOrderOf(c.id)}</span><span className="lab-studio-step-copy"><strong>{c.title}</strong><small>{m.focus ?? c.shortTitle}</small></span><span className="lab-studio-step-score">{labScoreText(c, r)}</span></button>); })}
              </div>
            ))}</div>
            <section className="lab-studio-hint"><Sparkle size={18} /><strong>学习提示</strong><p>{meta.detail ?? cur.objective}</p></section>
          </aside>
          <section className="lab-studio-workspace">
            <div className="lab-studio-controls"><div><span className="eyebrow">主画布</span><h1>{sandboxMode ? "逻辑门沙盒" : assemblyMode ? `${cur.title} · 自由拼装` : cur.title}</h1><p>{sandboxMode ? "拖拽逻辑门自由拼装，实时看结果（练习模式，不计分）" : assemblyMode ? "自己拖门组装电路，判分通过即算过关" : labDescription(cur.id)}</p>{!sandboxMode && !assemblyMode && l.submitBlocked ? <p className="lab-studio-locked-notice" role="status"><WarningCircle size={16} weight="fill" />{l.submitBlockedReason}</p> : null}</div><div className="lab-studio-actionbar">{freeformSpec ? <button className={`sandbox-toggle ${assemblyMode ? "active" : ""}`} onClick={() => { setAssemblyMode(!assemblyMode); setSandboxMode(false); }} type="button">{assemblyMode ? "← 固定连线" : "🔧 自由拼装"}</button> : null}<button className={`sandbox-toggle ${sandboxMode ? "active" : ""}`} onClick={() => { setSandboxMode(!sandboxMode); setAssemblyMode(false); }} type="button">{sandboxMode ? "← 返回闯关" : "🧩 逻辑门沙盒"}</button>{!sandboxMode && !assemblyMode ? <><button onClick={l.runStep} type="button"><Play size={17} weight="fill" />单步执行</button><button onClick={l.runAll} type="button"><Flame size={17} weight="fill" />自动运行</button></> : null}</div></div>
            {sandboxMode ? (
              <div className="lab-studio-canvas-shell sandbox-shell"><LogicGateSandbox /></div>
            ) : assemblyMode && freeformSpec ? (
              <div className="lab-studio-canvas-shell sandbox-shell"><GateAssemblyChallenge challenge={cur} circuitModel={l.currentCircuitModel} onResult={l.handleCircuitFlowResult} submitBlocked={l.submitBlocked} submitBlockedReason={l.submitBlockedReason} /></div>
            ) : (<>
            <div className="lab-studio-inputs">{(challengeControlMeta[cur.id] ?? []).map((ctrl) => ctrl.type === "bit" ? <Toggle key={ctrl.key} label={ctrl.label} value={l.inputState[ctrl.key]} onChange={(v) => l.handleInputChange(ctrl.key, v)} /> : <Stepper key={ctrl.key} label={ctrl.label} value={l.inputState[ctrl.key]} min={ctrl.min} max={ctrl.max} onChange={(v) => l.handleInputChange(ctrl.key, v)} />)}</div>
            <div className="lab-studio-canvas-shell">{isMobile ? <MobileLabFallback challengeTitle={cur.title} /> : (<Suspense fallback={<div className="flow-loading">正在加载 React Flow 工作台...</div>}><CircuitFlowCanvas key={l.currentCircuitModel.id} model={l.currentCircuitModel} onResult={l.handleCircuitFlowResult} submitBlocked={l.submitBlocked} submitBlockedReason={l.submitBlockedReason} /></Suspense>)}</div>
            {cur.id === "instruction-data" ? <CpuExecutionPanel /> : null}
            {js.length > 0 ? <DataJourneyPanel steps={js} activeStep={l.activeStep} /> : null}
            {cur.id === "memory-address" ? <MemorySystemPanel address={memoryAddress} operation={memoryOperation} state={memoryAccessState} writeValue={memoryWriteValue} onAddressChange={setMemoryAddress} onOperationChange={setMemoryOperation} onWriteValueChange={setMemoryWriteValue} /> : null}
            {cur.id === "machine-number" ? <MachineNumberPanel value={l.inputState.signedValue ?? -5} /> : null}
            <div className="lab-studio-inspector">
              <section><span className="eyebrow">元件属性</span><strong>{l.selectedComponent}</strong><p>{l.selectedComponentDetail?.description ?? "选择一个元件查看端口、职责和信号走向。"}</p></section>
              <section><span className="eyebrow">实时状态</span><strong>{statusMessage}</strong><p>必要连线 {reqEdges} 条 · 测试用例 {tc || cur.requiredConnections.length} 组 · 最近得分 {labScoreText(cur, l.currentRecord)}</p></section>
              <section><span className="eyebrow">检测反馈</span>{l.feedback ? l.feedback.passed ? <p className="lab-studio-feedback passed"><SealCheck size={18} weight="fill" /> 本关通过，记录已保存。</p> : <p className="lab-studio-feedback failed"><WarningCircle size={18} weight="fill" /> 发现 {l.feedback.errors.length} 类问题，请按提示修正。</p> : <p className="lab-studio-feedback neutral"><Target size={18} /> 等待提交检测。</p>}</section>
              <LabAssistantPanel challenge={cur} connections={l.connections} inputState={l.inputState} feedback={l.feedback} realtimeDiagnostics={l.realtimeDiagnostics} />
              <section className={`realtime-diagnostics ${l.realtimeDiagnostics.status}`}><strong>实时数据流检测</strong><p>{l.realtimeDiagnostics.summary}</p><div className="diagnostic-test-list">{l.realtimeDiagnostics.testRows.map((r) => <div className={r.passed ? "passed" : "needs-work"} key={r.label}><span>{r.label}</span><small>实际：{r.actual}</small></div>)}</div>{l.realtimeDiagnostics.issues.length ? <div className="diagnostic-issues">{l.realtimeDiagnostics.issues.slice(0, 3).map((i) => <span key={`${i.type}-${i.message}`}>{i.type}</span>)}</div> : null}</section>
            </div>
            </>)}
          </section>
        </main>
      </div>
    );
  }
}

function Toggle({ label, value, onChange }) { return <label className="toggle-row"><span>{label}</span><button className={value === 0 ? "toggle-btn zero" : "toggle-btn one"} onClick={() => onChange(value === 0 ? 1 : 0)} type="button">{value === 0 ? "0" : "1"}</button></label>; }
function Stepper({ label, value, min = 0, max, onChange }) { return <label className="stepper-row"><span>{label}</span><div className="stepper"><button onClick={() => onChange(Math.max(min, value - 1))} type="button">-</button><strong>{value}</strong><button onClick={() => onChange(Math.min(max, value + 1))} type="button">+</button></div></label>; }
function DataJourneyPanel({ steps, activeStep }) { const ci = steps.length > 0 ? activeStep % steps.length : 0; return (<section className="data-journey-panel"><div className="section-heading"><div><span className="eyebrow">数据旅程检查点</span><h2>取指、译码、执行的课堂观察线</h2><p>按步骤观察地址、数据和控制信号如何经过寄存器与总线。</p></div></div><div className="journey-step-grid">{steps.map((s, i) => (<article className={i === ci ? "journey-step-card active" : "journey-step-card"} key={s.id}><div className="journey-step-head"><span>{String(i + 1).padStart(2, "0")}</span><strong>{s.title}</strong></div><code>{s.transfer}</code><p>{s.description}</p><div className="journey-registers">{s.registers.map((r) => <small key={r}>{r}</small>)}</div><div className="journey-checkpoint"><b>{s.checkpoint.question}</b><span>{s.checkpoint.answer}</span></div></article>))}</div></section>); }
