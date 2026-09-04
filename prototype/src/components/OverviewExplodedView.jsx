import { useState, useEffect, useMemo } from "react";
import { NativeComputerScene } from "./NativeComputerScene.jsx";
import { ThreeSceneFallback } from "./ThreeSceneFallback.jsx";
import { COMPUTER_PARTS, getPartInstances } from "./computerParts.js";
import { CourseGuidePanel } from "./CourseGuidePanel.jsx";
import { nextGuideStep } from "../courseWorkbenchState.js";

// Assembly steps: which part appears at which step
const ASSEMBLY_STEPS = [
  { step: 1, label: "机箱", partIds: ["case"], desc: "第一步：准备好机箱。机箱是计算机的外壳，保护内部所有部件。前面板有电源按钮和 USB 接口。" },
  { step: 2, label: "安装电源", partIds: ["case", "psu"], desc: "第二步：安装电源（PSU）。电源将 220V 交流电转换为 12V/5V/3.3V 直流电，为主板和各个部件供电。" },
  { step: 3, label: "安装主板", partIds: ["case", "psu", "motherboard"], desc: "第三步：安装主板。主板是所有部件的连接中心，包含芯片组和扩展插槽。对应五大部件中的「控制器」。", highlight: "motherboard" },
  { step: 4, label: "安装 CPU", partIds: ["case", "psu", "motherboard", "cpu"], desc: "第四步：安装 CPU（中央处理器）。CPU 是计算机的「大脑」，执行所有运算。对应五大部件中的「运算器」。", highlight: "cpu" },
  { step: 5, label: "安装内存", partIds: ["case", "psu", "motherboard", "cpu", "ram-0", "ram-1"], desc: "第五步：安装内存条。内存是 CPU 的工作区，临时存放正在运行的程序和数据。对应五大部件中的「存储器」。", highlight: "ram-0" },
  { step: 6, label: "安装显卡", partIds: ["case", "psu", "motherboard", "cpu", "ram-0", "ram-1", "gpu"], desc: "第六步：安装显卡（GPU）。显卡专门处理图形和并行计算，通过 PCIe 总线与 CPU 通信。", highlight: "gpu" },
  { step: 7, label: "安装硬盘", partIds: ["case", "psu", "motherboard", "cpu", "ram-0", "ram-1", "gpu", "storage"], desc: "第七步：安装硬盘。硬盘长期保存操作系统、软件和文件。SSD 比机械硬盘快数十倍。", highlight: "storage" },
  { step: 8, label: "整机完成", partIds: ["case", "psu", "motherboard", "cpu", "ram-0", "ram-1", "gpu", "storage"], desc: "组装完成！各部件通过数据总线、地址总线和控制总线相互通信，电源为所有部件供电。试试旋转和缩放查看整机结构。", showConnections: true },
];

export function OverviewExplodedView({ autoPlay = false, completed = false, onComplete, courseGuide = null }) {
  const prefersReducedMotion = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shouldAutoPlay = autoPlay && !prefersReducedMotion;
  const [mode, setMode] = useState(shouldAutoPlay ? "auto" : "step");
  const [autoAnimating, setAutoAnimating] = useState(shouldAutoPlay);
  const [explodeDistance, setExplodeDistance] = useState(0);
  const [currentStep, setCurrentStep] = useState(shouldAutoPlay ? 0 : 1);
  const [selectedPart, setSelectedPart] = useState(null);
  const [showHint, setShowHint] = useState(true);
  const [xray, setXray] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  const [guideVisible, setGuideVisible] = useState(true);

  useEffect(() => { setGuideIndex(0); setGuideVisible(true); }, [courseGuide?.id]);
  useEffect(() => {
    const action = courseGuide?.guideScript?.[guideIndex]?.action;
    if (!action) return;
    if (action.type === "highlightPart") setSelectedPart(COMPUTER_PARTS.find((item) => item.id === action.partId) ?? null);
    if (action.type === "setXray") setXray(action.enabled);
    if (action.type === "showHint") setShowHint(true);
  }, [courseGuide, guideIndex]);

  // The effective distance for connection line positioning:
  // - auto mode: target settle distance (1.3) after animation completes
  // - manual mode: explodeDistance
  const effectiveDistance = autoAnimating ? 1.3 : explodeDistance;
  const allParts = useMemo(() => getPartInstances(effectiveDistance), [effectiveDistance]);

  useEffect(() => { const t = setTimeout(() => setShowHint(false), 5000); return () => clearTimeout(t); }, []);

  useEffect(() => {
    function onKey(e) {
      if (mode !== "step") return;
      if (e.key === "ArrowRight" && currentStep < 8) setCurrentStep((s) => s + 1);
      if (e.key === "ArrowLeft" && currentStep > 1) setCurrentStep((s) => s - 1);
      if (e.key === " " && currentStep < 8) { e.preventDefault(); setCurrentStep((s) => s + 1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, currentStep]);

  // Filter parts by current step (match by parentId or id)
  const visibleParts = useMemo(() => {
    if (mode === "auto" || currentStep === 0) return allParts;
    const stepData = ASSEMBLY_STEPS[currentStep - 1];
    if (!stepData) return allParts;
    const stepPartIds = stepData.partIds;
    return allParts.filter((p) => stepPartIds.includes(p.parentId ?? p.id));
  }, [mode, currentStep, allParts]);

  // Unique parent parts for the part list (dedupe by parentId)
  const uniqueParts = useMemo(() => {
    const seen = new Set();
    return visibleParts.filter((p) => {
      const key = p.parentId ?? p.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [visibleParts]);

  const stepData = currentStep > 0 ? ASSEMBLY_STEPS[currentStep - 1] : null;
  const showConnections = stepData?.showConnections ?? false;

  const sceneViewState = useMemo(() => ({
    visiblePartIds: uniqueParts.map((part) => part.parentId ?? part.id),
    explodeDistance,
    autoAnimating: mode === "auto" && autoAnimating,
    selectedPartId: selectedPart?.parentId ?? selectedPart?.id ?? null,
    xray,
    showConnections: showConnections || mode === "auto" || xray,
    reducedMotion: prefersReducedMotion,
  }), [uniqueParts, explodeDistance, mode, autoAnimating, selectedPart, xray, showConnections, prefersReducedMotion]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <NativeComputerScene
        fallback={<ThreeSceneFallback completed={completed} context="overview" onComplete={onComplete} />}
        onPartSelect={(partId) => {
          const part = COMPUTER_PARTS.find((item) => item.id === partId) ?? null;
          setSelectedPart((current) => current?.id === partId ? null : part);
        }}
        viewState={sceneViewState}
      />
      {guideVisible && courseGuide ? <CourseGuidePanel guide={courseGuide} index={guideIndex} completed={completed} onClose={() => setGuideVisible(false)} onAcknowledge={() => setGuideIndex((index) => nextGuideStep(courseGuide.guideScript, index, { acknowledged: true, challengeCompleted: completed }))} /> : null}

      {/* Top bar: mode toggle */}
      <div className="exploded-topbar">
        <button className={mode === "auto" ? "active" : ""} onClick={() => { setMode("auto"); setCurrentStep(0); setAutoAnimating(true); }} type="button">自动爆炸</button>
        <button className={mode === "step" ? "active" : ""} onClick={() => { setMode("step"); setCurrentStep(1); setAutoAnimating(false); }} type="button">分步组装</button>
        <button
          aria-pressed={xray}
          className={xray ? "active xray-toggle" : "xray-toggle"}
          onClick={() => setXray((value) => !value)}
          title="X-ray 模式：连接线穿透部件显示"
          type="button"
        >
          {xray ? "X-ray 开" : "X-ray"}
        </button>
        {mode === "auto" && (
          <div className="exploded-controls-inline">
            <button onClick={() => { setAutoAnimating(false); setExplodeDistance(0); }} type="button">装配</button>
            <button onClick={() => { setAutoAnimating(false); setExplodeDistance(1.5); }} type="button">爆炸</button>
            <button onClick={() => { setAutoAnimating(false); setExplodeDistance(2.0); }} type="button">全展开</button>
          </div>
        )}
      </div>

      <div className="exploded-part-list" aria-label="部件列表">
        {uniqueParts.map((part) => {
          const parentId = part.parentId ?? part.id;
          return (
            <button
              aria-label={`查看 ${part.label} 部件`}
              aria-pressed={selectedPart?.parentId === parentId || selectedPart?.id === parentId}
              key={parentId}
              onClick={() => setSelectedPart(selectedPart?.parentId === parentId || selectedPart?.id === parentId ? null : part)}
              type="button"
            >
              <span>{part.label}</span>
              <small>{part.fiveElement}</small>
            </button>
          );
        })}
      </div>

      {/* Bottom bar: step controls */}
      {mode === "step" && (
        <div className="exploded-stepbar">
          <button onClick={() => setCurrentStep(Math.max(1, currentStep - 1))} disabled={currentStep <= 1} type="button">◀ 上一步</button>
          <div className="exploded-step-indicator">
            {ASSEMBLY_STEPS.map((s) => (
              <span key={s.step} className={s.step === currentStep ? "active" : s.step < currentStep ? "done" : ""}>
                {s.step}
              </span>
            ))}
          </div>
          {currentStep < ASSEMBLY_STEPS.length ? (
            <button onClick={() => setCurrentStep(currentStep + 1)} type="button">{"\u4e0b\u4e00\u6b65 \u25b6"}</button>
          ) : (
            <button className="complete" disabled={completed} onClick={onComplete} type="button">
              {completed ? "\u5df2\u5b8c\u6210\u63a2\u7d22" : "\u5b8c\u6210\u63a2\u7d22"}
            </button>
          )}
        </div>
      )}

      {/* Step description */}
      {stepData && (
        <div className="exploded-step-desc">
          <strong>{stepData.label}</strong>
          <p>{stepData.desc}</p>
        </div>
      )}

      {/* Part info card */}
      {selectedPart && (
        <div className="exploded-info-card">
          <strong>{selectedPart.label}</strong>
          <small>{selectedPart.category} · 五大部件：{selectedPart.fiveElement}</small>
          <p className="exploded-info-desc">{selectedPart.description}</p>
          <button aria-label="关闭部件详情" onClick={() => setSelectedPart(null)} type="button">✕</button>
        </div>
      )}

      {/* Connection legend */}
      <div className="exploded-legend">
        <span><i style={{ background: "#4fc3f7" }} /> 数据总线</span>
        <span><i style={{ background: "#81c784" }} /> 地址总线</span>
        <span><i style={{ background: "#ffeb3b" }} /> 控制总线</span>
        <span><i style={{ background: "#ef5350" }} /> 供电线</span>
      </div>

      {/* Von Neumann architecture overview */}
      <div className="von-neumann-overview">
        <strong>冯·诺依曼架构</strong>
        <svg viewBox="0 0 420 120" className="von-neumann-diagram">
          <rect x="10" y="10" width="70" height="28" rx="4" fill="rgba(79,195,247,0.12)" stroke="rgba(79,195,247,0.35)" strokeWidth="1" />
          <text x="45" y="28" textAnchor="middle" fill="#4fc3f7" fontSize="9" fontWeight="600">输入设备</text>
          <rect x="100" y="10" width="70" height="28" rx="4" fill="rgba(129,199,132,0.12)" stroke="rgba(129,199,132,0.35)" strokeWidth="1" />
          <text x="135" y="28" textAnchor="middle" fill="#81c784" fontSize="9" fontWeight="600">存储器</text>
          <rect x="190" y="10" width="70" height="28" rx="4" fill="rgba(255,183,77,0.12)" stroke="rgba(255,183,77,0.35)" strokeWidth="1" />
          <text x="225" y="28" textAnchor="middle" fill="#ffb74d" fontSize="9" fontWeight="600">运算器</text>
          <rect x="280" y="10" width="70" height="28" rx="4" fill="rgba(206,147,216,0.12)" stroke="rgba(206,147,216,0.35)" strokeWidth="1" />
          <text x="315" y="28" textAnchor="middle" fill="#ce93d8" fontSize="9" fontWeight="600">控制器</text>
          <rect x="340" y="50" width="70" height="28" rx="4" fill="rgba(229,115,115,0.12)" stroke="rgba(229,115,115,0.35)" strokeWidth="1" />
          <text x="375" y="68" textAnchor="middle" fill="#ef5350" fontSize="9" fontWeight="600">输出设备</text>
          <line x1="80" y1="24" x2="98" y2="24" stroke="rgba(255,255,255,0.15)" strokeWidth="1" markerEnd="url(#arrow)" />
          <line x1="170" y1="24" x2="188" y2="24" stroke="rgba(255,255,255,0.15)" strokeWidth="1" markerEnd="url(#arrow)" />
          <line x1="260" y1="24" x2="278" y2="24" stroke="rgba(255,255,255,0.15)" strokeWidth="1" markerEnd="url(#arrow)" />
          <line x1="315" y1="38" x2="315" y2="48" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          <line x1="315" y1="64" x2="338" y2="64" stroke="rgba(255,255,255,0.15)" strokeWidth="1" markerEnd="url(#arrow)" />
          <line x1="135" y1="38" x2="225" y2="10" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" strokeDasharray="3,3" />
          <defs>
            <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L6,3 L0,6" fill="rgba(255,255,255,0.25)" />
            </marker>
          </defs>
        </svg>
        <small>数据流：输入→存储→运算，控制信号协调全机</small>
      </div>

      {/* Operation hint */}
      {showHint && (
        <div className="exploded-hint-bar">
          🖱 拖拽旋转 · 滚轮缩放 · 右键平移 · 点击部件查看详情
        </div>
      )}
    </div>
  );
}
