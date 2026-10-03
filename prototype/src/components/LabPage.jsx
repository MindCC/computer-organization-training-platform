import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Flame, Play, SealCheck, Sparkle, Target, WarningCircle } from "@phosphor-icons/react";
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
import { challengeRouteMeta, labDescription } from "./labPageData.js";
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
import { ChallengeMap } from "./ChallengeMap.jsx";
import { freeformSpecOf } from "../circuit/freeformGrading.js";
import { describeCircuitDraft } from '../circuit/circuitDraftDiagnostics.js';
import './labWorkbench.css';

const CircuitFlowCanvas = lazy(() => import("./CircuitFlowCanvas.jsx").then((m) => ({ default: m.CircuitFlowCanvas })));
const OverviewExplodedView = lazy(() => import("./OverviewExplodedView.jsx").then((m) => ({ default: m.OverviewExplodedView })));

export function LabPage({
  lab, isMobile, memoryAddress, memoryOperation, memoryWriteValue,
  setMemoryAddress, setMemoryOperation, setMemoryWriteValue,
  memoryAccessState, statusMessage, changeView,
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
      <div className="lab-classroom-wrap">
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
  return <ReactFlowLab l={l} cur={cur} isMobile={isMobile} memoryAddress={memoryAddress} memoryOperation={memoryOperation} memoryWriteValue={memoryWriteValue} setMemoryAddress={setMemoryAddress} setMemoryOperation={setMemoryOperation} setMemoryWriteValue={setMemoryWriteValue} memoryAccessState={memoryAccessState} statusMessage={statusMessage} changeView={changeView} wrapClassroom={wrapClassroom}/>;

  function ComputerOverviewLab() {
    return wrapClassroom(
      <div className="lab-studio lab-overview">
        <ExperimentContext challenge={cur} record={l.currentRecord} onBack={()=>changeView('home')} overview/>
        <div className="lab-overview-stage">
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

}

function ReactFlowLab({l,cur,isMobile,memoryAddress,memoryOperation,memoryWriteValue,setMemoryAddress,setMemoryOperation,setMemoryWriteValue,memoryAccessState,statusMessage,changeView,wrapClassroom}) {
    const meta = challengeRouteMeta[cur.id] ?? {};
    const reqEdges = l.currentCircuitModel?.requiredEdges.length ?? cur.requiredConnections.length;
    const tc = l.currentCircuitModel?.testCases.length ?? 0;
    const js = getJourneyStepsForChallenge(cur.id);
    const [sandboxMode, setSandboxMode] = useState(false);
    const [assemblyMode, setAssemblyMode] = useState(false);
    const [mapMode, setMapMode] = useState(false);
    const [draft,setDraft]=useState(null);
    const draftDiagnostics=useMemo(()=>describeCircuitDraft(draft),[draft]);

    // 挑战路径：可拖拽调宽 / 可整体收起 / 高度限高内滚
    const [routeWidth, setRouteWidth] = useState(232);
    const [routeCollapsed, setRouteCollapsed] = useState(false);
    const startRouteResize = (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = routeWidth;
      const onMove = (ev) => setRouteWidth(Math.min(560, Math.max(180, startWidth + ev.clientX - startX)));
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
    const freeformSpec = freeformSpecOf(cur.id);
    // 切换关卡时退出自由拼装
    useEffect(() => { setAssemblyMode(false); }, [cur.id]);

    // 章节收起/展开：默认只展开当前关所在的章
    const [collapsedChapters, setCollapsedChapters] = useState(() => Object.fromEntries(
      LAB_STEP_CHAPTERS.map((group) => [group.chapter.id, group.chapter.id !== cur.chapterId]),
    ));
    useEffect(() => {
      setCollapsedChapters((current) => ({ ...current, [cur.chapterId]: false }));
    }, [cur.chapterId]);
    const toggleChapter = (chapterId) => setCollapsedChapters((current) => ({ ...current, [chapterId]: !current[chapterId] }));
    const setAllChapters = (collapsed) => setCollapsedChapters(Object.fromEntries(LAB_STEP_CHAPTERS.map((group) => [group.chapter.id, collapsed])));
    return wrapClassroom(
      <div className="lab-studio">
        <ExperimentContext challenge={cur} record={l.currentRecord} onBack={()=>changeView('home')}/>
        <main className="lab-studio-grid" style={{ "--route-width": routeCollapsed ? "34px" : `${routeWidth}px` }}>
          <aside className={`lab-studio-route ${routeCollapsed ? "collapsed" : ""}`} aria-label="挑战路径">
            {routeCollapsed ? (
              <button aria-label="展开挑战路径" className="route-expand-btn" onClick={() => setRouteCollapsed(false)} title="展开挑战路径" type="button">▶</button>
            ) : (<>
            <div className="lab-studio-route-title">
              <strong>挑战路径</strong>
              <span className="route-fold-group">
                <button className="route-fold-btn" onClick={() => setAllChapters(false)} type="button">全展开</button>
                <button className="route-fold-btn" onClick={() => setAllChapters(true)} type="button">全收起</button>
                <button aria-label="收起挑战路径" className="route-fold-btn route-collapse-btn" onClick={() => setRouteCollapsed(true)} title="收起挑战路径" type="button">◀</button>
              </span>
            </div>
            <div className="lab-studio-stepper">{LAB_STEP_CHAPTERS.map((group) => {
              const collapsed = collapsedChapters[group.chapter.id] ?? false;
              const doneCount = group.items.filter((c) => (l._progress?.[c.id]?.status) === "completed").length;
              return (
                <div className="lab-studio-step-chapter-group" key={group.chapter.id}>
                  <button
                    aria-expanded={!collapsed}
                    className={`lab-studio-step-chapter ${collapsed ? "collapsed" : ""}`}
                    onClick={() => toggleChapter(group.chapter.id)}
                    type="button"
                  >
                    <span className="chapter-caret">{collapsed ? "▸" : "▾"}</span>
                    <strong>{group.chapter.title}</strong>
                    <small>{doneCount}/{group.items.length}</small>
                  </button>
                  {collapsed ? null : group.items.map((c) => { const r = l._progress?.[c.id] ?? {}; const m = challengeRouteMeta[c.id] ?? {}; const sel = c.id === l.selectedChallengeId; return (<button className={`lab-studio-step ${statusTone(r?.status ?? "not-started")} ${sel ? "selected" : ""}`} key={c.id} onClick={() => l.selectChallenge(c.id)} title={r?.status === "locked" ? "尚未解锁：可以进去练习，解锁后才能提交检测" : undefined} type="button"><span className="lab-studio-step-number">{challengeOrderOf(c.id)}</span><span className="lab-studio-step-copy"><strong>{c.title}</strong><small>{m.focus ?? c.shortTitle}</small></span><span className="lab-studio-step-score">{labScoreText(c, r)}</span></button>); })}
                </div>
              );
            })}</div>
            <section className="lab-studio-hint"><Sparkle size={18} /><strong>学习提示</strong><p>{meta.detail ?? cur.objective}</p></section>
            <div aria-label="拖拽调整挑战路径宽度" aria-orientation="vertical" className="route-resize-handle" onPointerDown={startRouteResize} role="separator" title="拖拽调整宽度" />
            </>)}
          </aside>
          <section className="lab-studio-workspace">
            <div className="lab-studio-controls"><div><span className="eyebrow">主画布</span><h1>{mapMode ? "挑战依赖地图" : sandboxMode ? "逻辑门沙盒" : assemblyMode ? `${cur.title} · 自由拼装` : cur.title}</h1><p>{mapMode ? "完成一个关卡，解锁依赖它的后续关卡（仿图灵完备）" : sandboxMode ? "拖拽逻辑门自由拼装，实时看结果（练习模式，不计分）" : assemblyMode ? "自己拖门组装电路，判分通过即算过关" : l.currentCircuitModel.goal}</p>{!sandboxMode && !assemblyMode && !mapMode && l.submitBlocked ? <p className="lab-studio-locked-notice" role="status"><WarningCircle size={16} weight="fill" />{l.submitBlockedReason}</p> : null}</div><div className="lab-studio-actionbar"><button className={`sandbox-toggle ${mapMode ? "active" : ""}`} onClick={() => { setMapMode(!mapMode); setSandboxMode(false); setAssemblyMode(false); }} type="button">{mapMode ? "← 返回挑战" : "🗺 依赖地图"}</button>{freeformSpec ? <button className={`sandbox-toggle ${assemblyMode ? "active" : ""}`} onClick={() => { setAssemblyMode(!assemblyMode); setSandboxMode(false); setMapMode(false); }} type="button">{assemblyMode ? "← 固定连线" : "🔧 自由拼装"}</button> : null}<button className={`sandbox-toggle ${sandboxMode ? "active" : ""}`} onClick={() => { setSandboxMode(!sandboxMode); setAssemblyMode(false); setMapMode(false); }} type="button">{sandboxMode ? "← 返回闯关" : "🧩 逻辑门沙盒"}</button></div></div>
            {mapMode ? (
              <div className="lab-studio-canvas-shell sandbox-shell"><ChallengeMap progress={l._progress} selectedId={cur.id} onEnter={(id) => { setMapMode(false); l.selectChallenge(id); }} /></div>
            ) : sandboxMode ? (
              <div className="lab-studio-canvas-shell sandbox-shell"><LogicGateSandbox progress={l._progress}/></div>
            ) : assemblyMode && freeformSpec ? (
              <div className="lab-studio-canvas-shell sandbox-shell"><GateAssemblyChallenge challenge={cur} circuitModel={l.currentCircuitModel} onResult={l.handleCircuitFlowResult} onDraft={setDraft} submitBlocked={l.submitBlocked} submitBlockedReason={l.submitBlockedReason} /></div>
            ) : (<>
            <div className="lab-studio-canvas-shell">{isMobile ? <MobileLabFallback challengeTitle={cur.title} /> : (<Suspense fallback={<div className="flow-loading">正在加载 React Flow 工作台...</div>}><CircuitFlowCanvas key={l.currentCircuitModel.id} model={l.currentCircuitModel} onResult={l.handleCircuitFlowResult} onDraft={setDraft} submitBlocked={l.submitBlocked} submitBlockedReason={l.submitBlockedReason} /></Suspense>)}</div>
            {cur.id === "instruction-data" ? <CpuExecutionPanel /> : null}
            {js.length > 0 ? <DataJourneyPanel steps={js} activeStep={l.activeStep} /> : null}
            {cur.id === "memory-address" ? <MemorySystemPanel address={memoryAddress} operation={memoryOperation} state={memoryAccessState} writeValue={memoryWriteValue} onAddressChange={setMemoryAddress} onOperationChange={setMemoryOperation} onWriteValueChange={setMemoryWriteValue} /> : null}
            {cur.id === "machine-number" ? <MachineNumberPanel value={l.inputState.signedValue ?? -5} onValueChange={(v) => l.handleInputChange("signedValue", v)} /> : null}
            <details className="lab-observation"><summary>实验观察与检测说明 <span>元件属性 · 学习状态 · AI 助教</span></summary><div className="lab-studio-inspector">
              <section><span className="eyebrow">元件属性</span><strong>{l.selectedComponent}</strong><p>{l.selectedComponentDetail?.description ?? "选择一个元件查看端口、职责和信号走向。"}</p></section>
              <section><span className="eyebrow">实时状态</span><strong>{statusMessage}</strong><p>必要连线 {reqEdges} 条 · 测试用例 {tc || cur.requiredConnections.length} 组 · 最近得分 {labScoreText(cur, l.currentRecord)}</p></section>
              <section><span className="eyebrow">检测反馈</span>{l.feedback ? l.feedback.passed ? <p className="lab-studio-feedback passed"><SealCheck size={18} weight="fill" /> 本关通过，记录已保存。</p> : <p className="lab-studio-feedback failed"><WarningCircle size={18} weight="fill" /> 发现 {l.feedback.errors.length} 类问题，请按提示修正。</p> : <p className="lab-studio-feedback neutral"><Target size={18} /> 等待提交检测。</p>}</section>
              <LabAssistantPanel challenge={cur} connections={(draft?.edges??[]).map(e=>`${e.from.nodeId}.${e.from.portId}->${e.to.nodeId}.${e.to.portId}`)} inputState={draft?.inputs??{}} feedback={l.feedback} realtimeDiagnostics={draftDiagnostics} />
              <section className={`realtime-diagnostics ${draftDiagnostics.status}`}><strong>实时数据流检测</strong><p>{draftDiagnostics.summary}</p><div className="diagnostic-test-list">{draftDiagnostics.testRows.map((r) => <div className={r.passed ? "passed" : "needs-work"} key={r.label}><span>{r.label}</span><small>实际：{r.actual}</small></div>)}</div>{draftDiagnostics.issues.length ? <div className="diagnostic-issues">{draftDiagnostics.issues.slice(0, 3).map((i) => <span key={`${i.type}-${i.message}`}>{i.type}</span>)}</div> : null}</section>
            </div></details>
            </>)}
          </section>
        </main>
      </div>
    );
}

function ExperimentContext({challenge,record,onBack,overview=false}) {
  return <div className="lab-experiment-context" aria-label="当前实验">
    <button className="lab-context-back" aria-label="返回课程首页" onClick={onBack} type="button"><ArrowLeft size={16}/>课程首页</button>
    <div className="lab-studio-current"><span>{overview?'计算机组成探索':'电路实验室'} · {challengeOrderOf(challenge.id)} / {CHALLENGES.length}</span><strong>{challenge.title}</strong><em className={statusTone(record?.status??'not-started')}>{overview?'探索模式':statusText(record?.status??'not-started')}</em></div>
    <div className="lab-studio-score">{isParticipationChallenge(challenge)?<><strong>参与型</strong><small>探索完成即通过</small></>:<><span>得分</span><strong>{record?.bestScore??0}</strong><small>/ 100</small></>}</div>
  </div>;
}

function DataJourneyPanel({ steps, activeStep }) { const ci = steps.length > 0 ? activeStep % steps.length : 0; return (<section className="data-journey-panel"><div className="section-heading"><div><span className="eyebrow">数据旅程检查点</span><h2>取指、译码、执行的课堂观察线</h2><p>按步骤观察地址、数据和控制信号如何经过寄存器与总线。</p></div></div><div className="journey-step-grid">{steps.map((s, i) => (<article className={i === ci ? "journey-step-card active" : "journey-step-card"} key={s.id}><div className="journey-step-head"><span>{String(i + 1).padStart(2, "0")}</span><strong>{s.title}</strong></div><code>{s.transfer}</code><p>{s.description}</p><div className="journey-registers">{s.registers.map((r) => <small key={r}>{r}</small>)}</div><div className="journey-checkpoint"><b>{s.checkpoint.question}</b><span>{s.checkpoint.answer}</span></div></article>))}</div></section>); }
