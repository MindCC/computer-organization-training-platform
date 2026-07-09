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
  LEARNING_ITEMS,
  buildInitialLearningProgress,
  buildInitialProgress,
  gradeConnections,
  mergeProgressWithChallenges,
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
import {
  DATA_JOURNEY_STEPS,
  buildTeacherJourneyGuidance,
  getJourneyStepsForChallenge,
} from "./dataJourney.js";
import { HARDWARE_GAME_CASES, formatHardwareBuildParts, gradeHardwareBuild, hardwareCaseTitle } from "./hardwareGame.js";
import { HardwareGamePage } from "./components/HardwareGamePage.jsx";
import { MachineNumberPanel } from "./components/MachineNumberPanel.jsx";
import { MemorySystemPanel } from "./components/MemorySystemPanel.jsx";
import { MobileLabFallback } from "./components/MobileLabFallback.jsx";
import { buildCourseRouteGroups, findNextRecommendedChallenge } from "./courseRoute.js";
import { buildRealtimeDiagnostics } from "./realtimeDiagnostics.js";
import { buildMemoryAccessState } from "./memorySystem.js";
import { api } from "./apiClient.js";
import { NotesPage } from "./components/NotesPage.jsx";
import { StudentHome } from "./components/StudentHome.jsx";
import { StudentRecords } from "./components/StudentRecords.jsx";
import { SettingsModal } from "./components/TeacherSettingsPanel.jsx";
import { TeacherStudioDashboard } from "./components/TeacherDashboard.jsx";
import avatarImage from "./assets/alex-chen-avatar.png";
import labIllustration from "./assets/lab-circuit-illustration.png";
import studyDiagram from "./assets/study-tip-carry-diagram.png";

const CircuitFlowCanvas = lazy(() =>
  import("./components/CircuitFlowCanvas.jsx").then((module) => ({ default: module.CircuitFlowCanvas })),
);

const navItems = [
  { id: "home", label: "课程首页", icon: House },
  { id: "lab", label: "关卡实验", icon: Flask },
  { id: "hardware-game", label: "\u786c\u4ef6\u914d\u7f6e\u6311\u6218", icon: Cpu },
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
  "computer-components": {
    eyebrow: "整机地图",
    summary: "先认识输入、存储、控制、运算和输出五类部件。",
    detail: "这一关建立整机概念：一次计算不是单个部件完成，而是五大部件协同完成。",
    preview: "flow",
    focus: "五大部件",
  },
  "program-flow": {
    eyebrow: "程序如何跑",
    summary: "把 1+1 从键盘输入到屏幕输出的路线连起来。",
    detail: "这一关把输入、主存、CPU取指、运算器执行和输出显示串成完整流程。",
    preview: "flow",
    focus: "运行流程",
  },
  "instruction-data": {
    eyebrow: "冯·诺依曼结构",
    summary: "同在内存中的二进制，为什么有时是指令、有时是数据。",
    detail: "这一关重点理解：CPU按取指阶段和执行阶段决定如何解释内存内容。",
    preview: "gate",
    focus: "指令 / 数据",
  },
  "memory-address": {
    eyebrow: "\u4e3b\u5b58\u8bbf\u95ee",
    summary: "\u628a\u5730\u5740\u8fdb\u5165 MAR\u3001\u4e3b\u5b58\u8bfb\u51fa\u6570\u636e\u3001MDR \u9001\u56de CPU \u7684\u8def\u5f84\u8fde\u8d77\u6765\u3002",
    detail: "\u8fd9\u4e00\u5173\u91cd\u70b9\u533a\u5206\u5730\u5740\u603b\u7ebf\u548c\u6570\u636e\u603b\u7ebf\uff1aMAR \u8d1f\u8d23\u5730\u5740\uff0cMDR \u8d1f\u8d23\u4e3b\u5b58\u8bfb\u51fa\u7684\u6570\u636e\u3002",
    preview: "flow",
    focus: "MAR / MDR",
  },
  "and-gate": {
    eyebrow: "基础逻辑门",
    summary: "两个输入都为 1 时，输出才为 1。",
    detail: "先掌握与运算，再进入半加器的进位逻辑会更容易。",
    preview: "gate",
    focus: "A 与 B",
  },
  "or-gate": {
    eyebrow: "基础逻辑门",
    summary: "任意一个输入为 1，输出就是 1。",
    detail: "或门帮助学生理解多条条件路径如何合并成一个结果。",
    preview: "gate",
    focus: "A 或 B",
  },
  "not-gate": {
    eyebrow: "基础逻辑门",
    summary: "单个输入经过非门后取反。",
    detail: "非门是最小的反相器，适合作为控制信号的入门实验。",
    preview: "gate",
    focus: "取反",
  },
  "xor-gate": {
    eyebrow: "基础逻辑门",
    summary: "两个输入不同时输出 1，相同时输出 0。",
    detail: "异或门是半加器和位 S 的来源，是进入加法器前的关键铺垫。",
    preview: "gate",
    focus: "不同为 1",
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
  "machine-number": {
    eyebrow: "有符号数",
    summary: "把正负号、数值位、反码和补码连成进入运算器前的编码路径。",
    detail: "这一关用 4 位小整数讲清楚原码、反码、补码，不要求学生背大范围换算，重点是理解负数补码为什么要反码加一。",
    preview: "chain",
    focus: "原码 / 反码 / 补码",
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
  "computer-components": [
    { key: "a", label: "输入信号", type: "bit" },
  ],
  "program-flow": [
    { key: "a", label: "输入值1", type: "bit" },
    { key: "b", label: "输入值2", type: "bit" },
  ],
  "instruction-data": [
    { key: "address", label: "观察地址", type: "stepper", max: 102 },
  ],
  "memory-address": [
    { key: "address", label: "\u8bbf\u95ee\u5730\u5740", type: "stepper", min: 100, max: 103 },
  ],
  "and-gate": [
    { key: "a", label: "输入A", type: "bit" },
    { key: "b", label: "输入B", type: "bit" },
  ],
  "or-gate": [
    { key: "a", label: "输入A", type: "bit" },
    { key: "b", label: "输入B", type: "bit" },
  ],
  "not-gate": [
    { key: "a", label: "输入A", type: "bit" },
  ],
  "xor-gate": [
    { key: "a", label: "输入A", type: "bit" },
    { key: "b", label: "输入B", type: "bit" },
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
  "machine-number": [
    { key: "signedValue", label: "整数", type: "stepper", min: -7, max: 7 },
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
  for (const challengeId of ["computer-components", "program-flow"]) {
    const challenge = CHALLENGES.find((item) => item.id === challengeId);
    progress = recordAttempt(progress, challengeId, {
      passed: true,
      errors: [],
      score: 100,
      missing: [],
    });
    progress[challengeId].bestScore = 100;
    progress[challengeId].completedAt = challengeId === "computer-components" ? "昨天" : "今天";
    progress[challengeId].attempts = challengeId === "computer-components" ? 1 : 2;
    progress[challengeId].timeSpentMinutes = challengeId === "computer-components" ? 8 : 10;
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

const defaultChallenge = CHALLENGES[0];
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
    return { challenge, challengeId: challenge.id, incompleteCount, averageScore };
  }).sort((left, right) => right.incompleteCount - left.incompleteCount || left.averageScore - right.averageScore);

  const focusChallenge = challengeStats[0]?.challenge ?? CHALLENGES[0];
  const journeyGuidance = buildTeacherJourneyGuidance(challengeStats);
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
      journeyGuidance.action,
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
  const [selectedChallengeId, setSelectedChallengeId] = useState(defaultChallenge.id);
  const [progress, setProgress] = useState(() => buildInitialLearningProgress());
  const [connections, setConnections] = useState(["输入A->异或门1", "输入B->异或门1"]);
  const [placedComponents, setPlacedComponents] = useState([]);
  const [expandedComponent, setExpandedComponent] = useState(defaultComponentLabel);
  const [selectedComponent, setSelectedComponent] = useState(defaultComponentLabel);
  const [wireDrag, setWireDrag] = useState(null);
  const [wireHoverEndpoint, setWireHoverEndpoint] = useState(null);
  const [inputState, setInputState] = useState({ a: 1, b: 1, cin: 0, select: 1, op: 0, aNumber: 5, bNumber: 3, address: 100, signedValue: -5 });
  const [simulationStep, setSimulationStep] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [activityLog, setActivityLog] = useState([
    "完成半加器实验，得分 100。",
    "数据流基础测验得分 85。",
    "进入全加器实验，当前缺少进位输入。",
  ]);
  const [notes, setNotes] = useState(initialNotes);
  const [noteDraft, setNoteDraft] = useState("全加器实验中，Cin 会影响和位，也会参与 Cout 的判断。");
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [noteFilterTag, setNoteFilterTag] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState({ title: "", content: "", tag: "" });
  const [noteError, setNoteError] = useState("");
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
  const selectedTeacherClassIdRef = useRef(null);
  const [classOverview, setClassOverview] = useState(null);
  const [assistantReport, setAssistantReport] = useState(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [selectedTeacherStudent, setSelectedTeacherStudent] = useState(null);
  const [classNameDraft, setClassNameDraft] = useState("\u8ba1\u7ec4\u4e00\u73ed");
  const [csvImportText, setCsvImportText] = useState("\u5b66\u53f7,\u59d3\u540d,\u521d\u59cb\u5bc6\u7801\n2026001,\u674e\u540c\u5b66,Student123!");
  const [teacherMessage, setTeacherMessage] = useState("");
  const [selectedHardwareCaseId, setSelectedHardwareCaseId] = useState(HARDWARE_GAME_CASES[0].id);
  const [hardwareSelection, setHardwareSelection] = useState({ cpu: "cpu-i3", memory: "mem-8", storage: "ssd-512", gpu: "gpu-integrated" });
  const [hardwareFeedback, setHardwareFeedback] = useState(null);
  const [memoryAddress, setMemoryAddress] = useState(6);
  const [memoryOperation, setMemoryOperation] = useState("read");
  const [memoryWriteValue, setMemoryWriteValue] = useState("10101100");
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (event) => setIsMobile(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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
  const summary = useMemo(() => summarizeLearning(LEARNING_ITEMS, progress), [progress]);
  const focusChallenge = useMemo(
    () => CHALLENGES.find((challenge) => progress[challenge.id]?.status === "in-progress") ?? currentChallenge,
    [currentChallenge, progress],
  );
  const upcomingChallenge = useMemo(() => {
    const currentIndex = CHALLENGES.findIndex((challenge) => challenge.id === focusChallenge.id);
    return CHALLENGES[currentIndex + 1] ?? CHALLENGES[currentIndex] ?? CHALLENGES[0];
  }, [focusChallenge]);
  const routeGroups = useMemo(() => buildCourseRouteGroups(CHALLENGES, progress), [progress]);
  const nextRecommendedChallenge = useMemo(() => findNextRecommendedChallenge(CHALLENGES, progress), [progress]);
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
  const memoryAccessState = useMemo(
    () => buildMemoryAccessState({ address: memoryAddress, operation: memoryOperation, writeValue: memoryWriteValue }),
    [memoryAddress, memoryOperation, memoryWriteValue],
  );
  const realtimeDiagnostics = useMemo(
    () => buildRealtimeDiagnostics({
      challengeId: currentChallenge.id,
      connections,
      inputState,
      feedback,
    }),
    [currentChallenge.id, connections, inputState, feedback],
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
      setProgress({ ...buildInitialLearningProgress(), ...nextProgress });
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

  function resetAssistantState() {
    setAssistantReport(null);
    setAssistantError("");
    setAssistantLoading(false);
  }

  async function refreshTeacherClasses() {
    const { classes } = await api.teacherClasses();
    setTeacherClasses(classes);
    const nextClassId = selectedTeacherClassId ?? classes[0]?.id ?? null;
    if (selectedTeacherClassIdRef.current !== nextClassId) {
      resetAssistantState();
    }
    selectedTeacherClassIdRef.current = nextClassId;
    setSelectedTeacherClassId(nextClassId);
    if (nextClassId) await refreshClassOverview(nextClassId);
  }

  async function refreshClassOverview(classId = selectedTeacherClassId) {
    if (!classId) {
      selectedTeacherClassIdRef.current = null;
      setClassOverview(null);
      setSelectedTeacherStudent(null);
      resetAssistantState();
      return;
    }
    const overview = await api.classOverview(classId);
    setClassOverview(overview);
    setSelectedTeacherStudent(null);
  }

  async function generateAssistantReport() {
    const requestClassId = selectedTeacherClassIdRef.current ?? selectedTeacherClassId;
    if (!requestClassId) {
      setAssistantError("请先选择班级");
      return;
    }
    setAssistantLoading(true);
    setAssistantError("");
    try {
      const result = await api.assistantReport(requestClassId);
      if (selectedTeacherClassIdRef.current === requestClassId) {
        setAssistantReport(result);
      }
    } catch (error) {
      if (selectedTeacherClassIdRef.current === requestClassId) {
        setAssistantError(error.message);
      }
    } finally {
      if (selectedTeacherClassIdRef.current === requestClassId) {
        setAssistantLoading(false);
      }
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
    setProgress(buildInitialLearningProgress());
    setNotes([]);
    setActiveView("home");
  }

  function changeView(view) {
    setActiveView(view);
    setStatusMessage(`已切换到${navItems.find((item) => item.id === view)?.label ?? "当前页面"}。`);
  }

  function navigateToChallenge(challengeId) {
    if (challengeId.startsWith("game-")) {
      setSelectedHardwareCaseId(challengeId);
      setActiveView("hardware-game");
      setStatusMessage("已进入硬件配置挑战。");
      return;
    }
    const challenge = CHALLENGES.find((item) => item.id === challengeId);
    if (challenge) {
      selectChallenge(challengeId);
      return;
    }
    changeView("lab");
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

    setFeedback(normalizedResult);
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
      setNoteError("笔记内容不能为空。");
      return;
    }
    try {
      const { note } = await api.createNote({
        title: `${currentChallenge.shortTitle}复盘`,
        content,
        tag: currentChallenge.shortTitle,
      });
      setNotes((current) => [note, ...current]);
      setNoteDraft("");
      setNoteError("");
      setStatusMessage("学习笔记已保存到服务器。");
    } catch (error) {
      setNoteError("笔记保存失败：" + error.message);
    }
  }

  async function deleteNoteById(noteId) {
    try {
      await api.deleteNote(noteId);
      setNotes((current) => current.filter((n) => n.id !== noteId));
      setStatusMessage("笔记已删除。");
    } catch (error) {
      setNoteError("删除失败：" + error.message);
    }
  }

  function startEditingNote(note) {
    setEditingNoteId(note.id);
    setEditingNoteDraft({ title: note.title, content: note.content, tag: note.tag });
    setNoteError("");
  }

  function cancelEditingNote() {
    setEditingNoteId(null);
    setEditingNoteDraft({ title: "", content: "", tag: "" });
  }

  async function saveNoteEdit() {
    if (!editingNoteId) return;
    const content = editingNoteDraft.content.trim();
    if (!content) {
      setNoteError("笔记内容不能为空。");
      return;
    }
    try {
      const { note } = await api.updateNote(editingNoteId, {
        title: editingNoteDraft.title || "实验复盘",
        content,
        tag: editingNoteDraft.tag || "课堂笔记",
      });
      setNotes((current) => current.map((n) => (n.id === editingNoteId ? note : n)));
      cancelEditingNote();
      setNoteError("");
      setStatusMessage("笔记已更新。");
    } catch (error) {
      setNoteError("更新失败：" + error.message);
    }
  }

  async function refreshNotes(params = {}) {
    try {
      const result = await api.searchNotes(params);
      setNotes(result.notes);
      setNoteError("");
    } catch (error) {
      setNoteError("加载笔记失败：" + error.message);
    }
  }

  const filteredNotes = (() => {
    let result = notes;
    const q = noteSearchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((n) =>
        n.title?.toLowerCase().includes(q) ||
        n.content?.toLowerCase().includes(q) ||
        n.tag?.toLowerCase().includes(q));
    }
    if (noteFilterTag) {
      result = result.filter((n) => n.tag === noteFilterTag);
    }
    return result;
  })();

  const noteTags = [...new Set(notes.map((n) => n.tag).filter(Boolean))];

  function updateStudent(key, value) {
    setStudent((current) => ({ ...current, [key]: value }));
  }

  async function submitHardwareBuild() {
    const selectedCase = HARDWARE_GAME_CASES.find((item) => item.id === selectedHardwareCaseId) ?? HARDWARE_GAME_CASES[0];
    const result = {
      ...gradeHardwareBuild(selectedCase.id, hardwareSelection),
      elapsedMinutes: 6,
    };
    setHardwareFeedback(result);
    setProgress((current) => recordAttempt(current, selectedCase.id, result));
    setActivityLog((current) => [
      selectedCase.title + " \u914d\u7f6e\u63d0\u4ea4" + (result.passed ? "\u901a\u8fc7" : "\u672a\u901a\u8fc7") + "\uff0c\u5f97\u5206 " + result.score + "\u3002",
      ...current.slice(0, 5),
    ]);
    setStatusMessage(result.passed ? selectedCase.title + " \u5df2\u8fbe\u6210\u5ba2\u6237\u76ee\u6807\u3002" : "\u5df2\u627e\u5230\u914d\u7f6e\u74f6\u9888\uff0c\u8bf7\u6839\u636e\u53cd\u9988\u8c03\u6574\u3002");
    await persistStudentAttempt(selectedCase.id, result);
  }

  async function persistStudentAttempt(challengeId, result) {
    if (auth.user?.role !== "student") return;
    try {
      const saved = await api.submitAttempt({ challengeId, result });
      setProgress({ ...buildInitialLearningProgress(), ...saved.progress });
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

          {activeView === "home" ? <StudentHome progress={progress} nextRecommendedChallenge={nextRecommendedChallenge} navigateToChallenge={navigateToChallenge} summary={summary} notes={notes} /> : null}
          {activeView === "records" ? <StudentRecords summary={summary} progress={progress} activityLog={activityLog} changeView={changeView} selectChallenge={selectChallenge} /> : null}
          {activeView === "hardware-game" ? <HardwareGamePage hardwareSelection={hardwareSelection} setHardwareSelection={setHardwareSelection} hardwareFeedback={hardwareFeedback} setHardwareFeedback={setHardwareFeedback} selectedHardwareCaseId={selectedHardwareCaseId} setSelectedHardwareCaseId={setSelectedHardwareCaseId} progress={progress} submitHardwareBuild={submitHardwareBuild} /> : null}
          {activeView === "notes" ? (
            <NotesPage
              noteDraft={noteDraft}
              setNoteDraft={setNoteDraft}
              noteError={noteError}
              filteredNotes={filteredNotes}
              noteSearchQuery={noteSearchQuery}
              setNoteSearchQuery={setNoteSearchQuery}
              noteFilterTag={noteFilterTag}
              setNoteFilterTag={setNoteFilterTag}
              noteTags={noteTags}
              editingNoteId={editingNoteId}
              editingNoteDraft={editingNoteDraft}
              setEditingNoteDraft={setEditingNoteDraft}
              currentChallenge={currentChallenge}
              saveNote={saveNote}
              deleteNoteById={deleteNoteById}
              startEditingNote={startEditingNote}
              cancelEditingNote={cancelEditingNote}
              saveNoteEdit={saveNoteEdit}
            />
          ) : null}
          {activeView === "teacher" ? (
            <TeacherStudioDashboard
              teacherClasses={teacherClasses} selectedTeacherClassId={selectedTeacherClassId}
              setSelectedTeacherClassId={setSelectedTeacherClassId} selectedTeacherClassIdRef={selectedTeacherClassIdRef}
              classOverview={classOverview} assistantReport={assistantReport} assistantLoading={assistantLoading}
              assistantError={assistantError} resetAssistantState={resetAssistantState}
              refreshClassOverview={refreshClassOverview} generateAssistantReport={generateAssistantReport}
              classNameDraft={classNameDraft} setClassNameDraft={setClassNameDraft}
              teacherMessage={teacherMessage} createTeacherClass={createTeacherClass}
              openTeacherStudentDetail={openTeacherStudentDetail} resetStudentPassword={resetStudentPassword}
              selectedTeacherStudent={selectedTeacherStudent} setSelectedTeacherStudent={setSelectedTeacherStudent}
              buildTeacherAssistantInsights={buildTeacherAssistantInsights}
            />
          ) : null}
        </main>
      </div>

      {showSettings ? <SettingsModal setShowSettings={setShowSettings} auth={auth} teacherClasses={teacherClasses} selectedTeacherClassId={selectedTeacherClassId} csvImportText={csvImportText} setCsvImportText={setCsvImportText} importStudentsToClass={importStudentsToClass} student={student} updateStudent={updateStudent} saveStudentSettings={saveStudentSettings} /> : null}
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

  function renderLabStudioScreen() {

    const currentIndex = CHALLENGES.findIndex((challenge) => challenge.id === currentChallenge.id);
    const routeMeta = challengeRouteMeta[currentChallenge.id] ?? {};
    const requiredEdgeCount = currentCircuitModel?.requiredEdges.length ?? currentChallenge.requiredConnections.length;
    const testCaseCount = currentCircuitModel?.testCases.length ?? 0;
    const selectedRecordStatus = statusText(currentRecord?.status ?? "not-started");
    const journeySteps = getJourneyStepsForChallenge(currentChallenge.id);

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
                    min={control.min}
                    max={control.max}
                    onChange={(value) => handleInputChange(control.key, value)}
                  />
                )
              ))}
            </div>

            <div className="lab-studio-canvas-shell">
              {currentCircuitModel ? (
                isMobile ? (
                  <MobileLabFallback challengeTitle={currentChallenge.title} />
                ) : (
                <Suspense fallback={<div className="flow-loading">正在加载 React Flow 工作台...</div>}>
                  <CircuitFlowCanvas
                    key={currentCircuitModel.id}
                    model={currentCircuitModel}
                    onResult={handleCircuitFlowResult}
                  />
                </Suspense>
                )
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

            {journeySteps.length > 0 ? (
              <DataJourneyPanel steps={journeySteps} activeStep={activeStep} />
            ) : null}

            {currentChallenge.id === "memory-address" ? (
              <MemorySystemPanel
                address={memoryAddress}
                operation={memoryOperation}
                state={memoryAccessState}
                writeValue={memoryWriteValue}
                onAddressChange={setMemoryAddress}
                onOperationChange={setMemoryOperation}
                onWriteValueChange={setMemoryWriteValue}
              />
            ) : null}

            {currentChallenge.id === "machine-number" ? (
              <MachineNumberPanel value={inputState.signedValue ?? -5} />
            ) : null}

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
              <section className={`realtime-diagnostics ${realtimeDiagnostics.status}`}>
                <strong>实时数据流检测</strong>
                <p>{realtimeDiagnostics.summary}</p>
                <div className="diagnostic-test-list">
                  {realtimeDiagnostics.testRows.map((row) => (
                    <div className={row.passed ? "passed" : "needs-work"} key={row.label}>
                      <span>{row.label}</span>
                      <small>实际：{row.actual}</small>
                    </div>
                  ))}
                </div>
                {realtimeDiagnostics.issues.length ? (
                  <div className="diagnostic-issues">
                    {realtimeDiagnostics.issues.slice(0, 3).map((issue) => (
                      <span key={`${issue.type}-${issue.message}`}>{issue.type}</span>
                    ))}
                  </div>
                ) : null}
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
                    min={control.min}
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

}

function DataJourneyPanel({ steps, activeStep }) {
  const currentIndex = steps.length > 0 ? activeStep % steps.length : 0;

  return (
    <section className="data-journey-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">数据旅程检查点</span>
          <h2>取指、译码、执行的课堂观察线</h2>
          <p>按步骤观察地址、数据和控制信号如何经过寄存器与总线。</p>
        </div>
      </div>
      <div className="journey-step-grid">
        {steps.map((step, index) => (
          <article className={index === currentIndex ? "journey-step-card active" : "journey-step-card"} key={step.id}>
            <div className="journey-step-head">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step.title}</strong>
            </div>
            <code>{step.transfer}</code>
            <p>{step.description}</p>
            <div className="journey-registers">
              {step.registers.map((register) => <small key={register}>{register}</small>)}
            </div>
            <div className="journey-checkpoint">
              <b>{step.checkpoint.question}</b>
              <span>{step.checkpoint.answer}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
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

function NextStepCard({ challenge, progress, onEnter }) {
  const record = progress ?? {};
  return (
    <div className="next-step-card">
      <div className="next-step-card-body">
        <span className="eyebrow">推荐下一步</span>
        <strong>{challenge.title}</strong>
        <p>{record.status === "in-progress" ? "继续完成本关实验，补全缺失连线。" : "进入本关，理解新的电路结构。"}</p>
        <div className="next-step-card-meta">
          <span>得分 {record.bestScore ?? 0}</span>
          <small>{record.attempts ?? 0} 次尝试</small>
          <span className={`next-step-card-status ${record.status ?? "not-started"}`}>
            {record.status === "completed" ? "已完成" : record.status === "in-progress" ? "进行中" : "未开始"}
          </span>
        </div>
      </div>
      <button className="primary-button" onClick={onEnter} type="button">
        <Play size={18} weight="fill" />
        进入实验
      </button>
    </div>
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
    "computer-components": {
      label: "五大部件协同",
      hint: "把一次计算看成输入、存储、控制、运算和输出之间的协作，而不是单个硬件独立完成。",
      inputText: `输入信号=${inputState.a}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
        { className: "horizontal mux-out", activeAt: 2 },
      ],
      nodes: [
        { name: "输入设备", tone: "io", className: "source top", detail: "把外部信息送入系统" },
        { name: "存储器", tone: "module", className: "module wide", detail: "保存程序和数据" },
        { name: "控制器", tone: "control", className: "mux center", detail: "发出控制信号" },
        { name: "运算器", tone: "logic", className: "logic core", detail: "执行计算" },
        { name: "输出设备", tone: "output", className: "output", detail: "呈现最终结果" },
      ],
    },
    "program-flow": {
      label: "程序运行路线",
      hint: "从键盘输入 1+1 到屏幕显示 2，中间经过主存、CPU取指和运算器执行。",
      inputText: `${inputState.a}+${inputState.b}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
        { className: "horizontal top-out", activeAt: 2 },
        { className: "horizontal mux-out", activeAt: 3 },
      ],
      nodes: [
        { name: "键盘输入", tone: "io", className: "input", detail: "输入表达式" },
        { name: "主存", tone: "module", className: "module wide", detail: "保存程序和数据" },
        { name: "CPU取指", tone: "control", className: "mux center", detail: "取得下一条指令" },
        { name: "运算器执行", tone: "logic", className: "adder core", detail: "执行 1+1" },
        { name: "屏幕输出", tone: "output", className: "output", detail: "显示结果" },
      ],
    },
    "instruction-data": {
      label: "指令与数据",
      hint: "同一片内存中的内容没有天然标签，CPU根据取指阶段或执行阶段决定如何解释它。",
      inputText: `地址=${inputState.address}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 1 },
        { className: "horizontal mux-out", activeAt: 2 },
      ],
      nodes: [
        { name: "程序计数器PC", tone: "control", className: "selector signal", detail: "指出下一条指令地址" },
        { name: "地址100", tone: "module", className: "module wide", detail: "取指阶段是指令" },
        { name: "地址101/102", tone: "module", className: "source bottom", detail: "执行阶段是数据" },
        { name: "指令寄存器IR", tone: "control", className: "mux center", detail: "保存当前指令" },
        { name: "结果寄存器", tone: "output", className: "output", detail: "保存运算结果" },
      ],
    },
    "memory-address": {
      label: "\u5b58\u50a8\u5668\u4e0e\u5730\u5740\u8bbf\u95ee",
      hint: "\u4e00\u6b21\u8bfb\u4e3b\u5b58\u5206\u4e24\u6761\u542b\u4e49\u4e0d\u540c\u7684\u8def\uff1a\u5730\u5740\u5148\u8fdb\u5165 MAR \u9009\u62e9\u5355\u5143\uff0c\u6570\u636e\u518d\u4ece\u4e3b\u5b58\u8fdb\u5165 MDR \u5e76\u9001\u56de CPU\u3002",
      inputText: `\u5730\u5740=${inputState.address}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
        { className: "horizontal mux-out", activeAt: 2 },
      ],
      nodes: [
        { name: "\u8bbf\u95ee\u5730\u5740", tone: "io", className: "input", detail: "CPU \u53d1\u51fa\u5730\u5740" },
        { name: "\u5730\u5740\u5bc4\u5b58\u5668MAR", tone: "control", className: "selector signal", detail: "\u4fdd\u5b58\u8981\u8bbf\u95ee\u7684\u5730\u5740" },
        { name: "\u4e3b\u5b58\u5355\u5143", tone: "module", className: "module wide", detail: "\u6309\u5730\u5740\u8bfb\u51fa\u6570\u636e" },
        { name: "\u6570\u636e\u5bc4\u5b58\u5668MDR", tone: "module", className: "mux center", detail: "\u6682\u5b58\u4e3b\u5b58\u6570\u636e" },
        { name: "CPU\u6570\u636e\u603b\u7ebf", tone: "output", className: "output", detail: "\u9001\u56de CPU \u5185\u90e8" },
      ],
    },
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
    "and-gate": {
      label: "与门真值表",
      hint: "两个输入都为 1 时输出才为 1。先把 A、B 接进与门，再把结果接到输出端。",
      inputText: `A=${inputState.a} · B=${inputState.b}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 0 },
        { className: "horizontal mux-out", activeAt: 1 },
      ],
      nodes: [
        { name: "输入A", tone: "io", className: "source top", detail: "第一个条件" },
        { name: "输入B", tone: "io", className: "source bottom", detail: "第二个条件" },
        { name: "与门", tone: "logic", className: "logic core", detail: "同时为 1 才通过" },
        { name: "输出Y", tone: "output", className: "output", detail: "观察与运算结果" },
      ],
    },
    "or-gate": {
      label: "或门真值表",
      hint: "只要 A 或 B 有一个为 1，输出就为 1。重点观察 0/1 组合下的输出变化。",
      inputText: `A=${inputState.a} · B=${inputState.b}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 0 },
        { className: "horizontal mux-out", activeAt: 1 },
      ],
      nodes: [
        { name: "输入A", tone: "io", className: "source top", detail: "第一路输入" },
        { name: "输入B", tone: "io", className: "source bottom", detail: "第二路输入" },
        { name: "或门", tone: "logic", className: "logic core", detail: "至少一路为 1" },
        { name: "输出Y", tone: "output", className: "output", detail: "观察或运算结果" },
      ],
    },
    "not-gate": {
      label: "非门取反",
      hint: "非门只有一路输入。A 为 0 时输出 1，A 为 1 时输出 0。",
      inputText: `A=${inputState.a}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
      ],
      nodes: [
        { name: "输入A", tone: "io", className: "input", detail: "待取反信号" },
        { name: "非门", tone: "logic", className: "logic core", detail: "反相输出" },
        { name: "输出Y", tone: "output", className: "output", detail: "观察取反结果" },
      ],
    },
    "xor-gate": {
      label: "异或门真值表",
      hint: "两个输入不同则输出 1，相同则输出 0。这一关直接铺垫半加器的和位。",
      inputText: `A=${inputState.a} · B=${inputState.b}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 0 },
        { className: "horizontal mux-out", activeAt: 1 },
      ],
      nodes: [
        { name: "输入A", tone: "io", className: "source top", detail: "第一路输入" },
        { name: "输入B", tone: "io", className: "source bottom", detail: "第二路输入" },
        { name: "异或门", tone: "logic", className: "xor top", detail: "不同为 1" },
        { name: "输出Y", tone: "output", className: "output", detail: "观察异或结果" },
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
    "machine-number": {
      label: "机器数编码流水线",
      hint: "先判断符号位，再拆数值位；负数从原码到反码，再通过加一得到补码，最后写入结果寄存器。",
      inputText: `整数=${inputState.signedValue}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
        { className: "horizontal chain-two", activeAt: 2 },
        { className: "horizontal mux-out", activeAt: 3 },
      ],
      nodes: [
        { name: "十进制数", tone: "io", className: "input", detail: "课堂输入 -7 到 7" },
        { name: "符号位判断", tone: "control", className: "selector signal", detail: "正数 0 / 负数 1" },
        { name: "数值位拆分", tone: "module", className: "module wide", detail: "绝对值转二进制" },
        { name: "反码生成器", tone: "logic", className: "logic core", detail: "负数逐位取反" },
        { name: "补码生成器", tone: "module", className: "mux center", detail: "负数反码加 1" },
        { name: "结果寄存器", tone: "output", className: "output", detail: "保存最终补码" },
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

function Stepper({ label, value, min = 0, max, onChange }) {
  return (
    <label className="toggle-control">
      <span>{label}</span>
      <div className="stepper">
        <button onClick={() => onChange(Math.max(min, value - 1))} type="button">-</button>
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
    "computer-components": "这一关先建立整机地图：输入、存储、控制、运算和输出五类部件各司其职。",
    "program-flow": "这一关把 1+1 的运行过程串起来，重点看程序如何从输入变成输出。",
    "instruction-data": "这一关解释为什么内存里的二进制既可能是指令，也可能是数据。",
    "memory-address": "\u8fd9\u4e00\u5173\u628a\u4e00\u6b21\u4e3b\u5b58\u8bfb\u53d6\u62c6\u6210\u5730\u5740\u8def\u5f84\u548c\u6570\u636e\u8def\u5f84\uff1a\u5730\u5740\u8fdb MAR\uff0c\u4e3b\u5b58\u8bfb\u51fa\u7684\u6570\u636e\u8fdb MDR\uff0c\u518d\u56de\u5230 CPU \u6570\u636e\u603b\u7ebf\u3002",
    "data-flow": "这一关的画布是一条最基础的信号通道，先理解输入如何走到输出。",
    "and-gate": "这一关只看与门：A 和 B 必须同时为 1，输出Y才会变成 1。",
    "or-gate": "这一关只看或门：A 和 B 只要有一路为 1，输出Y就会变成 1。",
    "not-gate": "这一关只看非门：输入A会被取反，0变1，1变0。",
    "xor-gate": "这一关只看异或门：两个输入不同输出为1，相同输出为0。",
    "half-adder": "这一关会把和位和进位拆成两条并行支路，你能直观看到两种结果是如何分工产生的。",
    "full-adder": "这一关会出现真正的进位分叉：一条线继续算和位，另一条线专门负责判断是否向高位进位。",
    "machine-number": "这一关把有符号整数进入运算器前的编码过程拆开：先判断符号位，再看原码、反码，最后得到补码。",
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
    value: "整数",
    signMagnitude: "原码",
    onesComplement: "反码",
    twosComplement: "补码",
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


