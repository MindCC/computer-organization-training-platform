import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  CaretDown,
  ChartPieSlice,
  CheckCircle,
  ClockCountdown,
  Cpu,
  Flame,
  Flask,
  GearSix,
  House,
  Lifebuoy,
  Notebook,
  Play,
  SealCheck,
  Sparkle,
  Star,
  Target,
  TrendUp,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  CHALLENGES,
  buildInitialProgress,
  gradeConnections,
  recordAttempt,
  simulateChallenge,
  summarizeLearning,
} from "./platformLogic.js";
import {
  buildSignalBadges,
  buildWorkbenchIssueMarkers,
  resolveConnectionTone,
  signalLabelForConnection,
} from "./labWorkbench.js";
import {
  beginWireDrag,
  buildComponentPinLayout,
  buildConnectionBlueprint,
  buildOrthogonalWireRoute,
  buildRenderableConnections,
  cancelWireDrag,
  completeWireDrag,
  formatWireRoutePoints,
  inspectWireTarget,
} from "./labWiring.js";
import {
  buildPlacementBlueprint,
  buildReferencePlacedComponents,
  findSnapTarget,
  REFERENCE_SLOT_LAYOUTS,
  scorePlacedComponents,
} from "./labPlacement.js";
import { buildComponentStudyCard } from "./componentStudy.js";
import { getCircuitChallenge } from "./circuit/challengeCircuitModel.js";
import { api } from "./apiClient.js";
import avatarImage from "./assets/alex-chen-avatar.png";
import labIllustration from "./assets/lab-circuit-illustration.png";
import studyDiagram from "./assets/study-tip-carry-diagram.png";

const CircuitFlowCanvas = lazy(() =>
  import("./components/CircuitFlowCanvas.jsx").then((module) => ({ default: module.CircuitFlowCanvas })),
);

const navItems = [
  { id: "home", label: "课程首页", icon: House },
  { id: "lab", label: "关卡实验", icon: Flask },
  { id: "records", label: "学习记录", icon: ChartPieSlice },
  { id: "notes", label: "学习笔记", icon: Notebook },
  { id: "teacher", label: "\u6559\u5e08\u770b\u677f", icon: ChartPieSlice, role: "teacher" },
];

const initialNotes = [
  {
    id: 1,
    title: "全加器的关键",
    content: "全加器比半加器多了 Cin，Cout 表示是否需要向更高位进位。",
    tag: "全加器",
  },
  {
    id: 2,
    title: "数据通路复盘",
    content: "先确认输入端，再看中间部件，最后检查输出端是否接到目标。",
    tag: "数据流",
  },
];

const challengeRouteMeta = {
  "data-flow": {
    eyebrow: "信号起点",
    summary: "先把输入、通路和输出真正连成一条线。",
    detail: "理解信号从哪里进、经过哪里、最后到哪里。",
    preview: "flow",
    focus: "输入连通",
  },
  "half-adder": {
    eyebrow: "第一块运算砖",
    summary: "第一次把和位与进位拆开来看。",
    detail: "你会看到异或负责和位，与门负责进位。",
    preview: "half",
    focus: "和位 / 进位",
  },
  "full-adder": {
    eyebrow: "进位分叉",
    summary: "把输入进位接进来，电路开始真正变复杂。",
    detail: "这是整条路线里最关键的一关，后面的串联都靠它。",
    preview: "full",
    focus: "Cin / Cout",
  },
  "multi-adder": {
    eyebrow: "级联传播",
    summary: "低位进位会一路推着高位往前算。",
    detail: "你会第一次看到多个模块串起来后的计算节奏。",
    preview: "chain",
    focus: "逐级传递",
  },
  mux: {
    eyebrow: "路径切换",
    summary: "同一条线，什么时候走哪一路由控制信号决定。",
    detail: "选择器会把“连线”变成“有条件地连线”。",
    preview: "mux",
    focus: "选择信号",
  },
  alu: {
    eyebrow: "终点核心",
    summary: "把加法、逻辑和选择控制拼成最小 ALU。",
    detail: "这一关会把前面的模块全部收束成一个运算核心。",
    preview: "alu",
    focus: "结果选择",
  },
};

const challengeControlMeta = {
  "data-flow": [
    { key: "a", label: "输入A", type: "bit" },
  ],
  "half-adder": [
    { key: "a", label: "输入A", type: "bit" },
    { key: "b", label: "输入B", type: "bit" },
  ],
  "full-adder": [
    { key: "a", label: "输入A", type: "bit" },
    { key: "b", label: "输入B", type: "bit" },
    { key: "cin", label: "进位Cin", type: "bit" },
  ],
  "multi-adder": [
    { key: "aNumber", label: "输入组A", type: "stepper", max: 7 },
    { key: "bNumber", label: "输入组B", type: "stepper", max: 7 },
    { key: "cin", label: "初始进位", type: "bit" },
  ],
  mux: [
    { key: "a", label: "数据源0", type: "bit" },
    { key: "b", label: "数据源1", type: "bit" },
    { key: "select", label: "选择信号", type: "stepper", max: 1 },
  ],
  alu: [
    { key: "a", label: "输入A", type: "bit" },
    { key: "b", label: "输入B", type: "bit" },
    { key: "cin", label: "进位Cin", type: "bit" },
    { key: "op", label: "ALU控制位", type: "stepper", max: 3 },
  ],
};

function createDemoProgress() {
  let progress = buildInitialProgress(CHALLENGES);
  for (const challengeId of ["data-flow", "half-adder"]) {
    const challenge = CHALLENGES.find((item) => item.id === challengeId);
    progress = recordAttempt(progress, challengeId, {
      passed: true,
      errors: [],
      score: 100,
      missing: [],
    });
    progress[challengeId].bestScore = 100;
    progress[challengeId].completedAt = challengeId === "data-flow" ? "昨天" : "今天";
    progress[challengeId].attempts = challengeId === "data-flow" ? 1 : 2;
    progress[challengeId].timeSpentMinutes = challengeId === "data-flow" ? 8 : 24;
  }
  return progress;
}

function statusText(status) {
  if (status === "completed") return "已完成";
  if (status === "in-progress") return "进行中";
  return "未解锁";
}

function statusTone(status) {
  if (status === "completed") return "success";
  if (status === "in-progress") return "active";
  return "locked";
}

function clampPlacement(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatEndpointLabel(endpoint) {
  if (!endpoint) return "等待拖到目标端点";

  if (endpoint.componentLabel && endpoint.pin) {
    return `${endpoint.componentLabel} · ${endpoint.pin}`;
  }

  if (endpoint.componentName && endpoint.pin) {
    return `${endpoint.componentName} · ${endpoint.pin}`;
  }

  return endpoint.label;
}

function describeWirePreview(startEndpoint, targetEndpoint, status) {
  if (!startEndpoint) {
    return {
      tone: "idle",
      summary: "当前未开始拖线",
      detail: "按住端点或引脚开始连线。",
    };
  }

  if (!targetEndpoint || status === "empty") {
    return {
      tone: "idle",
      summary: `起点端点：${formatEndpointLabel(startEndpoint)}`,
      detail: "目标端点：等待拖到目标端点",
    };
  }

  if (status === "valid") {
    return {
      tone: "valid",
      summary: `起点端点：${formatEndpointLabel(startEndpoint)}`,
      detail: `目标端点：${formatEndpointLabel(targetEndpoint)} · 可以连接`,
    };
  }

  if (status === "self") {
    return {
      tone: "invalid",
      summary: `起点端点：${formatEndpointLabel(startEndpoint)}`,
      detail: "目标端点：不能与起点是同一个端点",
    };
  }

  return {
    tone: "invalid",
    summary: `起点端点：${formatEndpointLabel(startEndpoint)}`,
    detail: `目标端点：${formatEndpointLabel(targetEndpoint)} · 当前不能连接`,
  };
}

function createPlacedComponent(name, x, y, options = {}) {
  return {
    id: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    displayLabel: options.displayLabel ?? name,
    sourceIndex: options.sourceIndex ?? null,
    x,
    y,
  };
}

function buildExternalAnchorLayout(items = [], side = "input") {
  return items.map((item, index) => ({
    ...item,
    key: `${side}-${item.label}`,
    x: side === "input" ? 8 : 92,
    y: 26 + index * 18,
    side,
  }));
}

const defaultChallenge = CHALLENGES.find((challenge) => challenge.id === "full-adder") ?? CHALLENGES[0];
const defaultPlacementBlueprint = buildPlacementBlueprint(defaultChallenge);
const defaultComponentLabel =
  defaultPlacementBlueprint[0]?.displayLabel ?? defaultChallenge.components[0]?.name ?? "";
const studentImportTemplateHref =
  "data:text/csv;charset=utf-8,%E5%AD%A6%E5%8F%B7,%E5%A7%93%E5%90%8D,%E5%88%9D%E5%A7%8B%E5%AF%86%E7%A0%81%0A2026001,%E6%9D%8E%E5%90%8C%E5%AD%A6,Student123!%0A2026002,%E7%8E%8B%E5%90%8C%E5%AD%A6,Student123!";

function buildTeacherAssistantInsights(classOverview, selectedClass) {
  const students = classOverview?.students ?? [];
  const summary = classOverview?.summary ?? {};
  const atRiskStudents = students
    .filter((studentItem) => studentItem.summary.completionRate < 60 || studentItem.summary.averageScore < 70)
    .sort((left, right) => (
      left.summary.completionRate - right.summary.completionRate
      || left.summary.averageScore - right.summary.averageScore
      || right.summary.totalAttempts - left.summary.totalAttempts
    ))
    .slice(0, 4);

  const challengeStats = CHALLENGES.map((challenge) => {
    const incompleteCount = students.filter((studentItem) => studentItem.progress?.[challenge.id]?.status !== "completed").length;
    const averageScore = students.length > 0
      ? Math.round(students.reduce((total, studentItem) => total + (studentItem.progress?.[challenge.id]?.bestScore ?? 0), 0) / students.length)
      : 0;
    return { challenge, incompleteCount, averageScore };
  }).sort((left, right) => right.incompleteCount - left.incompleteCount || left.averageScore - right.averageScore);

  const focusChallenge = challengeStats[0]?.challenge ?? CHALLENGES[0];
  const hasClass = Boolean(selectedClass);
  const hasStudents = students.length > 0;
  const weakSpot = summary.weakSpot && summary.weakSpot !== "暂无高频错误" ? summary.weakSpot : focusChallenge.title;

  return {
    title: hasClass ? `${selectedClass.name} 智能助教` : "请选择班级",
    overview: hasStudents
      ? `本班 ${students.length} 名学生，平均完成率 ${summary.completionRate ?? 0}%，平均分 ${summary.averageScore ?? 0}。`
      : "当前班级还没有学生数据，先导入学生或等待学生完成一次提交。",
    focus: hasStudents
      ? `下一节课建议聚焦「${focusChallenge.title}」，重点处理「${weakSpot}」。`
      : "导入学生后，助教会自动生成备课重点和分层辅导名单。",
    nextActions: hasStudents ? [
      `课前 5 分钟复盘 ${focusChallenge.title} 的端口和信号走向。`,
      atRiskStudents.length > 0 ? `安排 ${atRiskStudents.length} 名风险学生先完成参考结构，再独立重连一次。` : "全班基础表现稳定，可以增加限时提交或变式测试。",
      "课后导出 CSV，保留本节课完成率、最好分和尝试次数作为课堂记录。",
    ] : [
      "在设置里下载 CSV 模板。",
      "按学号、姓名、初始密码三列导入学生。",
      "让学生完成一次提交后再查看助教建议。",
    ],
    atRiskStudents,
  };
}

export function App() {
  const [auth, setAuth] = useState({ status: "loading", user: null });
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [activeView, setActiveView] = useState("home");
  const [selectedChallengeId, setSelectedChallengeId] = useState("full-adder");
  const [progress, setProgress] = useState(() => buildInitialProgress(CHALLENGES));
  const [connections, setConnections] = useState(["输入A->异或门1", "输入B->异或门1"]);
  const [placedComponents, setPlacedComponents] = useState([]);
  const [expandedComponent, setExpandedComponent] = useState(defaultComponentLabel);
  const [selectedComponent, setSelectedComponent] = useState(defaultComponentLabel);
  const [wireDrag, setWireDrag] = useState(null);
  const [wireHoverEndpoint, setWireHoverEndpoint] = useState(null);
  const [inputState, setInputState] = useState({ a: 1, b: 1, cin: 0, select: 1, op: 0, aNumber: 5, bNumber: 3 });
  const [simulationStep, setSimulationStep] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [activityLog, setActivityLog] = useState([
    "完成半加器实验，得分 100。",
    "数据流基础测验得分 85。",
    "进入全加器实验，当前缺少进位输入。",
  ]);
  const [notes, setNotes] = useState(initialNotes);
  const [noteDraft, setNoteDraft] = useState("全加器实验中，Cin 会影响和位，也会参与 Cout 的判断。");
  const [statusMessage, setStatusMessage] = useState("欢迎回来，今天建议继续完成“全加器”实验。");
  const [showUserPanel, setShowUserPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [student, setStudent] = useState({
    name: "",
    goal: "\u5b8c\u6210\u516d\u4e2a\u8fd0\u7b97\u5668\u5173\u5361",
    mode: "\u5f3a\u5f15\u5bfc\u6a21\u5f0f",
  });
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [selectedTeacherClassId, setSelectedTeacherClassId] = useState(null);
  const [classOverview, setClassOverview] = useState(null);
  const [assistantReport, setAssistantReport] = useState(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [selectedTeacherStudent, setSelectedTeacherStudent] = useState(null);
  const [classNameDraft, setClassNameDraft] = useState("\u8ba1\u7ec4\u4e00\u73ed");
  const [csvImportText, setCsvImportText] = useState("\u5b66\u53f7,\u59d3\u540d,\u521d\u59cb\u5bc6\u7801\n2026001,\u674e\u540c\u5b66,Student123!");
  const [teacherMessage, setTeacherMessage] = useState("");

  const currentChallenge = useMemo(
    () => CHALLENGES.find((challenge) => challenge.id === selectedChallengeId) ?? CHALLENGES[0],
    [selectedChallengeId],
  );
  const currentCircuitModel = useMemo(
    () => getCircuitChallenge(currentChallenge.id),
    [currentChallenge],
  );
  const connectionBlueprint = useMemo(
    () => buildConnectionBlueprint(currentChallenge),
    [currentChallenge],
  );
  const placementBlueprint = useMemo(
    () => buildPlacementBlueprint(currentChallenge),
    [currentChallenge],
  );
  const placementPreview = useMemo(
    () => scorePlacedComponents(currentChallenge, placedComponents),
    [currentChallenge, placedComponents],
  );
  const simulation = useMemo(
    () => simulateChallenge(selectedChallengeId, inputState),
    [selectedChallengeId, inputState],
  );
  const summary = useMemo(() => summarizeLearning(CHALLENGES, progress), [progress]);
  const focusChallenge = useMemo(
    () => CHALLENGES.find((challenge) => progress[challenge.id]?.status === "in-progress") ?? currentChallenge,
    [currentChallenge, progress],
  );
  const upcomingChallenge = useMemo(() => {
    const currentIndex = CHALLENGES.findIndex((challenge) => challenge.id === focusChallenge.id);
    return CHALLENGES[currentIndex + 1] ?? CHALLENGES[currentIndex] ?? CHALLENGES[0];
  }, [focusChallenge]);
  const currentRecord = progress[selectedChallengeId];
  const activeStep = simulation.steps[Math.min(simulationStep, simulation.steps.length - 1)];
  const selectedSlot = placementBlueprint.find((slot) => slot.displayLabel === selectedComponent) ?? null;
  const selectedComponentDetail =
    (selectedSlot ? currentChallenge.components[selectedSlot.sourceIndex] : null)
    ?? currentChallenge.components.find((component) => component.name === selectedComponent)
    ?? null;
  const selectedStudyCard = useMemo(
    () => buildComponentStudyCard(currentChallenge, selectedSlot, selectedComponentDetail),
    [currentChallenge, selectedComponentDetail, selectedSlot],
  );
  const wirePreviewStatus = wireDrag
    ? inspectWireTarget(currentChallenge, wireDrag.startEndpoint, wireHoverEndpoint).status
    : "empty";
  const wirePreviewCopy = useMemo(
    () => describeWirePreview(wireDrag?.startEndpoint ?? null, wireHoverEndpoint, wirePreviewStatus),
    [wireDrag, wireHoverEndpoint, wirePreviewStatus],
  );

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const { user } = await api.me();
        if (cancelled) return;
        setAuth({ status: "authenticated", user });
        await loadRoleData(user);
        if (user.role === "teacher") setActiveView("teacher");
      } catch {
        if (!cancelled) setAuth({ status: "anonymous", user: null });
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, []);

  async function loadRoleData(user = auth.user) {
    if (!user) return;
    if (user.role === "student") {
      const [{ progress: nextProgress }, { notes: nextNotes }] = await Promise.all([api.studentProgress(), api.listNotes()]);
      setProgress(nextProgress);
      setNotes(nextNotes);
      setStudent({
        name: user.displayName,
        goal: user.profile?.goal ?? "\u5b8c\u6210\u516d\u4e2a\u8fd0\u7b97\u5668\u5173\u5361",
        mode: user.profile?.mode ?? "\u5f3a\u5f15\u5bfc\u6a21\u5f0f",
      });
      return;
    }
    if (user.role === "teacher") {
      await refreshTeacherClasses();
    }
  }

  async function refreshTeacherClasses() {
    const { classes } = await api.teacherClasses();
    setTeacherClasses(classes);
    const nextClassId = selectedTeacherClassId ?? classes[0]?.id ?? null;
    setSelectedTeacherClassId(nextClassId);
    if (nextClassId) await refreshClassOverview(nextClassId);
  }

  async function refreshClassOverview(classId = selectedTeacherClassId) {
    if (!classId) {
      setClassOverview(null);
      setSelectedTeacherStudent(null);
      return;
    }
    const overview = await api.classOverview(classId);
    setClassOverview(overview);
    setSelectedTeacherStudent(null);
  }

  async function generateAssistantReport() {
    if (!selectedTeacherClassId) {
      setAssistantError("请先选择班级");
      return;
    }
    setAssistantLoading(true);
    setAssistantError("");
    try {
      const result = await api.assistantReport(selectedTeacherClassId);
      setAssistantReport(result);
    } catch (error) {
      setAssistantError(error.message);
    } finally {
      setAssistantLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const { user } = await api.login(loginForm);
      setAuth({ status: "authenticated", user });
      await loadRoleData(user);
      setActiveView(user.role === "teacher" ? "teacher" : "home");
    } catch (error) {
      setLoginError(error.message);
    }
  }

  async function handleLogout() {
    await api.logout();
    setAuth({ status: "anonymous", user: null });
    setProgress(buildInitialProgress(CHALLENGES));
    setNotes([]);
    setActiveView("home");
  }

  function changeView(view) {
    setActiveView(view);
    setStatusMessage(`已切换到${navItems.find((item) => item.id === view)?.label ?? "当前页面"}。`);
  }

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
    setActiveView("lab");
    setStatusMessage(`已进入“${challenge.title}”实验。`);
  }

  function toggleConnection(connection) {
    setConnections((current) =>
      current.includes(connection)
        ? current.filter((item) => item !== connection)
        : [...current, connection],
    );
    setFeedback(null);
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
      ...placementResult.missingSlots.map((slot) => ({
        type: "元件未就位",
        message: `“${slot.displayLabel}”还没有放到目标槽位“${slot.role}”。`,
      })),
      ...placementResult.misplacedComponents.map((component) => ({
        type: "元件摆放偏移",
        message: `“${component.displayLabel ?? component.name}”还没有对准目标槽位，请继续拖动调整。`,
      })),
    ];
    const result = {
      ...connectionResult,
      passed: connectionResult.passed && placementResult.passed,
      errors: [...connectionResult.errors, ...placementErrors],
      score: Math.round(connectionResult.score * 0.7 + placementResult.score * 0.3),
      placement: placementResult,
      elapsedMinutes: currentChallenge.estimatedMinutes,
    };
    setFeedback(result);
    setProgress((current) => recordAttempt(current, selectedChallengeId, result));
    setActivityLog((current) => [
      `${currentChallenge.title}提交${result.passed ? "通过" : "未通过"}，得分 ${result.score}。`,
      ...current.slice(0, 5),
    ]);
    setStatusMessage(result.passed ? `恭喜，${currentChallenge.title}已通过。` : "系统已定位当前结构中的问题。");
    await persistStudentAttempt(selectedChallengeId, result);
  }

  async function handleCircuitFlowResult(result) {
    const normalizedResult = {
      passed: result.passed,
      errors: result.structure?.errors ?? [],
      score: result.score,
      missing: result.structure?.missingEdges ?? [],
      extraConnections: result.structure?.extraEdges ?? [],
      elapsedMinutes: currentChallenge.estimatedMinutes,
    };

    setFeedback(null);
    setProgress((current) => recordAttempt(current, selectedChallengeId, normalizedResult));
    setActivityLog((current) => [
      currentChallenge.title + " React Flow \u5de5\u4f5c\u53f0\u63d0\u4ea4" + (result.passed ? "\u901a\u8fc7" : "\u672a\u901a\u8fc7") + "\uff0c\u5f97\u5206 " + result.score + "\u3002",
      ...current.slice(0, 5),
    ]);
    setStatusMessage(result.passed ? "\u606d\u559c\uff0c" + currentChallenge.title + "\u5df2\u901a\u8fc7\u3002" : "React Flow \u5de5\u4f5c\u53f0\u5df2\u5b9a\u4f4d\u5f53\u524d\u7ed3\u6784\u4e2d\u7684\u95ee\u9898\u3002");
    await persistStudentAttempt(selectedChallengeId, normalizedResult);
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
    const rawPayload = event.dataTransfer.getData("application/json") || event.dataTransfer.getData("text/plain");
    if (!rawPayload) return;

    let payload = null;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      payload = { source: "palette", name: rawPayload };
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const rawX = clampPlacement(((event.clientX - rect.left) / rect.width) * 100, 12, 88);
    const rawY = clampPlacement(((event.clientY - rect.top) / rect.height) * 100, 18, 84);
    const snappedSlot = findSnapTarget(placementBlueprint, payload, { x: rawX, y: rawY });
    const x = snappedSlot?.x ?? rawX;
    const y = snappedSlot?.y ?? rawY;

    if (payload.source === "canvas" && payload.id) {
      setPlacedComponents((current) =>
        current.map((item) => (item.id === payload.id ? { ...item, x, y } : item)),
      );
      setStatusMessage(
        snappedSlot
          ? `“${payload.displayLabel ?? payload.name}”已吸附到槽位“${snappedSlot.role}”。`
          : "已在画布中重新摆放元件。",
      );
      return;
    }

    if (!payload.name) return;

    const nextComponent = createPlacedComponent(payload.name, x, y, {
      displayLabel: payload.displayLabel ?? payload.name,
      sourceIndex: payload.sourceIndex,
    });

    setPlacedComponents((current) => {
      const existingIndex = current.findIndex((item) => item.sourceIndex === payload.sourceIndex);
      if (existingIndex === -1) return [...current, nextComponent];
      return current.map((item, index) => (
        index === existingIndex
          ? { ...item, x, y, displayLabel: payload.displayLabel ?? item.displayLabel }
          : item
      ));
    });
    setSelectedComponent(payload.displayLabel ?? payload.name);
    setExpandedComponent(payload.displayLabel ?? payload.name);
    setStatusMessage(
      snappedSlot
        ? `已把“${payload.displayLabel ?? payload.name}”放入槽位“${snappedSlot.role}”。`
        : `已把“${payload.displayLabel ?? payload.name}”放入画布，继续拖到目标槽位会自动吸附。`,
    );
  }

  function handlePaletteDragStart(event, componentSlot) {
    const payload = {
      source: "palette",
      name: componentSlot.componentName,
      displayLabel: componentSlot.displayLabel,
      sourceIndex: componentSlot.sourceIndex,
    };
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", componentSlot.displayLabel);
    event.dataTransfer.effectAllowed = "copyMove";
  }

  function handlePlacedComponentDragStart(event, component) {
    event.dataTransfer.setData("application/json", JSON.stringify({
      source: "canvas",
      id: component.id,
      name: component.name,
      displayLabel: component.displayLabel,
      sourceIndex: component.sourceIndex,
    }));
    event.dataTransfer.setData("text/plain", component.displayLabel ?? component.name);
    event.dataTransfer.effectAllowed = "move";
    setSelectedComponent(component.displayLabel ?? component.name);
    setExpandedComponent(component.displayLabel ?? component.name);
  }

  function focusEndpoint(endpoint) {
    setSelectedComponent(endpoint.componentLabel ?? endpoint.componentName ?? endpoint.label);
    if (endpoint.componentLabel ?? endpoint.componentName) {
      setExpandedComponent(endpoint.componentLabel ?? endpoint.componentName);
    }
  }

  function handleWireDragStart(endpoint) {
    focusEndpoint(endpoint);
    setWireDrag(beginWireDrag(endpoint));
    setWireHoverEndpoint(null);
    setStatusMessage(`正在从“${endpoint.label}”拉出导线。`);
  }

  function handleWireDragMove(pointer) {
    setWireDrag((current) => (current ? { ...current, pointer } : current));
  }

  function handleWireHoverChange(endpoint = null) {
    if (!wireDrag) return;
    setWireHoverEndpoint(endpoint);
  }

  function handleWireDragEnd(endpoint = null) {
    if (!wireDrag) return;

    if (endpoint) {
      focusEndpoint(endpoint);
    }

    const result = completeWireDrag(currentChallenge, connections, wireDrag, endpoint);
    setWireDrag(cancelWireDrag());
    setWireHoverEndpoint(null);

    if (!endpoint) {
      setStatusMessage("已取消本次拖线。");
      return;
    }

    if (wireDrag.startEndpoint.key === endpoint.key) {
      setStatusMessage("起点和终点不能是同一个端点。");
      return;
    }

    if (result.status === "invalid") {
      setStatusMessage(`“${wireDrag.startEndpoint.label}”当前不能连接到“${endpoint.label}”。`);
      return;
    }

    if (!result.lastConnection) {
      setStatusMessage("这两个端点不属于本关要求的有效连线。");
      return;
    }

    setConnections(result.connections);
    setFeedback(null);
    setStatusMessage(
      result.connections.includes(result.lastConnection)
        ? `已建立连线：${result.lastConnection}`
        : `已移除连线：${result.lastConnection}`,
    );
  }

  function handleRemoveConnection(connection) {
    setConnections((current) => current.filter((item) => item !== connection));
    setFeedback(null);
    setStatusMessage(`已移除连线：${connection}`);
  }

  async function saveNote() {
    const content = noteDraft.trim();
    if (!content) {
      setStatusMessage("\u7b14\u8bb0\u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a\u3002");
      return;
    }
    try {
      const { note } = await api.createNote({
        title: currentChallenge.shortTitle + "\u590d\u76d8",
        content,
        tag: currentChallenge.shortTitle,
      });
      setNotes((current) => [note, ...current]);
      setNoteDraft("");
      setStatusMessage("\u5b66\u4e60\u7b14\u8bb0\u5df2\u4fdd\u5b58\u5230\u670d\u52a1\u5668\u3002");
    } catch (error) {
      setStatusMessage("\u7b14\u8bb0\u4fdd\u5b58\u5931\u8d25\uff1a" + error.message);
    }
  }

  function updateStudent(key, value) {
    setStudent((current) => ({ ...current, [key]: value }));
  }

  async function persistStudentAttempt(challengeId, result) {
    if (auth.user?.role !== "student") return;
    try {
      const saved = await api.submitAttempt({ challengeId, result });
      setProgress(saved.progress);
    } catch (error) {
      setStatusMessage("\u63d0\u4ea4\u5df2\u5728\u672c\u9875\u8bb0\u5f55\uff0c\u4f46\u540c\u6b65\u670d\u52a1\u5668\u5931\u8d25\uff1a" + error.message);
    }
  }

  async function saveStudentSettings() {
    try {
      const { user } = await api.updateProfile({ displayName: student.name, goal: student.goal, mode: student.mode });
      setAuth((current) => ({ ...current, user }));
      setShowSettings(false);
      setStatusMessage("\u4e2a\u4eba\u8bbe\u7f6e\u5df2\u4fdd\u5b58\u5230\u670d\u52a1\u5668\u3002");
    } catch (error) {
      setStatusMessage("\u4e2a\u4eba\u8bbe\u7f6e\u4fdd\u5b58\u5931\u8d25\uff1a" + error.message);
    }
  }

  async function createTeacherClass() {
    try {
      const { class: createdClass } = await api.createClass({ name: classNameDraft });
      setTeacherMessage("\u73ed\u7ea7\u5df2\u521b\u5efa\uff1a" + createdClass.name);
      setSelectedTeacherClassId(createdClass.id);
      await refreshTeacherClasses();
      await refreshClassOverview(createdClass.id);
    } catch (error) {
      setTeacherMessage("\u521b\u5efa\u73ed\u7ea7\u5931\u8d25\uff1a" + error.message);
    }
  }

  async function importStudentsToClass() {
    if (!selectedTeacherClassId) return;
    try {
      const report = await api.importStudents(selectedTeacherClassId, csvImportText);
      setTeacherMessage("\u5bfc\u5165\u5b8c\u6210\uff1a\u65b0\u589e " + report.imported + "\uff0c\u66f4\u65b0 " + report.updated + "\uff0c\u8df3\u8fc7 " + report.skipped);
      await refreshTeacherClasses();
      await refreshClassOverview(selectedTeacherClassId);
    } catch (error) {
      setTeacherMessage("\u5bfc\u5165\u5931\u8d25\uff1a" + error.message);
    }
  }

  async function openTeacherStudentDetail(studentId) {
    if (!selectedTeacherClassId) return;
    try {
      const { student: detail } = await api.studentDetail(selectedTeacherClassId, studentId);
      setSelectedTeacherStudent(detail);
      setTeacherMessage("");
    } catch (error) {
      setTeacherMessage("\u52a0\u8f7d\u5b66\u751f\u8be6\u60c5\u5931\u8d25\uff1a" + error.message);
    }
  }

  async function resetStudentPassword(studentId) {
    try {
      const result = await api.resetStudentPassword(studentId, "ChangeMe123!");
      setTeacherMessage("\u5bc6\u7801\u5df2\u91cd\u7f6e\u4e3a\uff1a" + result.password);
    } catch (error) {
      setTeacherMessage("\u91cd\u7f6e\u5931\u8d25\uff1a" + error.message);
    }
  }

  if (auth.status === "loading") {
    return <div className="login-screen"><div className="login-card"><strong>{"\u6b63\u5728\u8fde\u63a5\u8bfe\u5802\u670d\u52a1\u5668..."}</strong></div></div>;
  }

  if (auth.status === "anonymous") {
    return renderLogin();
  }

  if (activeView === "lab") {
    return (
      <div className="app-shell lab-mode-shell">
        {renderLabStudioScreen()}
        {showSettings ? renderSettingsModal() : null}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => changeView("home")} type="button">
          <span className="brand-mark"><Cpu size={30} /></span>
          <span>
            <strong>组成原理实训平台</strong>
            <small>运算器闯关 · 动态信号演示 · 自动纠错</small>
          </span>
        </button>

        <div className="topbar-actions">
          {auth.user?.role === "student" ? (<button className="continue-pill" onClick={() => selectChallenge(selectedChallengeId)} type="button">
            <Play size={16} weight="fill" />
            <span>
              <strong>继续实验</strong>
              <small>{currentChallenge.title} · {currentRecord?.bestScore ?? 0} 分</small>
            </span>
          </button>) : null}
          <button
            aria-label="通知"
            className="icon-button"
            onClick={() => setStatusMessage("你有 3 条学习提醒：补看进位动画、完成全加器、整理笔记。")}
            type="button"
          >
            <Bell size={22} />
            <span className="notification-dot">3</span>
          </button>
          <div className="profile-wrap">
            <button className="profile-button" onClick={() => setShowUserPanel((value) => !value)} type="button">
              <img alt="学生头像" src={avatarImage} />
              <span>
                <strong>{auth.user?.displayName ?? "学习档案"}</strong>
                <small>{auth.user?.role === "teacher" ? "教师" : student.mode}</small>
              </span>
              <CaretDown size={18} />
            </button>
            {showUserPanel ? (
              <div className="profile-menu">
                <button onClick={() => setShowSettings(true)} type="button">{auth.user?.role === "teacher" ? "课堂设置" : "个人设置"}</button>
                {auth.user?.role === "student" ? <button onClick={() => changeView("records")} type="button">查看学情</button> : null}
                {auth.user?.role === "student" ? <button onClick={() => changeView("notes")} type="button">打开笔记</button> : null}
                <button onClick={handleLogout} type="button">退出登录</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <nav className="sidebar-nav" aria-label="主导航">
            {navItems.filter((item) => auth.user?.role === "teacher" ? ["home", "teacher"].includes(item.id) : item.id !== "teacher").map(({ id, icon: Icon, label }) => (
              <button
                className={activeView === id ? "nav-item active" : "nav-item"}
                key={id}
                onClick={() => changeView(id)}
                type="button"
              >
                <Icon size={22} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {auth.user?.role === "student" ? (
            <>
              <section className="sidebar-promo">
                <img alt="实验插图" src={labIllustration} />
                <h2>边搭边学，先看懂再通关。</h2>
                <p>每一关都围绕一个关键概念展开，系统会记录尝试、错误和复盘建议。</p>
              </section>

              <div className="sidebar-meta">
                <button className="meta-item" onClick={() => setShowSettings(true)} type="button">
                  <GearSix size={20} />
                  <span>学习设置</span>
                </button>
                <button className="meta-item" onClick={() => setStatusMessage("帮助中心已准备好：建议先看“如何读懂端口”。")} type="button">
                  <Lifebuoy size={20} />
                  <span>帮助支持</span>
                </button>
              </div>
            </>
          ) : null}
        </aside>

        <main className="dashboard">
          <div className="status-banner">
            <Sparkle size={18} />
            <span>{statusMessage}</span>
          </div>

          {activeView === "home" ? renderHome() : null}
          {activeView === "records" ? renderRecords() : null}
          {activeView === "notes" ? renderNotes() : null}
          {activeView === "teacher" ? renderTeacherStudioDashboard() : null}
        </main>
      </div>

      {showSettings ? renderSettingsModal() : null}
    </div>
  );

  function renderLogin() {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleLogin}>
          <span className="eyebrow">{"\u8bfe\u5802\u96c6\u4e2d\u7248"}</span>
          <h1>{"\u7ec4\u6210\u539f\u7406\u5b9e\u8bad\u5e73\u53f0"}</h1>
          <p>{"\u8bf7\u4f7f\u7528\u6559\u5e08\u6216\u5b66\u751f\u8d26\u53f7\u767b\u5f55\uff0c\u5b9e\u9a8c\u8fdb\u5ea6\u5c06\u4fdd\u5b58\u5230\u8bfe\u5802\u670d\u52a1\u5668\u3002"}</p>
          <label className="form-row">
            <span>{"\u8d26\u53f7"}</span>
            <input value={loginForm.username} onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))} />
          </label>
          <label className="form-row">
            <span>{"\u5bc6\u7801"}</span>
            <input type="password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} />
          </label>
          {loginError ? <p className="form-error">{loginError}</p> : null}
          <button className="primary-button" type="submit">{"\u767b\u5f55"}</button>
        </form>
      </div>
    );
  }

  function renderTeacherStudioDashboard() {
    const selectedClass = teacherClasses.find((item) => item.id === selectedTeacherClassId);
    const assistant = buildTeacherAssistantInsights(classOverview, selectedClass);
    const students = classOverview?.students ?? [];

    return (
      <div className="teacher-studio">
        <header className="teacher-studio-header">
          <div>
            <span className="eyebrow">教师数据页</span>
            <h1>班级学情管理</h1>
            <p>集中查看班级进度、学生成绩、提交记录和智能助教建议。</p>
          </div>
          <div className="teacher-studio-actions">
            <button className="ghost-button" onClick={refreshTeacherClasses} type="button">刷新数据</button>
            <button className="primary-button" onClick={() => setShowSettings(true)} type="button">课堂设置</button>
          </div>
        </header>

        <div className="teacher-studio-grid">
          <aside className="teacher-studio-rail">
            <div className="teacher-studio-card">
              <div className="teacher-studio-card-heading">
                <strong>班级列表</strong>
                <span>{teacherClasses.length} 个班</span>
              </div>
              <div className="teacher-class-list">
                {teacherClasses.map((item) => (
                  <button
                    className={item.id === selectedTeacherClassId ? "teacher-class active" : "teacher-class"}
                    key={item.id}
                    onClick={() => {
                      setSelectedTeacherClassId(item.id);
                      setAssistantReport(null);
                      setAssistantError("");
                      refreshClassOverview(item.id);
                    }}
                    type="button"
                  >
                    <strong>{item.name}</strong>
                    <span>{item.studentCount} 名学生</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="teacher-studio-card">
              <div className="teacher-studio-card-heading">
                <strong>创建班级</strong>
              </div>
              <div className="teacher-create-box">
                <label className="form-row">
                  <span>新班级名称</span>
                  <input value={classNameDraft} onChange={(event) => setClassNameDraft(event.target.value)} />
                </label>
                <button className="primary-button" onClick={createTeacherClass} type="button">创建班级</button>
              </div>
              {teacherMessage ? <p className="teacher-message">{teacherMessage}</p> : null}
            </div>
          </aside>

          <section className="teacher-studio-main">
            <div className="teacher-studio-summary">
              <Metric icon={CheckCircle} label="学生数" value={classOverview?.summary.studentCount ?? students.length} />
              <Metric icon={Target} label="平均完成率" value={(classOverview?.summary.completionRate ?? 0) + "%"} />
              <Metric icon={TrendUp} label="平均分" value={classOverview?.summary.averageScore ?? 0} />
              <Metric icon={WarningCircle} label="高频问题" value={classOverview?.summary.weakSpot ?? "暂无数据"} />
            </div>

            <div className="teacher-studio-content">
              <section className="teacher-studio-panel teacher-import-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">学生导入</span>
                    <h2>{selectedClass?.name ?? "请先创建或选择班级"}</h2>
                    <p>粘贴 CSV 内容后导入学生；模板下载已移动到课堂设置。</p>
                  </div>
                  <div className="teacher-action-row">
                    {selectedTeacherClassId ? <a className="ghost-button" href={"/api/teacher/classes/" + selectedTeacherClassId + "/export.csv"}>导出 CSV</a> : null}
                  </div>
                </div>
                <textarea className="teacher-import-box" value={csvImportText} onChange={(event) => setCsvImportText(event.target.value)} />
                <button className="primary-button" disabled={!selectedTeacherClassId} onClick={importStudentsToClass} type="button">导入学生</button>
              </section>

              <section className="teacher-studio-panel teacher-assistant-panel">
                <div className="teacher-assistant-header">
                  <div>
                    <span className="eyebrow">智能助教</span>
                    <h2>{assistant.title}</h2>
                    <p>{assistant.overview}</p>
                  </div>
                  <Sparkle size={26} />
                </div>
                <div className="teacher-assistant-focus">
                  <strong>{assistant.focus}</strong>
                </div>
                <div className="teacher-assistant-actions">
                  {assistant.nextActions.map((item) => (
                    <p key={item}><CheckCircle size={16} weight="fill" /> {item}</p>
                  ))}
                </div>
                <div className="teacher-risk-list">
                  <strong>重点关注学生</strong>
                  {assistant.atRiskStudents.length > 0 ? assistant.atRiskStudents.map((studentItem) => (
                    <button className="teacher-risk-row" key={studentItem.id} onClick={() => openTeacherStudentDetail(studentItem.id)} type="button">
                      <span>{studentItem.displayName}</span>
                      <small>{studentItem.summary.completionRate}% · {studentItem.summary.averageScore} 分 · {studentItem.summary.totalAttempts} 次</small>
                    </button>
                  )) : <p className="empty-state">暂无高风险学生。</p>}
                </div>
              </section>
            </div>

            <section className="teacher-studio-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">学生数据</span>
                  <h2>{selectedClass ? `${selectedClass.name} 学生表现` : "请选择班级"}</h2>
                  <p>展示每名学生的完成率、平均分、尝试次数和最近薄弱点。</p>
                </div>
              </div>
              <div className="record-table teacher-student-table">
                {students.map((studentItem) => (
                  <div className="record-row" key={studentItem.id}>
                    <strong>{studentItem.displayName}</strong>
                    <span>{studentItem.username}</span>
                    <span>{studentItem.summary.completionRate}%</span>
                    <span>{studentItem.summary.averageScore} 分</span>
                    <span>{studentItem.summary.totalAttempts} 次</span>
                    <small>{studentItem.summary.weakSpot}</small>
                    <div className="teacher-row-actions">
                      <button className="ghost-button" onClick={() => openTeacherStudentDetail(studentItem.id)} type="button">查看详情</button>
                      <button className="ghost-button" onClick={() => resetStudentPassword(studentItem.id)} type="button">重置密码</button>
                    </div>
                  </div>
                ))}
                {students.length === 0 ? <p className="empty-state">暂无学生数据。请先导入学生，或等待学生完成提交。</p> : null}
              </div>
            </section>

            {selectedTeacherStudent ? (
              <section className="teacher-studio-panel teacher-detail-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">学生详情</span>
                    <h2>{selectedTeacherStudent.displayName}</h2>
                    <p>{selectedTeacherStudent.username} · {selectedTeacherStudent.className}</p>
                  </div>
                  <button className="ghost-button" onClick={() => setSelectedTeacherStudent(null)} type="button">关闭</button>
                </div>
                <div className="teacher-detail-grid">
                  <div>
                    <h3>逐关最佳成绩</h3>
                    <div className="teacher-progress-list">
                      {CHALLENGES.map((challenge) => {
                        const record = selectedTeacherStudent.progress?.[challenge.id];
                        return (
                          <div className="teacher-progress-row" key={challenge.id}>
                            <strong>{challenge.title}</strong>
                            <span>{statusText(record?.status)} · {record?.bestScore ?? 0} 分 · {record?.attempts ?? 0} 次</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h3>最近提交</h3>
                    <div className="teacher-attempt-list">
                      {(selectedTeacherStudent.attempts ?? []).slice(0, 8).map((attempt) => (
                        <div className={attempt.passed ? "teacher-attempt passed" : "teacher-attempt failed"} key={attempt.id}>
                          <strong>{CHALLENGES.find((challenge) => challenge.id === attempt.challengeId)?.title ?? attempt.challengeId}</strong>
                          <span>{attempt.score} 分 · {attempt.passed ? "通过" : "未通过"}</span>
                          <small>{attempt.errors?.length ? attempt.errors.join(" / ") : "暂无错误"}</small>
                        </div>
                      ))}
                      {selectedTeacherStudent.attempts?.length ? null : <p className="empty-state">暂无提交记录</p>}
                    </div>
                  </div>
                  <div>
                    <h3>学生笔记</h3>
                    <div className="teacher-note-list">
                      {(selectedTeacherStudent.notes ?? []).slice(0, 5).map((note) => (
                        <article className="teacher-note" key={note.id}>
                          <strong>{note.title}</strong>
                          <p>{note.content}</p>
                        </article>
                      ))}
                      {selectedTeacherStudent.notes?.length ? null : <p className="empty-state">暂无笔记</p>}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  function renderTeacherDashboard() {
    const selectedClass = teacherClasses.find((item) => item.id === selectedTeacherClassId);
    return (
      <div className="teacher-layout">
        <section className="section-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{"\u6559\u5e08\u770b\u677f"}</span>
              <h1>{"\u73ed\u7ea7\u5b66\u60c5\u7ba1\u7406"}</h1>
              <p>{"\u521b\u5efa\u73ed\u7ea7\u3001CSV \u5bfc\u5165\u5b66\u751f\u3001\u67e5\u770b\u5b8c\u6210\u7387\u5e76\u5bfc\u51fa\u6210\u7ee9\u3002"}</p>
            </div>
            <button className="ghost-button" onClick={refreshTeacherClasses} type="button">{"\u5237\u65b0"}</button>
          </div>
          <div className="teacher-tools">
            <label className="form-row">
              <span>{"\u65b0\u73ed\u7ea7\u540d\u79f0"}</span>
              <input value={classNameDraft} onChange={(event) => setClassNameDraft(event.target.value)} />
            </label>
            <button className="primary-button" onClick={createTeacherClass} type="button">{"\u521b\u5efa\u73ed\u7ea7"}</button>
          </div>
          <div className="teacher-class-list">
            {teacherClasses.map((item) => (
              <button
                className={item.id === selectedTeacherClassId ? "teacher-class active" : "teacher-class"}
                key={item.id}
                onClick={() => {
                  setSelectedTeacherClassId(item.id);
                  setAssistantReport(null);
                  setAssistantError("");
                  refreshClassOverview(item.id);
                }}
                type="button"
              >
                <strong>{item.name}</strong>
                <span>{item.studentCount} {"\u540d\u5b66\u751f"}</span>
              </button>
            ))}
          </div>
          {teacherMessage ? <p className="teacher-message">{teacherMessage}</p> : null}
        </section>

        <section className="section-panel">
          <div className="section-heading">
            <div>
              <h2>{selectedClass?.name ?? "请先创建或选择班级"}</h2>
              <p>CSV 格式：学号,姓名,初始密码</p>
            </div>
            <div className="teacher-action-row">
              <a className="ghost-button" download="student-import-template.csv" href={studentImportTemplateHref}>下载导入模板</a>
              {selectedTeacherClassId ? <a className="ghost-button" href={"/api/teacher/classes/" + selectedTeacherClassId + "/export.csv"}>导出 CSV</a> : null}
            </div>
          </div>
          <textarea className="teacher-import-box" value={csvImportText} onChange={(event) => setCsvImportText(event.target.value)} />
          <button className="primary-button" disabled={!selectedTeacherClassId} onClick={importStudentsToClass} type="button">导入学生</button>
        </section>

        <section className="section-panel">
          <div className="metric-grid">
            <Metric icon={CheckCircle} label="学生数" value={classOverview?.summary.studentCount ?? 0} />
            <Metric icon={Target} label="平均完成率" value={(classOverview?.summary.completionRate ?? 0) + "%"} />
            <Metric icon={TrendUp} label="平均分" value={classOverview?.summary.averageScore ?? 0} />
            <Metric icon={WarningCircle} label="高频问题" value={classOverview?.summary.weakSpot ?? "暂无数据"} />
          </div>
          <div className="record-table teacher-student-table">
            {(classOverview?.students ?? []).map((studentItem) => (
              <div className="record-row" key={studentItem.id}>
                <strong>{studentItem.displayName}</strong>
                <span>{studentItem.username}</span>
                <span>{studentItem.summary.completionRate}%</span>
                <span>{studentItem.summary.averageScore} 分</span>
                <div className="teacher-row-actions">
                  <button className="ghost-button" onClick={() => openTeacherStudentDetail(studentItem.id)} type="button">查看详情</button>
                  <button className="ghost-button" onClick={() => resetStudentPassword(studentItem.id)} type="button">重置密码</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {selectedTeacherStudent ? (
          <section className="section-panel teacher-detail-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">学生详情</span>
                <h2>{selectedTeacherStudent.displayName}</h2>
                <p>{selectedTeacherStudent.username} · {selectedTeacherStudent.className}</p>
              </div>
              <button className="ghost-button" onClick={() => setSelectedTeacherStudent(null)} type="button">关闭</button>
            </div>
            <div className="teacher-detail-grid">
              <div>
                <h3>逐关最佳成绩</h3>
                <div className="teacher-progress-list">
                  {CHALLENGES.map((challenge) => {
                    const record = selectedTeacherStudent.progress?.[challenge.id];
                    return (
                      <div className="teacher-progress-row" key={challenge.id}>
                        <strong>{challenge.title}</strong>
                        <span>{statusText(record?.status)} · {record?.bestScore ?? 0} 分 · {record?.attempts ?? 0} 次</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h3>最近提交</h3>
                <div className="teacher-attempt-list">
                  {(selectedTeacherStudent.attempts ?? []).slice(0, 8).map((attempt) => (
                    <div className={attempt.passed ? "teacher-attempt passed" : "teacher-attempt failed"} key={attempt.id}>
                      <strong>{CHALLENGES.find((challenge) => challenge.id === attempt.challengeId)?.title ?? attempt.challengeId}</strong>
                      <span>{attempt.score} 分 · {attempt.passed ? "通过" : "未通过"}</span>
                      <small>{attempt.errors?.length ? attempt.errors.join(" / ") : "暂无错误"}</small>
                    </div>
                  ))}
                  {selectedTeacherStudent.attempts?.length ? null : <p className="empty-state">暂无提交记录</p>}
                </div>
              </div>
              <div>
                <h3>学生笔记</h3>
                <div className="teacher-note-list">
                  {(selectedTeacherStudent.notes ?? []).slice(0, 5).map((note) => (
                    <article className="teacher-note" key={note.id}>
                      <strong>{note.title}</strong>
                      <p>{note.content}</p>
                    </article>
                  ))}
                  {selectedTeacherStudent.notes?.length ? null : <p className="empty-state">暂无笔记</p>}
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderHome() {
    return (
      <div className="home-layout">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">今日学习</span>
            <h1>从输入、进位到 ALU，按路线把运算器搭起来。</h1>
            <p>这不是六张长得差不多的课程卡，而是一条正在延伸的运算器装配线。沿着信号如何进入、分叉、传播和切换的顺序往前走，学生会更容易把每一关和整个计算过程连起来。</p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => selectChallenge(focusChallenge.id)} type="button">
                <Play size={18} weight="fill" />
                从当前关卡继续
              </button>
              <button className="ghost-button" onClick={() => changeView("records")} type="button">
                查看学习记录
              </button>
            </div>
            <div className="hero-badges">
              <span>6 个核心关卡</span>
              <span>动态信号演示</span>
              <span>自动纠错反馈</span>
            </div>
          </div>
          <div className="hero-module">
            <span>当前正在搭建</span>
            <strong>{focusChallenge.title}</strong>
            <p>{challengeRouteMeta[focusChallenge.id]?.detail ?? focusChallenge.objective}</p>
            <div className="progress-bar"><span style={{ width: `${summary.completionRate}%` }} /></div>
            <small>路线进度 {summary.completionRate}% · 下一站 {upcomingChallenge.title}</small>
            <div className="hero-module-stack">
              <div>
                <span>当前焦点</span>
                <strong>{challengeRouteMeta[focusChallenge.id]?.focus ?? "核心结构"}</strong>
              </div>
              <div>
                <span>本周目标</span>
                <strong>{student.goal}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="metric-grid">
          <Metric icon={CheckCircle} label="已完成关卡" value={`${summary.completed}/${summary.totalChallenges}`} />
          <Metric icon={Target} label="平均得分" value={`${summary.averageScore}分`} />
          <Metric icon={Flame} label="累计尝试" value={`${summary.totalAttempts}次`} />
          <Metric icon={WarningCircle} label="当前薄弱点" value={summary.weakSpot} />
        </section>

        <section className="section-panel">
          <div className="section-heading">
            <div>
              <h2>运算器闯关路径</h2>
              <p>把每一关看成运算器上的一个功能模块，顺着信号路线逐步装起来。</p>
            </div>
          </div>
          <div className="route-board">
            {CHALLENGES.map((challenge, index) => {
              const record = progress[challenge.id];
              const routeMeta = challengeRouteMeta[challenge.id];
              return (
                <div className="route-segment" key={challenge.id}>
                  <button
                    className={`route-node ${routeMeta.preview} ${statusTone(record.status)} ${challenge.id === selectedChallengeId ? "selected" : ""}`}
                    onClick={() => selectChallenge(challenge.id)}
                    type="button"
                  >
                    <div className="route-node-top">
                      <span className="route-chip">{routeMeta.eyebrow}</span>
                      <span className="route-step">0{index + 1}</span>
                    </div>
                    <RoutePreview kind={routeMeta.preview} />
                    <strong>{challenge.title}</strong>
                    <p>{routeMeta.summary}</p>
                    <div className="route-node-meta">
                      <span>{routeMeta.focus}</span>
                      <small>{record.attempts} 次尝试 · {record.bestScore} 分</small>
                    </div>
                    <footer>
                      <span>{statusText(record.status)}</span>
                      <small>{challenge.estimatedMinutes} 分钟</small>
                    </footer>
                  </button>
                  {index < CHALLENGES.length - 1 ? (
                    <div className="route-connector" aria-hidden="true">
                      <span />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="route-callout">
            <strong>怎么看这条路线</strong>
            <p>每一块模块都对应一个实际电路问题：先让信号走通，再看和位/进位，再把进位串联起来，最后引入选择控制和 ALU 汇总。</p>
          </div>
        </section>

        <section className="two-column">
          <article className="section-panel">
            <div className="section-heading">
              <h2>推荐下一步</h2>
              <Star size={22} weight="fill" />
            </div>
            <div className="recommend-card">
              <strong>{focusChallenge.title}还差最后一块关键结构</strong>
              <p>{challengeRouteMeta[focusChallenge.id]?.detail ?? focusChallenge.objective}。先点进这一关，观察端口和路径，再补全缺失连线。</p>
              <button className="primary-button" onClick={() => selectChallenge(focusChallenge.id)} type="button">继续当前关卡</button>
            </div>
          </article>

          <article className="section-panel">
            <div className="section-heading">
              <h2>学生如何看懂这张图</h2>
              <Cpu size={22} weight="fill" />
            </div>
            <div className="guide-list">
              {[
                "先看模块名字，知道这一关要解决的是数据流、进位还是选择控制。",
                "再看中间的小电路缩略图，理解这一关的信号会怎么走。",
                "最后点进关卡做实验，画布里的结构会和路线图保持同一套认知。",
              ].map((item, index) => (
                <div className="guide-row" key={item}>
                  <span>{index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    );
  }

  function renderLabStudioScreen() {
    const currentIndex = CHALLENGES.findIndex((challenge) => challenge.id === currentChallenge.id);
    const routeMeta = challengeRouteMeta[currentChallenge.id] ?? {};
    const requiredEdgeCount = currentCircuitModel?.requiredEdges.length ?? currentChallenge.requiredConnections.length;
    const testCaseCount = currentCircuitModel?.testCases.length ?? 0;
    const selectedRecordStatus = statusText(currentRecord?.status ?? "not-started");

    return (
      <div className="lab-studio">
        <header className="lab-studio-header">
          <div className="lab-studio-brand">
            <button className="lab-studio-icon-button" onClick={() => changeView("home")} type="button" aria-label="返回课程首页">
              <ArrowLeft size={19} />
            </button>
            <span className="lab-studio-mark"><Cpu size={24} /></span>
            <div>
              <strong>电路实验室</strong>
              <small>计算机组成原理实训平台</small>
            </div>
          </div>

          <div className="lab-studio-current">
            <span>当前挑战 · {currentIndex + 1} / {CHALLENGES.length}</span>
            <strong>{currentChallenge.title}</strong>
            <em>{selectedRecordStatus}</em>
          </div>

          <div className="lab-studio-score">
            <span>得分</span>
            <strong>{currentRecord?.bestScore ?? 0}</strong>
            <small>/ 100</small>
          </div>

          <div className="lab-studio-user">
            <span>{student.name}</span>
            <button className="lab-studio-icon-button" onClick={() => setShowSettings(true)} type="button" aria-label="打开个人设置">
              <GearSix size={19} />
            </button>
          </div>
        </header>

        <main className="lab-studio-grid">
          <aside className="lab-studio-route" aria-label="挑战路径">
            <div className="lab-studio-route-title">
              <strong>挑战路径</strong>
              <span>共 {CHALLENGES.length} 关</span>
            </div>

            <div className="lab-studio-stepper">
              {CHALLENGES.map((challenge, index) => {
                const record = progress[challenge.id];
                const meta = challengeRouteMeta[challenge.id] ?? {};
                const isSelected = challenge.id === selectedChallengeId;
                return (
                  <button
                    className={`lab-studio-step ${statusTone(record?.status ?? "not-started")} ${isSelected ? "selected" : ""}`}
                    key={challenge.id}
                    onClick={() => selectChallenge(challenge.id)}
                    type="button"
                  >
                    <span className="lab-studio-step-number">{index + 1}</span>
                    <span className="lab-studio-step-copy">
                      <strong>{challenge.title}</strong>
                      <small>{meta.focus ?? challenge.shortTitle}</small>
                    </span>
                    <span className="lab-studio-step-score">{record?.bestScore ?? 0} / 100</span>
                  </button>
                );
              })}
            </div>

            <section className="lab-studio-hint">
              <Sparkle size={18} />
              <strong>学习提示</strong>
              <p>{routeMeta.detail ?? currentChallenge.objective}</p>
            </section>
          </aside>

          <section className="lab-studio-workspace">
            <div className="lab-studio-controls">
              <div>
                <span className="eyebrow">主画布</span>
                <h1>{currentChallenge.title}</h1>
                <p>{labDescription(currentChallenge.id)}</p>
              </div>
              <div className="lab-studio-actionbar">
                <button onClick={runStep} type="button">
                  <Play size={17} weight="fill" />
                  单步执行
                </button>
                <button onClick={runAll} type="button">
                  <Flame size={17} weight="fill" />
                  自动运行
                </button>
              </div>
            </div>

            <div className="lab-studio-inputs">
              {(challengeControlMeta[currentChallenge.id] ?? []).map((control) => (
                control.type === "bit" ? (
                  <Toggle
                    key={control.key}
                    label={control.label}
                    value={inputState[control.key]}
                    onChange={(value) => handleInputChange(control.key, value)}
                  />
                ) : (
                  <Stepper
                    key={control.key}
                    label={control.label}
                    value={inputState[control.key]}
                    max={control.max}
                    onChange={(value) => handleInputChange(control.key, value)}
                  />
                )
              ))}
            </div>

            <div className="lab-studio-canvas-shell">
              {currentCircuitModel ? (
                <Suspense fallback={<div className="flow-loading">正在加载 React Flow 工作台...</div>}>
                  <CircuitFlowCanvas
                    key={currentCircuitModel.id}
                    model={currentCircuitModel}
                    onResult={handleCircuitFlowResult}
                  />
                </Suspense>
              ) : (
                <div className="lab-stage-layout legacy">
                  <aside className="lab-palette-panel">
                    <div className="lab-panel-heading">
                      <strong>元件区</strong>
                      <small>拖动元件到目标槽位，或点击参考结构快速对照。</small>
                    </div>
                    <div className="component-palette">
                      {placementBlueprint.map((componentSlot) => (
                        <button
                          draggable
                          className="component-chip"
                          key={componentSlot.id}
                          onClick={() => {
                            setSelectedComponent(componentSlot.displayLabel);
                            setExpandedComponent(componentSlot.displayLabel);
                          }}
                          onDragStart={(event) => handlePaletteDragStart(event, componentSlot)}
                          type="button"
                        >
                          <Cpu size={18} />
                          <span>{componentSlot.displayLabel}</span>
                          <small>{componentSlot.role}</small>
                        </button>
                      ))}
                    </div>
                    <div className="lab-actions">
                      <button className="primary-button" onClick={submitChallenge} type="button">提交检测</button>
                      <button className="ghost-button" onClick={resetChallenge} type="button">重置本关</button>
                      <button className="ghost-button" onClick={fillReferenceStructure} type="button">查看参考结构</button>
                    </div>
                  </aside>
                  <section className="lab-stage-panel">
                    <div className="circuit-canvas" onDragOver={(event) => event.preventDefault()}>
                      <ChallengeCanvas
                        activeStep={activeStep}
                        challenge={currentChallenge}
                        challengeId={currentChallenge.id}
                        connectionBlueprint={connectionBlueprint}
                        connections={connections}
                        expandedComponent={expandedComponent}
                        feedback={feedback}
                        inputState={inputState}
                        onBoardDragOver={(event) => event.preventDefault()}
                        onBoardDrop={handleDrop}
                        onPlacedComponentDragStart={handlePlacedComponentDragStart}
                        onRemoveConnection={handleRemoveConnection}
                        outputText={formatOutputs(simulation.outputs)}
                        placementBlueprint={placementBlueprint}
                        placementPreview={placementPreview}
                        placedComponents={placedComponents}
                        selectedComponent={selectedComponent}
                        setExpandedComponent={setExpandedComponent}
                        setSelectedComponent={setSelectedComponent}
                        simulation={simulation}
                        simulationStep={simulationStep}
                        wireDrag={wireDrag}
                        wireHoverEndpoint={wireHoverEndpoint}
                        onWireDragEnd={handleWireDragEnd}
                        onWireHoverChange={handleWireHoverChange}
                        onWireDragMove={handleWireDragMove}
                        onWireDragStart={handleWireDragStart}
                        wirePreviewCopy={wirePreviewCopy}
                        wirePreviewStatus={wirePreviewStatus}
                      />
                    </div>
                  </section>
                </div>
              )}
            </div>

            <div className="lab-studio-inspector">
              <section>
                <span className="eyebrow">元件属性</span>
                <strong>{selectedComponent}</strong>
                <p>{selectedComponentDetail?.description ?? "选择一个元件查看端口、职责和信号走向。"}</p>
              </section>
              <section>
                <span className="eyebrow">实时状态</span>
                <strong>{statusMessage}</strong>
                <p>必要连线 {requiredEdgeCount} 条 · 测试用例 {testCaseCount || currentChallenge.requiredConnections.length} 组 · 最近得分 {currentRecord?.bestScore ?? 0}</p>
              </section>
              <section>
                <span className="eyebrow">检测反馈</span>
                {feedback ? (
                  feedback.passed ? (
                    <p className="lab-studio-feedback passed"><SealCheck size={18} weight="fill" /> 本关通过，记录已保存。</p>
                  ) : (
                    <p className="lab-studio-feedback failed"><WarningCircle size={18} weight="fill" /> 发现 {feedback.errors.length} 类问题，请按提示修正。</p>
                  )
                ) : (
                  <p className="lab-studio-feedback neutral"><Target size={18} /> 等待提交检测。</p>
                )}
              </section>
            </div>
          </section>
        </main>
      </div>
    );
  }

  function renderLabScreen() {
    return (
      <div className="lab-screen">
        <header className="lab-screen-topbar">
          <div className="lab-screen-leading">
            <button className="lab-return-button" onClick={() => changeView("home")} type="button">
              <ArrowLeft size={18} />
              返回课程首页
            </button>
            <div className="lab-screen-title">
              <span className="eyebrow">沉浸式实验页</span>
              <strong>{currentChallenge.title}</strong>
              <p>{challengeRouteMeta[currentChallenge.id]?.detail ?? currentChallenge.objective}</p>
            </div>
          </div>

          <div className="lab-screen-meta">
            <div className="lab-meta-card">
              <span>当前目标</span>
              <strong>{challengeRouteMeta[currentChallenge.id]?.focus ?? "结构搭建"}</strong>
            </div>
            <div className="lab-meta-card">
              <span>最佳得分</span>
              <strong>{currentRecord?.bestScore ?? 0} 分</strong>
            </div>
          </div>
        </header>

        <div className="lab-status-banner">
          <Sparkle size={18} />
          <span>{statusMessage}</span>
        </div>

        <div className="lab-screen-body">
          <section className="lab-main-panel">
            <div className="lab-main-header">
              <div>
                <span className="eyebrow">可视化实验台</span>
                <h1>{currentChallenge.title}</h1>
                <p>{labDescription(currentChallenge.id)}</p>
              </div>
              <div className="run-controls">
                <button onClick={runStep} type="button">单步演示</button>
                <button onClick={runAll} type="button">连续演示</button>
              </div>
            </div>

            <div className="input-board">
              {(challengeControlMeta[currentChallenge.id] ?? []).map((control) => (
                control.type === "bit" ? (
                  <Toggle
                    key={control.key}
                    label={control.label}
                    value={inputState[control.key]}
                    onChange={(value) => handleInputChange(control.key, value)}
                  />
                ) : (
                  <Stepper
                    key={control.key}
                    label={control.label}
                    value={inputState[control.key]}
                    max={control.max}
                    onChange={(value) => handleInputChange(control.key, value)}
                  />
                )
              ))}
            </div>

            <div className="lab-stage-layout">
              <aside className="lab-palette-panel">
                {currentCircuitModel ? (
                  <>
                    <div className="lab-panel-heading">
                      <strong>{"React Flow \u5de5\u4f5c\u53f0"}</strong>
                      <small>{"\u76f4\u63a5\u62d6\u52a8\u5143\u4ef6\u7aef\u53e3\u8fde\u7ebf\uff0cReact Flow \u5904\u7406\u7f29\u653e\u3001\u62d6\u62fd\u548c\u9009\u4e2d\u72b6\u6001\u3002"}</small>
                    </div>

                    <div className="placement-status">
                      <strong>{"\u7ed3\u6784\u89c4\u6a21"}</strong>
                      <p>{currentCircuitModel.nodes.length} {"\u4e2a\u5143\u4ef6 /"} {currentCircuitModel.requiredEdges.length} {"\u6761\u5fc5\u8981\u8fde\u7ebf"}</p>
                      <small>{currentCircuitModel.testCases.length} {"\u7ec4\u7ec4\u5408\u903b\u8f91\u6d4b\u4f8b\u4f1a\u968f\u63d0\u4ea4\u4e00\u8d77\u6821\u9a8c\u3002"}</small>
                    </div>

                    <div className="wiring-hint">
                      <strong>{"\u8fde\u7ebf\u65b9\u5f0f"}</strong>
                      <p>{"\u4ece\u53f3\u4fa7\u8f93\u51fa\u7aef\u53e3\u62d6\u5230\u5de6\u4fa7\u8f93\u5165\u7aef\u53e3\uff1b\u9009\u4e2d\u5bfc\u7ebf\u540e\u53ef\u7528\u5de5\u4f5c\u53f0\u6309\u94ae\u5220\u9664\u3002"}</p>
                      <small>{"\u53ef\u5148\u70b9\u51fb\u586b\u5165\u53c2\u8003\u7ed3\u6784\uff0c\u518d\u89c2\u5bdf\u7aef\u53e3\u8fde\u63a5\u5173\u7cfb\u3002"}</small>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="lab-panel-heading">
                      <strong>{"\u5143\u4ef6\u533a"}</strong>
                      <small>{"\u6bcf\u4e2a\u5143\u4ef6\u90fd\u6709\u56fa\u5b9a\u76ee\u6807\u69fd\u4f4d\uff0c\u62d6\u8fd1\u540e\u4f1a\u81ea\u52a8\u5438\u9644"}</small>
                    </div>
                    <div className="component-palette">
                      {placementBlueprint.map((componentSlot) => (
                        <button
                          draggable
                          className="component-chip"
                          key={componentSlot.id}
                          onClick={() => {
                            setSelectedComponent(componentSlot.displayLabel);
                            setExpandedComponent(componentSlot.displayLabel);
                          }}
                          onDragStart={(event) => handlePaletteDragStart(event, componentSlot)}
                          type="button"
                        >
                          <Cpu size={18} />
                          <span>{componentSlot.displayLabel}</span>
                          <small>{componentSlot.role}</small>
                        </button>
                      ))}
                    </div>

                    <div className="wiring-hint">
                      <strong>{"\u8fde\u7ebf\u65b9\u5f0f"}</strong>
                      <p>{"\u6309\u4f4f\u4e00\u4e2a\u8f93\u5165\u7aef\u3001\u8f93\u51fa\u7aef\u6216\u5143\u4ef6\u5f15\u811a\u62d6\u51fa\u5bfc\u7ebf\uff0c\u518d\u677e\u624b\u63a5\u5230\u76ee\u6807\u7aef\u70b9\uff1b\u91cd\u590d\u540c\u4e00\u5bf9\u5408\u6cd5\u7aef\u70b9\u4f1a\u79fb\u9664\u8fde\u7ebf\u3002"}</p>
                      <small>{wireDrag ? "\u5f53\u524d\u8d77\u70b9\uff1a" + wireDrag.startEndpoint.label : "\u5f53\u524d\u672a\u5f00\u59cb\u62d6\u7ebf"}</small>
                    </div>

                    <div className="placement-status">
                      <strong>{"\u5e03\u5c40\u8fdb\u5ea6"}</strong>
                      <p>{placementPreview.matchedSlotIds.length}/{placementBlueprint.length} {"\u4e2a\u5143\u4ef6\u5df2\u7ecf\u5bf9\u51c6\u69fd\u4f4d"}</p>
                      <small>{placementPreview.missingSlots.length > 0 ? "\u8fd8\u5dee " + placementPreview.missingSlots.length + " \u4e2a\u69fd\u4f4d\u672a\u5b8c\u6210" : "\u6240\u6709\u5143\u4ef6\u90fd\u5df2\u5c31\u4f4d"}</small>
                    </div>

                    <div className="lab-actions">
                      <button className="primary-button" onClick={submitChallenge} type="button">{"\u63d0\u4ea4\u68c0\u6d4b"}</button>
                      <button className="ghost-button" onClick={resetChallenge} type="button">{"\u91cd\u7f6e\u672c\u5173"}</button>
                      <button className="ghost-button" onClick={fillReferenceStructure} type="button">{"\u67e5\u770b\u53c2\u8003\u7ed3\u6784"}</button>
                    </div>
                  </>
                )}
              </aside>

              <section className="lab-stage-panel">
                <div
                  className="circuit-canvas"
                  onDragOver={(event) => event.preventDefault()}
                >
                  {currentCircuitModel ? (
                    <Suspense fallback={<div className="flow-loading">{"\u6b63\u5728\u52a0\u8f7d React Flow \u5de5\u4f5c\u53f0..."}</div>}>
                      <CircuitFlowCanvas
                        key={currentCircuitModel.id}
                        model={currentCircuitModel}
                        onResult={handleCircuitFlowResult}
                      />
                    </Suspense>
                  ) : (
                    <ChallengeCanvas
                      activeStep={activeStep}
                      challenge={currentChallenge}
                      challengeId={currentChallenge.id}
                      connectionBlueprint={connectionBlueprint}
                      connections={connections}
                      expandedComponent={expandedComponent}
                      feedback={feedback}
                      inputState={inputState}
                      onBoardDragOver={(event) => event.preventDefault()}
                      onBoardDrop={handleDrop}
                      onPlacedComponentDragStart={handlePlacedComponentDragStart}
                      onRemoveConnection={handleRemoveConnection}
                      outputText={formatOutputs(simulation.outputs)}
                      placementBlueprint={placementBlueprint}
                      placementPreview={placementPreview}
                      placedComponents={placedComponents}
                      selectedComponent={selectedComponent}
                      setExpandedComponent={setExpandedComponent}
                      setSelectedComponent={setSelectedComponent}
                      simulation={simulation}
                      simulationStep={simulationStep}
                      wireDrag={wireDrag}
                      wireHoverEndpoint={wireHoverEndpoint}
                      onWireDragEnd={handleWireDragEnd}
                      onWireHoverChange={handleWireHoverChange}
                      onWireDragMove={handleWireDragMove}
                      onWireDragStart={handleWireDragStart}
                      wirePreviewCopy={wirePreviewCopy}
                      wirePreviewStatus={wirePreviewStatus}
                    />
                  )}
                </div>

                <div className="demo-panel">
                  <div>
                    <span className="eyebrow">动态信号演示</span>
                    <h3>{activeStep?.node}</h3>
                    <p>{activeStep?.text}</p>
                  </div>
                  <div className="step-dots">
                    {simulation.steps.map((step, index) => (
                      <button
                        className={index === simulationStep ? "active" : ""}
                        key={step.id}
                        onClick={() => setSimulationStep(index)}
                        type="button"
                      >
                        {step.id}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </section>

          <aside className="lab-side-panel">
            <section className="lab-side-card">
              <span className="eyebrow">关卡任务</span>
              <h2>{currentChallenge.title}</h2>
              <p>{currentChallenge.goal}</p>
              <div className="condition-list">
                <strong>通关条件</strong>
                {currentChallenge.requiredConnections.map((connection) => (
                  <div
                    className={connections.includes(connection) ? "condition done" : "condition"}
                    key={connection}
                  >
                    <CheckCircle size={18} weight={connections.includes(connection) ? "fill" : "regular"} />
                    <span>{connection}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="lab-side-card">
              <span className="eyebrow">元件说明</span>
              <h2>{selectedComponent}</h2>
              <p>{selectedComponentDetail?.description ?? "选择一个元件查看说明。"}</p>
              <div className="concept-card">
                <strong>原理卡片</strong>
                <p>{currentChallenge.principle}</p>
              </div>
              <div className="study-card">
                <strong>内部结构透视</strong>
                <small>{selectedStudyCard.roleLabel}</small>
                <p>{selectedStudyCard.summary}</p>
                <div className="study-card-section">
                  <span>内部步骤</span>
                  {selectedStudyCard.stages.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
                <div className="study-card-section">
                  <span>观察重点</span>
                  {selectedStudyCard.watchPoints.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </div>
            </section>

            <section className="lab-side-card">
              <span className="eyebrow">判题反馈</span>
              <div className="connection-summary">
                <strong>当前已建立连线</strong>
                {connections.length > 0 ? (
                  <div className="connection-chip-list">
                    {connections.map((connection) => (
                      <button className="connection-chip removable" key={connection} onClick={() => handleRemoveConnection(connection)} type="button">
                        <span>{connection}</span>
                        <strong>移除</strong>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>还没有建立有效连线。</p>
                )}
              </div>
              <div className="placement-summary">
                <strong>当前布局</strong>
                <p>已就位 {placementPreview.matchedSlotIds.length} / {placementBlueprint.length}</p>
                {placementPreview.missingSlots.length > 0 ? (
                  <div className="connection-chip-list">
                    {placementPreview.missingSlots.map((slot) => (
                      <span className="connection-chip warning" key={slot.id}>
                        {slot.displayLabel} {"->"} {slot.role}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>所有元件已经进入目标槽位。</p>
                )}
              </div>
              {feedback ? (
                feedback.passed ? (
                  <div className="feedback success">
                    <SealCheck size={24} weight="fill" />
                    <strong>本关通过</strong>
                    <p>{currentChallenge.summary}</p>
                  </div>
                ) : (
                  <div className="feedback danger">
                    <WarningCircle size={24} weight="fill" />
                    <strong>发现 {feedback.errors.length} 类问题</strong>
                    {feedback.errors.map((error) => (
                      <p key={error.type}>{error.type}：{error.message}</p>
                    ))}
                  </div>
                )
              ) : (
                <div className="feedback neutral">
                  <Target size={24} />
                  <strong>等待检测</strong>
                  <p>拖入元件、查看信号走向，再提交当前结构。</p>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    );
  }

  function renderRecords() {
    return (
      <div className="records-layout">
        <section className="section-panel">
          <div className="section-heading">
            <div>
              <h1>个人学情记录</h1>
              <p>这里记录通关、尝试次数、得分、错误类型和建议复习点。</p>
            </div>
            <button className="ghost-button" onClick={() => changeView("lab")} type="button">继续实验</button>
          </div>
          <div className="metric-grid">
            <Metric icon={CheckCircle} label="完成率" value={`${summary.completionRate}%`} />
            <Metric icon={ClockCountdown} label="累计学习" value={formatMinutes(summary.totalStudyMinutes)} />
            <Metric icon={TrendUp} label="平均得分" value={`${summary.averageScore}分`} />
            <Metric icon={WarningCircle} label="建议复习" value={summary.weakSpot} />
          </div>
        </section>

        <section className="section-panel">
          <h2>关卡明细</h2>
          <div className="record-table">
            {CHALLENGES.map((challenge) => {
              const record = progress[challenge.id];
              return (
                <button className="record-row" key={challenge.id} onClick={() => selectChallenge(challenge.id)} type="button">
                  <strong>{challenge.title}</strong>
                  <span>{statusText(record.status)}</span>
                  <span>{record.attempts} 次尝试</span>
                  <span>{record.bestScore} 分</span>
                  <small>{record.errors.at(-1) ?? "暂无错误"}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section className="two-column">
          <article className="section-panel">
            <h2>最近活动</h2>
            <div className="activity-list">
              {activityLog.map((item) => (
                <div className="activity-item" key={item}>
                  <CheckCircle size={18} weight="fill" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>
          <article className="section-panel">
            <h2>复习建议</h2>
            <p className="large-copy">优先复习“{summary.weakSpot}”。建议回到全加器实验，先运行动态演示，再补齐缺失连线。</p>
            <button className="primary-button" onClick={() => selectChallenge("full-adder")} type="button">去复习全加器</button>
          </article>
        </section>
      </div>
    );
  }

  function renderNotes() {
    return (
      <div className="notes-layout">
        <section className="section-panel note-editor">
          <span className="eyebrow">学习笔记</span>
          <h1>把实验复盘沉淀下来。</h1>
          <textarea
            aria-label="笔记内容"
            onChange={(event) => setNoteDraft(event.target.value)}
            value={noteDraft}
          />
          <div className="note-actions">
            <button className="primary-button" onClick={saveNote} type="button">保存笔记</button>
            <button
              className="ghost-button"
              onClick={() => setNoteDraft(`${currentChallenge.title}：${currentChallenge.principle}`)}
              type="button"
            >
              插入当前原理
            </button>
          </div>
        </section>

        <section className="section-panel">
          <div className="section-heading">
            <h2>已保存笔记</h2>
            <small>{notes.length} 条</small>
          </div>
          <div className="note-list">
            {notes.map((note) => (
              <article className="note-card" key={note.id}>
                <span>{note.tag}</span>
                <strong>{note.title}</strong>
                <p>{note.content}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-panel study-tip">
          <div>
            <span className="eyebrow">概念卡片</span>
            <h2>二进制加法的核心是进位传播。</h2>
            <p>每个全加器只处理 1 位，但 Cout 会成为下一位的 Cin。多位加法器就是把这个动作串起来。</p>
          </div>
          <img alt="进位传播示意图" src={studyDiagram} />
        </section>
      </div>
    );
  }

  function renderSettingsModal() {
    return (
      <div className="modal-backdrop" onClick={() => setShowSettings(false)} role="presentation">
        <section className="modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
          <div className="section-heading">
            <div>
              <h2>{auth.user?.role === "teacher" ? "课堂设置" : "个人设置"}</h2>
              <p>{auth.user?.role === "teacher" ? "管理课堂常用导入格式和本地部署入口。" : "这些设置会影响首页推荐和实验提示强度。"}</p>
            </div>
            <button className="ghost-button" onClick={() => setShowSettings(false)} type="button">关闭</button>
          </div>
          {auth.user?.role === "teacher" ? (
            <div className="settings-resource-list">
              <a className="primary-button settings-template-link" download="student-import-template.csv" href={studentImportTemplateHref}>
                下载学生导入模板
              </a>
              <p>CSV 列顺序固定为：学号、姓名、初始密码。导入入口仍在教师数据页的“学生导入”区域。</p>
            </div>
          ) : (
            <>
              <label className="form-row">
                <span>姓名</span>
                <input value={student.name} onChange={(event) => updateStudent("name", event.target.value)} />
              </label>
              <label className="form-row">
                <span>本周目标</span>
                <input value={student.goal} onChange={(event) => updateStudent("goal", event.target.value)} />
              </label>
              <label className="form-row">
                <span>提示模式</span>
                <select value={student.mode} onChange={(event) => updateStudent("mode", event.target.value)}>
                  <option>强引导模式</option>
                  <option>适中提示模式</option>
                  <option>挑战模式</option>
                </select>
              </label>
              <button
                className="primary-button"
                onClick={saveStudentSettings}
                type="button"
              >
                保存设置
              </button>
            </>
          )}
        </section>
      </div>
    );
  }
}

function Metric({ icon: Icon, label, value }) {
  return (
    <article className="metric-card">
      <Icon size={24} weight="fill" />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function RoutePreview({ kind }) {
  return (
    <div className={`route-preview ${kind}`} aria-hidden="true">
      <span className="trace trace-a" />
      <span className="trace trace-b" />
      <span className="trace trace-c" />
      <span className="trace trace-d" />
      <span className="route-core core-a" />
      <span className="route-core core-b" />
      <span className="route-core core-c" />
    </div>
  );
}

function ChallengeCanvas({
  activeStep,
  challenge,
  challengeId,
  connectionBlueprint,
  connections,
  expandedComponent,
  feedback,
  inputState,
  onBoardDragOver,
  onBoardDrop,
  onPlacedComponentDragStart,
  onRemoveConnection,
  onWireDragEnd,
  onWireHoverChange,
  onWireDragMove,
  onWireDragStart,
  outputText,
  placementBlueprint = [],
  placementPreview,
  placedComponents = [],
  selectedComponent,
  setExpandedComponent,
  setSelectedComponent,
  simulation,
  simulationStep,
  wireDrag,
  wireHoverEndpoint,
  wirePreviewCopy,
  wirePreviewStatus,
}) {
  const boardRef = useRef(null);
  const scenes = {
    "data-flow": {
      label: "信号直通",
      hint: "只有一条主线，核心是把输入和结果端真正连通。",
      inputText: `输入A=${inputState.a}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
      ],
      nodes: [
        { name: "输入开关", tone: "io", className: "input", detail: "信号起点 · 切换 0/1" },
        { name: "数据通路", tone: "module", className: "module wide", detail: "单一主线 · 直通输出" },
        { name: "结果灯", tone: "output", className: "output", detail: "观察最终结果" },
      ],
    },
    "half-adder": {
      label: "和位与进位分流",
      hint: "输入A和B会同时进入两条并行逻辑：一条算和位，一条算进位。",
      inputText: `A=${inputState.a} · B=${inputState.b}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "diagonal up", activeAt: 0 },
        { className: "diagonal down", activeAt: 0 },
        { className: "horizontal end-top", activeAt: 1 },
        { className: "horizontal end-bottom", activeAt: 1 },
      ],
      nodes: [
        { name: "输入端", tone: "io", className: "input split", detail: "两个输入同时出发" },
        { name: "异或门", tone: "logic", className: "xor top", detail: "负责和位 S" },
        { name: "与门", tone: "logic", className: "and bottom", detail: "负责进位 C" },
        { name: "输出端", tone: "output", className: "output dual", detail: "上方和位 · 下方进位" },
      ],
    },
    "full-adder": {
      label: "进位分叉合流",
      hint: "A、B 先求临时和，再与 Cin 合并；进位逻辑单独走另一条支路。",
      inputText: `A=${inputState.a} · B=${inputState.b} · Cin=${inputState.cin}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
        { className: "vertical carry", activeAt: 1 },
        { className: "horizontal top-out", activeAt: 2 },
        { className: "horizontal bottom-out", activeAt: 2 },
      ],
      nodes: [
        { name: "输入端", tone: "io", className: "input stacked", detail: "A / B / Cin 三路输入" },
        { name: "异或门1", tone: "logic", className: "xor first", detail: "先算临时和 X" },
        { name: "异或门2", tone: "logic", className: "xor second", detail: "X 再与 Cin 合并" },
        { name: "进位逻辑", tone: "control", className: "carry core", detail: "判断 Cout 是否产生" },
        { name: "输出端", tone: "output", className: "output dual", detail: "和位 S · 输出进位 Cout" },
      ],
    },
    "multi-adder": {
      label: "级联传播",
      hint: "三个全加器首尾相接，低位进位会一路推向高位。",
      inputText: `A=${inputState.aNumber} · B=${inputState.bNumber} · 初始进位=${inputState.cin}`,
      outputText,
      wires: [
        { className: "horizontal chain-one", activeAt: 0 },
        { className: "horizontal chain-two", activeAt: 1 },
        { className: "horizontal chain-three", activeAt: 2 },
      ],
      nodes: [
        { name: "全加器0", tone: "module", className: "adder first", detail: "最低位" },
        { name: "全加器1", tone: "module", className: "adder second", detail: "接收前一位 Cout" },
        { name: "全加器2", tone: "module", className: "adder third", detail: "输出高位与总进位" },
        { name: "结果寄存器", tone: "output", className: "output result", detail: "汇总各位和位" },
      ],
    },
    mux: {
      label: "路径切换",
      hint: "两路数据同时就位，是否通过由选择信号决定。",
      inputText: `D0=${inputState.a} · D1=${inputState.b} · Sel=${inputState.select}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 0 },
        { className: "vertical select-wire", activeAt: 1 },
        { className: "horizontal mux-out", activeAt: 2 },
      ],
      nodes: [
        { name: "数据源0", tone: "io", className: "source top", detail: "上路输入" },
        { name: "数据源1", tone: "io", className: "source bottom", detail: "下路输入" },
        { name: "选择端", tone: "control", className: "selector signal", detail: "决定走哪一路" },
        { name: "选择器", tone: "module", className: "mux center", detail: "把两条路收成一条路" },
        { name: "输出端", tone: "output", className: "output", detail: "当前选中的结果" },
      ],
    },
    alu: {
      label: "运算核心汇总",
      hint: "加法单元、逻辑单元并行准备结果，再交给结果选择器统一输出。",
      inputText: `A=${inputState.a} · B=${inputState.b} · Cin=${inputState.cin} · Op=${inputState.op}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 0 },
        { className: "horizontal alu-upper", activeAt: 1 },
        { className: "horizontal alu-lower", activeAt: 1 },
        { className: "horizontal mux-out", activeAt: 2 },
      ],
      nodes: [
        { name: "输入端", tone: "io", className: "input stacked", detail: "A / B / Cin / Op" },
        { name: "加法单元", tone: "logic", className: "adder core", detail: "产生和位与进位" },
        { name: "逻辑单元", tone: "logic", className: "logic core", detail: "产生 AND / OR / XOR" },
        { name: "结果选择器", tone: "control", className: "mux center", detail: "按控制位选结果" },
        { name: "输出端", tone: "output", className: "output flags", detail: "结果 F · 零标志 · 进位标志" },
      ],
    },
  };

  const scene = scenes[challengeId];
  const signalBadges = buildSignalBadges({
    sceneInput: scene.inputText,
    outputs: simulation?.outputs,
    activeStep,
    simulationStep,
  });
  const issueMarkers = buildWorkbenchIssueMarkers(feedback);
  const inputAnchors = buildExternalAnchorLayout(connectionBlueprint.externalInputs, "input");
  const outputAnchors = buildExternalAnchorLayout(connectionBlueprint.externalOutputs, "output");
  const componentPins = Object.fromEntries(
    connectionBlueprint.components.map((item) => [item.name, buildComponentPinLayout(item.pins)]),
  );
  const renderedLines = buildRenderableConnections({
    challenge,
    connectionBlueprint,
    placedComponents,
    connections,
  });
  const previewLine = wireDrag
    ? {
      id: "preview-line",
      from: wireDrag.startEndpoint,
      to: wireDrag.pointer,
    }
    : null;

  function getBoardPoint(event) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };

    return {
      x: clampPlacement(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clampPlacement(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function buildEndpointPayload(endpoint, event) {
    return {
      ...endpoint,
      ...getBoardPoint(event),
    };
  }

  function handleEndpointPointerDown(event, endpoint) {
    event.preventDefault();
    event.stopPropagation();
    const payload = buildEndpointPayload(endpoint, event);
    if (wireDrag) {
      onWireDragEnd(payload);
      return;
    }
    onWireDragStart(payload);
  }

  return (
    <div className={`challenge-scene ${challengeId} ${placedComponents.length > 0 ? "has-components" : ""}`}>
      <div className="challenge-scene-header">
        <div>
          <span className="eyebrow">关卡骨架</span>
          <h3>{scene.label}</h3>
          <p>{scene.hint}</p>
        </div>
        <div className="scene-readout">
          <span>输入快照</span>
          <strong>{scene.inputText}</strong>
          <small>输出：{scene.outputText}</small>
        </div>
      </div>

      <div className="workbench-signal-strip" aria-label="信号状态">
        {signalBadges.map((badge) => (
          <div className={`signal-badge ${badge.tone}`} key={badge.id}>
            <span>{badge.label}</span>
            <strong>{badge.value}</strong>
          </div>
        ))}
      </div>

      <div
        className={`challenge-scene-board lab-dropzone ${wireDrag ? "wiring-active" : ""}`}
        onDragOver={onBoardDragOver}
        onDrop={onBoardDrop}
        onPointerMove={(event) => {
          if (!wireDrag) return;
          if (event.target === event.currentTarget) {
            onWireHoverChange(null);
          }
          onWireDragMove(getBoardPoint(event));
        }}
        onPointerUp={() => {
          if (!wireDrag) return;
          onWireDragEnd(null);
        }}
        ref={boardRef}
      >
        {scene.wires.map((wire) => (
          <span
            className={`scene-wire ${wire.className} ${simulationStep >= wire.activeAt ? "active" : ""}`}
            key={wire.className}
          />
        ))}
        <svg className="connection-overlay" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
          {renderedLines.map((line, index) => {
            const tone = resolveConnectionTone(line.id, feedback, simulationStep);
            const route = buildOrthogonalWireRoute(line, index);
            const routePoints = formatWireRoutePoints(route.points);

            return (
              <g key={line.id}>
                <polyline
                  className="connection-hitbox"
                  data-click-x={route.clickPoint.x}
                  data-click-y={route.clickPoint.y}
                  onClick={() => onRemoveConnection(line.id)}
                  points={routePoints}
                />
                <polyline
                  className={`connection-line ${tone}`}
                  points={routePoints}
                />
                <text className={`connection-signal-label ${tone}`} x={route.label.x} y={route.label.y}>
                  {signalLabelForConnection(tone, simulationStep)}
                </text>
              </g>
            );
          })}
          {previewLine ? (
            <line
              className={`connection-line preview ${wirePreviewStatus}`}
              x1={previewLine.from.x}
              x2={previewLine.to.x}
              y1={previewLine.from.y}
              y2={previewLine.to.y}
            />
          ) : null}
        </svg>
        <div className="canvas-wire-hit-layer" aria-label="画布导线操作">
          {renderedLines.map((line, index) => {
            const route = buildOrthogonalWireRoute(line, index);
            return (
              <button
                aria-label={`移除导线 ${line.id}`}
                className="canvas-wire-hit-target"
                key={`hit-${line.id}`}
                onClick={() => onRemoveConnection(line.id)}
                style={{ left: `${route.clickPoint.x}%`, top: `${route.clickPoint.y}%` }}
                title={`移除导线：${line.id}`}
                type="button"
              />
            );
          })}
        </div>
        {issueMarkers.length > 0 ? (
          <div className="canvas-issue-layer" aria-live="polite">
            {issueMarkers.map((marker) => (
              <div
                className={`canvas-issue-marker ${marker.tone}`}
                key={marker.id}
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
              >
                <strong>{marker.label}</strong>
                <span>{marker.detail}</span>
              </div>
            ))}
          </div>
        ) : null}
        {wireDrag ? (
          <div className={`wire-target-indicator ${wirePreviewCopy.tone}`}>
            <strong>当前连线</strong>
            <span>{wirePreviewCopy.summary}</span>
            <small>{wirePreviewCopy.detail}</small>
          </div>
        ) : null}
        <div className="placement-slot-layer" aria-hidden="true">
          {placementBlueprint.map((slot) => (
            <div
              className={[
                "placement-slot",
                placementPreview?.matchedSlotIds.includes(slot.id) ? "matched" : "",
                selectedComponent === slot.displayLabel ? "selected" : "",
              ].filter(Boolean).join(" ")}
              key={slot.id}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            >
              <strong>{slot.displayLabel}</strong>
              <small>{slot.role}</small>
            </div>
          ))}
        </div>
        {inputAnchors.map((anchor) => (
          <button
            className={[
              "lab-anchor",
              "input",
              wireDrag?.startEndpoint.key === anchor.key ? "selected start" : "",
              wireHoverEndpoint?.key === anchor.key && wireDrag ? `target ${wirePreviewStatus}` : "",
            ].filter(Boolean).join(" ")}
            key={anchor.key}
            onPointerDown={(event) => {
              handleEndpointPointerDown(event, anchor);
            }}
            onPointerEnter={(event) => {
              if (!wireDrag) return;
              onWireHoverChange(buildEndpointPayload(anchor, event));
            }}
            onPointerLeave={() => {
              if (!wireDrag) return;
              onWireHoverChange(null);
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!wireDrag) return;
              onWireDragEnd(buildEndpointPayload(anchor, event));
            }}
            style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
            type="button"
          >
            <span>{anchor.label}</span>
          </button>
        ))}
        {outputAnchors.map((anchor) => (
          <button
            className={[
              "lab-anchor",
              "output",
              wireDrag?.startEndpoint.key === anchor.key ? "selected start" : "",
              wireHoverEndpoint?.key === anchor.key && wireDrag ? `target ${wirePreviewStatus}` : "",
            ].filter(Boolean).join(" ")}
            key={anchor.key}
            onPointerDown={(event) => {
              handleEndpointPointerDown(event, anchor);
            }}
            onPointerEnter={(event) => {
              if (!wireDrag) return;
              onWireHoverChange(buildEndpointPayload(anchor, event));
            }}
            onPointerLeave={() => {
              if (!wireDrag) return;
              onWireHoverChange(null);
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!wireDrag) return;
              onWireDragEnd(buildEndpointPayload(anchor, event));
            }}
            style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
            type="button"
          >
            <span>{anchor.label}</span>
          </button>
        ))}
        {scene.nodes.map((node) => {
          const isSelected = selectedComponent === node.name || expandedComponent === node.name;
          return (
            <button
              className={`scene-node ${node.tone} ${node.className} ${isSelected ? "selected" : ""}`}
              key={node.name}
              onClick={() => {
                setSelectedComponent(node.name);
                setExpandedComponent(node.name);
              }}
              type="button"
            >
              <strong>{node.name}</strong>
              <small>{node.detail}</small>
            </button>
          );
        })}
        <div className="floating-layer">
          {placedComponents.map((component) => (
            <div
              className={`floating-component ${selectedComponent === (component.displayLabel ?? component.name) ? "selected" : ""}`}
              data-component-id={component.id}
              draggable
              key={component.id}
              onClick={() => {
                setSelectedComponent(component.displayLabel ?? component.name);
                setExpandedComponent(component.displayLabel ?? component.name);
              }}
              onDragStart={(event) => onPlacedComponentDragStart(event, component)}
              style={{ left: `${component.x}%`, top: `${component.y}%` }}
            >
              <div className="floating-component-head">
                <Cpu size={16} />
                <span>{component.displayLabel ?? component.name}</span>
              </div>
              <button
                className="component-drag-handle"
                draggable
                onClick={(event) => event.stopPropagation()}
                onDragStart={(event) => {
                  event.stopPropagation();
                  onPlacedComponentDragStart(event, component);
                }}
                type="button"
              >
                拖动元件
              </button>
              <div className="floating-pin-cluster">
                {(componentPins[component.name] ?? []).map((pin) => (
                  <button
                    className={[
                      "floating-pin",
                      wireDrag?.startEndpoint.key === `${component.id}-${pin.pin}` ? "selected start" : "",
                      wireHoverEndpoint?.key === `${component.id}-${pin.pin}` && wireDrag ? `target ${wirePreviewStatus}` : "",
                    ].filter(Boolean).join(" ")}
                    key={`${component.id}-${pin.pin}`}
                    style={{ left: `${pin.offsetX}%`, top: `${pin.offsetY}%` }}
                    onPointerDown={(event) => {
                      handleEndpointPointerDown(event, {
                        key: `${component.id}-${pin.pin}`,
                        label: component.name,
                        componentName: component.name,
                        componentLabel: component.displayLabel ?? component.name,
                        pin: pin.pin,
                        pinRole: pin.role,
                      });
                    }}
                    onPointerEnter={(event) => {
                      if (!wireDrag) return;
                      onWireHoverChange(buildEndpointPayload({
                        key: `${component.id}-${pin.pin}`,
                        label: component.name,
                        componentName: component.name,
                        componentLabel: component.displayLabel ?? component.name,
                        pin: pin.pin,
                        pinRole: pin.role,
                      }, event));
                    }}
                    onPointerLeave={() => {
                      if (!wireDrag) return;
                      onWireHoverChange(null);
                    }}
                    onPointerUp={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      if (!wireDrag) return;
                      onWireDragEnd(buildEndpointPayload({
                        key: `${component.id}-${pin.pin}`,
                        label: component.name,
                        componentName: component.name,
                        componentLabel: component.displayLabel ?? component.name,
                        pin: pin.pin,
                        pinRole: pin.role,
                      }, event));
                    }}
                    type="button"
                  >
                    {pin.pin}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="toggle-control">
      <span>{label}</span>
      <button className={value ? "bit-toggle on" : "bit-toggle"} onClick={() => onChange(value ? 0 : 1)} type="button">
        {value ? "1" : "0"}
      </button>
    </label>
  );
}

function Stepper({ label, value, max, onChange }) {
  return (
    <label className="toggle-control">
      <span>{label}</span>
      <div className="stepper">
        <button onClick={() => onChange(Math.max(0, value - 1))} type="button">-</button>
        <strong>{value}</strong>
        <button onClick={() => onChange(Math.min(max, value + 1))} type="button">+</button>
      </div>
    </label>
  );
}

function formatOutputs(outputs) {
  return Object.entries(outputs)
    .map(([key, value]) => `${outputLabel(key)}=${value}`)
    .join(" · ");
}

function labDescription(challengeId) {
  const descriptions = {
    "data-flow": "这一关的画布是一条最基础的信号通道，先理解输入如何走到输出。",
    "half-adder": "这一关会把和位和进位拆成两条并行支路，你能直观看到两种结果是如何分工产生的。",
    "full-adder": "这一关会出现真正的进位分叉：一条线继续算和位，另一条线专门负责判断是否向高位进位。",
    "multi-adder": "这一关不再是一个模块，而是多个全加器首尾相接，重点观察进位逐级传播。",
    mux: "这一关的重点是路径选择，同一时刻两路数据都在，但只有被选择的一路会真正通过。",
    alu: "这一关会把加法、逻辑和选择控制汇总到同一块运算核心里，画布结构也会比前几关更复杂。",
  };
  return descriptions[challengeId] ?? "观察这一关独有的电路骨架，再运行信号演示。";
}

function outputLabel(key) {
  const labels = {
    sum: "S",
    carry: "进位",
    output: "Y",
    result: "F",
    zero: "零标志",
  };
  return labels[key] ?? key;
}

function formatMinutes(minutes) {
  const safeMinutes = Math.max(0, Number(minutes ?? 0));
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return hours > 0 ? `${hours}小时${rest}分` : `${rest}分钟`;
}
