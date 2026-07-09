import { useCallback, useMemo, useState } from "react";
import {
  CHALLENGES, gradeConnections, recordAttempt,
  buildInitialProgress, buildPlacementBlueprint,
  buildReferencePlacedComponents, findSnapTarget,
  REFERENCE_SLOT_LAYOUTS, scorePlacedComponents,
} from "../platformLogic.js";
import { getCircuitChallenge } from "../circuit/challengeCircuitModel.js";
import { buildComponentStudyCard } from "../componentStudy.js";
import { beginWireDrag, cancelWireDrag, completeWireDrag, buildConnectionBlueprint, inspectWireTarget } from "../labWiring.js";
import { buildRealtimeDiagnostics } from "../realtimeDiagnostics.js";
import { simulateChallenge } from "../platformLogic.js";

function clampPlacement(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const defaultComponentLabel = "异或门";

function createPlacedComponent(name, x, y, options = {}) {
  return { id: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, displayLabel: options.displayLabel ?? name, sourceIndex: options.sourceIndex ?? null, x, y };
}

export function useLabState({
  progress,
  setProgress,
  activityLog,
  setActivityLog,
  setStatusMessage,
  persistStudentAttempt,
  isMobile,
  challengeRouteMeta,
  challengeControlMeta,
}) {
  const [selectedChallengeId, setSelectedChallengeId] = useState(CHALLENGES[0].id);
  const [connections, setConnections] = useState(["输入A->异或门1", "输入B->异或门1"]);
  const [placedComponents, setPlacedComponents] = useState([]);
  const [expandedComponent, setExpandedComponent] = useState(defaultComponentLabel);
  const [selectedComponent, setSelectedComponent] = useState(defaultComponentLabel);
  const [wireDrag, setWireDrag] = useState(null);
  const [wireHoverEndpoint, setWireHoverEndpoint] = useState(null);
  const [inputState, setInputState] = useState({ a: 1, b: 1, cin: 0, select: 1, op: 0, aNumber: 5, bNumber: 3, address: 100, signedValue: -5 });
  const [simulationStep, setSimulationStep] = useState(0);
  const [feedback, setFeedback] = useState(null);

  // ── Computed values ──
  const currentChallenge = useMemo(() => CHALLENGES.find((c) => c.id === selectedChallengeId) ?? CHALLENGES[0], [selectedChallengeId]);
  const currentCircuitModel = useMemo(() => getCircuitChallenge(currentChallenge.id), [currentChallenge]);
  const connectionBlueprint = useMemo(() => buildConnectionBlueprint(currentChallenge), [currentChallenge]);
  const placementBlueprint = useMemo(() => buildPlacementBlueprint(currentChallenge), [currentChallenge]);
  const placementPreview = useMemo(() => scorePlacedComponents(currentChallenge, placedComponents), [currentChallenge, placedComponents]);
  const labScoring = useMemo(() => ({ connection: gradeConnections(selectedChallengeId, connections), placement: placementPreview }), [selectedChallengeId, connections, placementPreview]);
  const currentRecord = useMemo(() => progress[selectedChallengeId] ?? {}, [progress, selectedChallengeId]);

  const simulation = useMemo(() => simulateChallenge(currentChallenge, connections, inputState), [currentChallenge, connections, inputState]);
  const activeStep = useMemo(() => Math.min(simulationStep, simulation.steps.length - 1), [simulationStep, simulation.steps.length]);
  const realtimeDiagnostics = useMemo(() => buildRealtimeDiagnostics(currentChallenge, connections, labScoring), [currentChallenge, connections, labScoring]);

  const selectedStudyCard = useMemo(() => buildComponentStudyCard(selectedComponent, connections, currentChallenge), [selectedComponent, connections, currentChallenge]);
  const selectedComponentDetail = useMemo(() => {
    const slot = placementBlueprint.find((s) => s.displayLabel === selectedComponent);
    return slot || selectedStudyCard;
  }, [selectedComponent, placementBlueprint, selectedStudyCard]);

  const referenceComponents = useMemo(() => buildReferencePlacedComponents(currentChallenge), [currentChallenge]);
  const wirePreview = useMemo(() => {
    if (!wireDrag) return { tone: "idle", summary: "当前未开始拖线", detail: "按住端点或引脚开始连线。" };
    const target = wireHoverEndpoint ? inspectWireTarget(currentChallenge, wireDrag.startEndpoint, wireHoverEndpoint, connections) : null;
    return { tone: target?.valid ? "valid" : "idle", summary: wireDrag.startEndpoint.label, detail: target?.message ?? "将导线拖到目标端点。" };
  }, [wireDrag, wireHoverEndpoint, currentChallenge, connections]);
  const wirePreviewCopy = wirePreview;
  const wirePreviewStatus = wirePreviewCopy.tone;

  // ── Handlers ──
  function selectChallenge(challengeId) {
    const challenge = CHALLENGES.find((item) => item.id === challengeId);
    if (!challenge) return;
    const nextBlueprint = buildPlacementBlueprint(challenge);
    setSelectedChallengeId(challengeId);
    setConnections(progress[challengeId]?.status === "completed" ? challenge.requiredConnections : []);
    setPlacedComponents(progress[challengeId]?.status === "completed" ? buildReferencePlacedComponents(challenge) : []);
    setExpandedComponent(nextBlueprint[0]?.displayLabel ?? challenge.components[0]?.name ?? "");
    setSelectedComponent(nextBlueprint[0]?.displayLabel ?? challenge.components[0]?.name ?? "");
    setWireDrag(null);
    setWireHoverEndpoint(null);
    setFeedback(null);
    setSimulationStep(0);
    setStatusMessage(`已进入"${challenge.title}"实验。`);
  }

  function handleInputChange(key, value) {
    setInputState((current) => ({ ...current, [key]: value }));
    setSimulationStep(0);
  }

  function runStep() {
    setSimulationStep((step) => (step + 1) % simulation.steps.length);
    setStatusMessage("已推进一帧信号演示。");
  }

  function runAll() {
    setSimulationStep(simulation.steps.length - 1);
    setStatusMessage("动态演示已播放到输出结果。");
  }

  async function submitChallenge() {
    const connectionResult = gradeConnections(selectedChallengeId, connections);
    const placementResult = scorePlacedComponents(currentChallenge, placedComponents);
    const placementErrors = [
      ...placementResult.missingSlots.map((slot) => ({ type: "元件未就位", message: `"${slot.displayLabel}"还没有放到目标槽位"${slot.role}"。` })),
      ...placementResult.misplacedComponents.map((c) => ({ type: "元件摆放偏移", message: `"${c.displayLabel ?? c.name}"还没有对准目标槽位，请继续拖动调整。` })),
    ];
    const result = {
      ...connectionResult, passed: connectionResult.passed && placementResult.passed,
      errors: [...connectionResult.errors, ...placementErrors],
      score: Math.round(connectionResult.score * 0.7 + placementResult.score * 0.3),
      placement: placementResult, elapsedMinutes: currentChallenge.estimatedMinutes,
    };
    setFeedback(result);
    setProgress((cur) => recordAttempt(cur, selectedChallengeId, result));
    setActivityLog((cur) => [`${currentChallenge.title}提交${result.passed ? "通过" : "未通过"}，得分 ${result.score}。`, ...cur.slice(0, 5)]);
    setStatusMessage(result.passed ? `恭喜，${currentChallenge.title}已通过。` : "系统已定位当前结构中的问题。");
    await persistStudentAttempt(selectedChallengeId, result);
  }

  async function handleCircuitFlowResult(result) {
    const normalized = { passed: result.passed, errors: result.structure?.errors ?? [], score: result.score,
      missing: result.structure?.missingEdges ?? [], extraConnections: result.structure?.extraEdges ?? [],
      elapsedMinutes: currentChallenge.estimatedMinutes };
    setFeedback(normalized);
    setProgress((cur) => recordAttempt(cur, selectedChallengeId, normalized));
    setActivityLog((cur) => [`${currentChallenge.title} React Flow 工作台提交${result.passed ? "通过" : "未通过"}，得分 ${result.score}。`, ...cur.slice(0, 5)]);
    setStatusMessage(result.passed ? `恭喜，${currentChallenge.title}已通过。` : "React Flow 工作台已定位当前结构中的问题。");
    await persistStudentAttempt(selectedChallengeId, normalized);
  }

  function resetChallenge() {
    setConnections([]);
    setPlacedComponents([]);
    setWireDrag(null);
    setWireHoverEndpoint(null);
    setFeedback(null);
    setSimulationStep(0);
    setStatusMessage("当前关卡已重置，可以重新连线。");
  }

  function fillReferenceStructure() {
    setConnections(currentChallenge.requiredConnections);
    setPlacedComponents(buildReferencePlacedComponents(currentChallenge));
    setExpandedComponent(placementBlueprint[0]?.displayLabel ?? currentChallenge.components[0]?.name ?? "");
    setSelectedComponent(placementBlueprint[0]?.displayLabel ?? currentChallenge.components[0]?.name ?? "");
    setWireDrag(null);
    setWireHoverEndpoint(null);
    setFeedback(null);
    setStatusMessage("已填入本关参考结构，可以运行演示或提交检测。");
  }

  function handleDrop(event) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/json") || event.dataTransfer.getData("text/plain");
    if (!raw) return;
    let payload = null;
    try { payload = JSON.parse(raw); } catch { payload = { source: "palette", name: raw }; }
    const rect = event.currentTarget.getBoundingClientRect();
    const rX = clampPlacement(((event.clientX - rect.left) / rect.width) * 100, 12, 88);
    const rY = clampPlacement(((event.clientY - rect.top) / rect.height) * 100, 18, 84);
    const snapped = findSnapTarget(placementBlueprint, payload, { x: rX, y: rY });
    const x = snapped?.x ?? rX, y = snapped?.y ?? rY;
    if (payload.source === "canvas" && payload.id) {
      setPlacedComponents((cur) => cur.map((item) => item.id === payload.id ? { ...item, x, y } : item));
      setStatusMessage(snapped ? `"${payload.displayLabel ?? payload.name}"已吸附到槽位"${snapped.role}"。` : "已在画布中重新摆放元件。");
      return;
    }
    if (!payload.name) return;
    const next = createPlacedComponent(payload.name, x, y, { displayLabel: payload.displayLabel ?? payload.name, sourceIndex: payload.sourceIndex });
    setPlacedComponents((cur) => {
      const idx = cur.findIndex((item) => item.sourceIndex === payload.sourceIndex);
      return idx === -1 ? [...cur, next] : cur.map((item, i) => i === idx ? { ...item, x, y, displayLabel: payload.displayLabel ?? item.displayLabel } : item);
    });
    setSelectedComponent(payload.displayLabel ?? payload.name);
    setExpandedComponent(payload.displayLabel ?? payload.name);
    setStatusMessage(snapped ? `已把"${payload.displayLabel ?? payload.name}"放入槽位"${snapped.role}"。` : `已把"${payload.displayLabel ?? payload.name}"放入画布，继续拖到目标槽位会自动吸附。`);
  }

  function handlePaletteDragStart(event, slot) {
    const p = { source: "palette", name: slot.componentName, displayLabel: slot.displayLabel, sourceIndex: slot.sourceIndex };
    event.dataTransfer.setData("application/json", JSON.stringify(p));
    event.dataTransfer.setData("text/plain", slot.displayLabel);
    event.dataTransfer.effectAllowed = "copyMove";
  }

  function handlePlacedComponentDragStart(event, component) {
    event.dataTransfer.setData("application/json", JSON.stringify({ source: "canvas", id: component.id, name: component.name, displayLabel: component.displayLabel, sourceIndex: component.sourceIndex }));
    event.dataTransfer.setData("text/plain", component.displayLabel ?? component.name);
    event.dataTransfer.effectAllowed = "move";
    setSelectedComponent(component.displayLabel ?? component.name);
    setExpandedComponent(component.displayLabel ?? component.name);
  }

  function focusEndpoint(endpoint) {
    setSelectedComponent(endpoint.componentLabel ?? endpoint.componentName ?? endpoint.label);
    if (endpoint.componentLabel ?? endpoint.componentName) setExpandedComponent(endpoint.componentLabel ?? endpoint.componentName);
  }

  function handleWireDragStart(endpoint) {
    focusEndpoint(endpoint);
    setWireDrag(beginWireDrag(endpoint));
    setWireHoverEndpoint(null);
    setStatusMessage(`正在从"${endpoint.label}"拉出导线。`);
  }

  function handleWireDragMove(pointer) {
    setWireDrag((cur) => cur ? { ...cur, pointer } : cur);
  }

  function handleWireHoverChange(endpoint = null) {
    if (!wireDrag) return;
    setWireHoverEndpoint(endpoint);
  }

  function handleWireDragEnd(endpoint = null) {
    if (!wireDrag) return;
    if (endpoint) focusEndpoint(endpoint);
    const result = completeWireDrag(currentChallenge, connections, wireDrag, endpoint);
    setWireDrag(cancelWireDrag());
    setWireHoverEndpoint(null);
    if (!endpoint) { setStatusMessage("已取消本次拖线。"); return; }
    if (wireDrag.startEndpoint.key === endpoint.key) { setStatusMessage("起点和终点不能是同一个端点。"); return; }
    if (result.status === "invalid") { setStatusMessage(`"${wireDrag.startEndpoint.label}"当前不能连接到"${endpoint.label}"。`); return; }
    if (!result.lastConnection) { setStatusMessage("这两个端点不属于本关要求的有效连线。"); return; }
    setConnections(result.connections);
    setFeedback(null);
    setStatusMessage(result.connections.includes(result.lastConnection) ? `已建立连线：${result.lastConnection}` : `已移除连线：${result.lastConnection}`);
  }

  function handleRemoveConnection(connection) {
    setConnections((cur) => cur.filter((item) => item !== connection));
    setFeedback(null);
    setStatusMessage(`已移除连线：${connection}`);
  }

  return {
    selectedChallengeId, setSelectedChallengeId,
    connections, placedComponents, expandedComponent, selectedComponent,
    wireDrag, wireHoverEndpoint, inputState, simulationStep, feedback,
    currentChallenge, currentCircuitModel, connectionBlueprint, placementBlueprint,
    placementPreview, labScoring, currentRecord, simulation, activeStep,
    realtimeDiagnostics, selectedComponentDetail, referenceComponents,
    wirePreviewCopy, wirePreviewStatus,
    selectChallenge, handleInputChange, runStep, runAll,
    submitChallenge, handleCircuitFlowResult, resetChallenge, fillReferenceStructure,
    handleDrop, handlePaletteDragStart, handlePlacedComponentDragStart,
    handleWireDragStart, handleWireDragMove, handleWireHoverChange, handleWireDragEnd,
    handleRemoveConnection,
    setExpandedComponent, setSelectedComponent,
    _progress: progress,
  };
}
