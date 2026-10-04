import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  CaretDown,
  ChartPieSlice,
  CheckCircle,
  ClockCountdown,
  Cpu,
  Flame,
  GearSix,
  House,
  Lifebuoy,
  Notebook,
  MonitorPlay,
  Play,
  SealCheck,
  Sparkle,
  Star,
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
import { buildCourseRouteGroups, findNextRecommendedChallenge } from "./courseRoute.js";
import { buildRealtimeDiagnostics } from "./realtimeDiagnostics.js";
import { buildMemoryAccessState } from "./memorySystem.js";
import { api } from "./apiClient.js";
import { setPersonalLearningRole } from './personalLearningApi.js';
import { statusText, statusTone, formatMinutes, formatEndpointLabel } from "./components/labUtils.js";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { QuestSettlement } from "./components/quest/QuestSettlement.jsx";
import { buildQuestSettlement } from "./questExperience.js";
import { useLabState } from "./hooks/useLabState.js";
import { clearViewSession, readViewSession, resolveRestorableView, writeViewSession } from "./viewSession.js";
import { useClassroomSession } from "./hooks/useClassroomSession.js";
import { useTeacherSession } from "./hooks/useTeacherSession.js";
import { useViewHistory } from './hooks/useViewHistory.js';
import { getActiveGuideForChallenge } from "./courseWorkbenchState.js";
import avatarImage from "./assets/alex-chen-avatar.webp";
import labIllustration from "./assets/lab-circuit-illustration.webp";

const NotesPage = lazy(() => import("./components/NotesPage.jsx")
  .then((module) => ({ default: module.NotesPage })));
const LoginPortal=lazy(()=>import('./components/auth/LoginPortal.jsx').then(module=>({default:module.LoginPortal})));
const PlatformSupport = lazy(() => import('./components/PlatformSupport.jsx').then(module=>({default:module.PlatformSupport})));
const StudentHome = lazy(() => import("./components/StudentHome.jsx")
  .then((module) => ({ default: module.StudentHome })));
const StudentRecords = lazy(() => import("./components/StudentRecords.jsx")
  .then((module) => ({ default: module.StudentRecords })));
const MistakeBookPage = lazy(() => import("./components/MistakeBookPage.jsx")
  .then((module) => ({ default: module.MistakeBookPage })));
const SettingsModal = lazy(() => import("./components/TeacherSettingsPanel.jsx")
  .then((module) => ({ default: module.SettingsModal })));
const TeacherStudioDashboard = lazy(() => import("./components/TeacherDashboard.jsx")
  .then((module) => ({ default: module.TeacherStudioDashboard })));
const TeacherLearningReview = lazy(() => import('./components/teacher/TeacherLearningReview.jsx').then(module => ({ default: module.TeacherLearningReview })));
const StudentAssignments = lazy(() => import("./components/StudentAssignments.jsx")
  .then((module) => ({ default: module.StudentAssignments })));
const DemoPage = lazy(() => import("./components/DemoPage.jsx")
  .then((module) => ({ default: module.DemoPage })));
const InteractiveDemos = lazy(() => import("./components/InteractiveDemos.jsx")
  .then((module) => ({ default: module.InteractiveDemos })));
const CoursewareView = lazy(() => import("./components/CoursewareView.jsx")
  .then((module) => ({ default: module.CoursewareView })));
const HardwareGamePage = lazy(() => import("./components/HardwareGamePage.jsx")
  .then((module) => ({ default: module.HardwareGamePage })));
const LabPage = lazy(() => import("./components/LabPage.jsx")
  .then((module) => ({ default: module.LabPage })));

// 「关卡实验」不再出现在学生导航里：实验一律从课程首页的章节卡片进入，
// 刷新恢复与课堂任务等场景仍可直接落在实验台视图。
const navGroups = [
  {
    id: "learn",
    label: "课程学习",
    items: [
      { id: "home", label: "课程首页", icon: House },
      { id: "hardware-game", label: "硬件配置挑战", icon: Cpu },
      { id: "courseware", label: "课程课件", icon: BookOpen },
      { id: "demos", label: "互动演示", icon: MonitorPlay },
    ],
  },
  {
    id: "review",
    label: "学习复盘",
    items: [
      { id: "records", label: "学习记录", icon: ChartPieSlice },
      { id: "mistakes", label: "错题本", icon: BookOpen },
      { id: "notes", label: "知识库", icon: Notebook },
    ],
  },
  {
    id: "extend",
    label: "拓展协作",
    items: [
      { id: "assignments", label: "课后作业", icon: Notebook },
    ],
  },
  {
    id: "manage",
    label: "教学管理",
    items: [
      { id: "teacher", label: "教师看板", icon: ChartPieSlice, role: "teacher" },
    ],
  },
];
function FeatureLoading({ label }) {
  return <div className="flow-loading">{label}</div>;
}

function LabFeatureFallback({ challenge, completed, onBack, onComplete }) {
  const isOverview = challenge?.id === "computer-components";
  return (
    <div className="lab-screen">
      <section className="section-panel empty-state" role="alert">
        <strong>{isOverview ? "3D \u573a\u666f\u5df2\u5207\u6362\u4e3a\u9759\u6001\u6559\u5b66\u89c6\u56fe" : "\u5b9e\u9a8c\u5de5\u4f5c\u53f0\u6682\u65f6\u4e0d\u53ef\u7528"}</strong>
        {isOverview ? (
          <>
            <p>{"\u88c5\u914d\u987a\u5e8f\uff1a\u673a\u7bb1 \u2192 \u7535\u6e90 \u2192 \u4e3b\u677f \u2192 CPU \u2192 \u5185\u5b58 \u2192 \u663e\u5361 \u2192 \u786c\u76d8\u3002"}</p>
            <p>{"\u6570\u636e\u603b\u7ebf\u4f20\u8f93\u6570\u636e\uff0c\u5730\u5740\u603b\u7ebf\u9009\u62e9\u4f4d\u7f6e\uff0c\u63a7\u5236\u603b\u7ebf\u534f\u8c03\u8bfb\u5199\u548c\u6267\u884c\u3002"}</p>
            <button className="primary-button" disabled={completed} onClick={onComplete} type="button">
              {completed ? "\u5df2\u5b8c\u6210\u9759\u6001\u63a2\u7d22" : "\u5b8c\u6210\u9759\u6001\u63a2\u7d22"}
            </button>
          </>
        ) : <p>{"\u8bf7\u8fd4\u56de\u8bfe\u7a0b\u9996\u9875\u540e\u91cd\u8bd5\uff0c\u5df2\u4fdd\u5b58\u7684\u5b66\u4e60\u8bb0\u5f55\u4e0d\u4f1a\u4e22\u5931\u3002"}</p>}
        <button className="ghost-button" onClick={onBack} type="button">{"\u8fd4\u56de\u8bfe\u7a0b\u9996\u9875"}</button>
      </section>
    </div>
  );
}



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


function clampPlacement(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  const activeUserRef=useRef(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [importCredentials, setImportCredentials] = useState([]);
  const pendingDestinationRef = useRef(null);
  const [demoId, setDemoId] = useState(() => new URLSearchParams(window.location.search).get("demo"));
  const [activeView, setActiveView] = useState(demoId ? "demo" : "home");
  const [studyTarget, setStudyTarget] = useState(null);
  const platformTopbarRef=useRef(null);
  useEffect(()=>{
    const element=platformTopbarRef.current;
    if(!element||typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(()=>element.parentElement?.style.setProperty('--platform-nav-height',`${element.getBoundingClientRect().height}px`));
    observer.observe(element);
    return ()=>observer.disconnect();
  },[activeView,showLogin,auth.status]);
  const [progress, setProgress] = useState(() => buildInitialLearningProgress());
  const [allowSkipLocked, setAllowSkipLocked] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [notes, setNotes] = useState([]);
  const [studentProjects, setStudentProjects] = useState([]);
  const [statusMessage, setStatusMessage] = useState("欢迎来到芯游记，选择章节开始探索。");
  const [showUserPanel, setShowUserPanel] = useState(false);
  useEffect(() => {
    if (!showUserPanel) return;
    const closeOutside = event => { if (!event.target.closest('.profile-wrap')) setShowUserPanel(false); };
    const closeOnEscape = event => { if (event.key === 'Escape') { setShowUserPanel(false); document.querySelector('.profile-button')?.focus(); } };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [showUserPanel]);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState('account');
  const [supportPanel,setSupportPanel]=useState(null);
  const [roleDataError,setRoleDataError]=useState('');
  const [roleDataLoading,setRoleDataLoading]=useState(false);
  const [bootstrapVersion,setBootstrapVersion]=useState(0);
  const [online,setOnline]=useState(()=>navigator.onLine);
  useEffect(()=>{
    const update=()=>setOnline(navigator.onLine);
    window.addEventListener('online',update);window.addEventListener('offline',update);
    return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[]);
  const [student, setStudent] = useState({
    name: "",
    mode: "\u5f3a\u5f15\u5bfc\u6a21\u5f0f",
  });
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [selectedTeacherClassId, setSelectedTeacherClassId] = useState(null);
  const selectedTeacherClassIdRef = useRef(null);
  const classOverviewRequestIdRef = useRef(0);
  const [classOverview, setClassOverview] = useState(null);
  const [assistantReport, setAssistantReport] = useState(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [selectedTeacherStudent, setSelectedTeacherStudent] = useState(null);
  const [teacherReviewStudent, setTeacherReviewStudent] = useState('all');
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
  const [questSettlement, setQuestSettlement] = useState(null);
  const prevFeedbackRef = useRef(null);
  const classroomSession = useClassroomSession({
    userId: auth.user?.id,
    enabled: auth.user?.role === "student",
  });
  const lab = useLabState({
    progress, setProgress, activityLog, setActivityLog,
    setStatusMessage, persistStudentAttempt, isMobile, allowSkipLocked,
    classroomChallengeId: classroomSession.viewModel.active && !classroomSession.viewModel.ended
      ? classroomSession.viewModel.currentStage?.challengeId : null,
  });

  const teacherSession = useTeacherSession({
    classId: selectedTeacherClassId,
    enabled: auth.user?.role === "teacher" && selectedTeacherClassId != null,
  });

  const memoryAccessState = useMemo(
    () => buildMemoryAccessState(memoryAddress, memoryOperation, memoryWriteValue),
    [memoryAddress, memoryOperation, memoryWriteValue],
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (event) => setIsMobile(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const summary = useMemo(() => summarizeLearning(LEARNING_ITEMS, progress), [progress]);
  const focusChallenge = useMemo(
    () => CHALLENGES.find((challenge) => progress[challenge.id]?.status === "in-progress") ?? lab.currentChallenge,
    [lab.currentChallenge, progress],
  );
  const upcomingChallenge = useMemo(() => {
    const currentIndex = CHALLENGES.findIndex((challenge) => challenge.id === focusChallenge.id);
    return CHALLENGES[currentIndex + 1] ?? CHALLENGES[currentIndex] ?? CHALLENGES[0];
  }, [focusChallenge]);
  const routeGroups = useMemo(() => buildCourseRouteGroups(LEARNING_ITEMS, progress), [progress]);
  const nextRecommendedChallenge = useMemo(() => findNextRecommendedChallenge(LEARNING_ITEMS, progress), [progress]);
  const activeCourseGuide = useMemo(() => getActiveGuideForChallenge(studentProjects, lab.currentChallenge?.id), [studentProjects, lab.currentChallenge?.id]);

  // Trigger quest settlement when a lab submission passes
  useEffect(() => {
    const feedback = lab.feedback;
    if (!feedback || !feedback.passed) return;
    if (prevFeedbackRef.current === feedback) return;
    prevFeedbackRef.current = feedback;
    const settlement = buildQuestSettlement(lab.selectedChallengeId, feedback, routeGroups);
    if (settlement) setQuestSettlement(settlement);
  }, [lab.feedback, lab.selectedChallengeId, routeGroups]);

  // 刷新后要恢复的实验台关卡（等学情加载完再按锁定规则打开）
  const pendingLabRestoreRef = useRef(null);
  // 初始视图记录必须同步读取：bootstrap 里 setAuth 之后会先经过一个 await，
  // 期间持久化 effect 会用默认的 home 覆盖掉待恢复的记录。
  const [initialViewSession] = useState(() => readViewSession());
  // 恢复结论落地前不要写回，避免同样的覆盖
  const restoreSettledRef = useRef(false);
  useViewHistory({user:auth.user,enabled:auth.status!=='loading'&&auth.status!=='error'&&!showLogin,route:{view:activeView,challengeId:activeView==='lab'?lab.selectedChallengeId:null,caseId:activeView==='hardware-game'?selectedHardwareCaseId:null,demoId:activeView==='demo'?demoId:null,studyTarget:activeView==='assignments'?studyTarget:null},restore:route=>{
    if(!['home','teacher','lab','hardware-game','records','mistakes','notes','assignments','courseware','demos','demo'].includes(route.view))return false;
    if(!auth.user&&!['home','courseware','demos','demo'].includes(route.view))return false;
    if(auth.user?.role==='teacher'&&!['teacher','courseware','demos','demo','hardware-game','records','mistakes','lab','assignments','notes'].includes(route.view))return false;
    if(auth.user?.role==='student'&&route.view==='teacher')return false;
    if(route.view==='lab'&&!lab.selectChallenge(route.challengeId))return false;
    if(route.view==='hardware-game'&&!HARDWARE_GAME_CASES.some(item=>item.id===route.caseId))return false;
    if(route.caseId)setSelectedHardwareCaseId(route.caseId);
    setDemoId(route.demoId??null);setStudyTarget(route.studyTarget??null);setShowUserPanel(false);setSupportPanel(null);setQuestSettlement(null);setActiveView(route.view);window.scrollTo(0,0);return true;
  }});

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const { user } = await api.me();
        if (cancelled) return;
        activeUserRef.current=user;
        setPersonalLearningRole(user.role);
        setAuth({ status: "authenticated", user });
        try { await loadRoleData(user); } catch (error) { if(!cancelled)setRoleDataError(`学习数据同步失败：${error.message}`); }
        if(cancelled||activeUserRef.current?.id!==user.id)return;
        // 刷新后回到原页面：只恢复当前身份允许停留的视图
        const restored = resolveRestorableView(initialViewSession, user.role);
        if (demoId) {
          setActiveView("demo");
        } else if (restored?.view === "lab" && restored.challengeId) {
          pendingLabRestoreRef.current = restored.challengeId;
          setActiveView("lab");
        } else if (restored) {
          setActiveView(restored.view);
        } else if (user.role === "teacher") {
          setActiveView("teacher");
        }
      } catch (error) {
        if (!cancelled) {
          setAuth({ status: error.status===401 ? "anonymous" : "error", user: null });
          if (error.status === 401 && !demoId) {
            const restored = resolveRestorableView(initialViewSession, null);
            if (restored) setActiveView(restored.view);
          }
          if(error.status!==401)setRoleDataError(`课堂服务连接失败：${error.message}`);
        }
      } finally {
        restoreSettledRef.current = true;
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, [bootstrapVersion]);

  // 记住当前页面，供刷新后恢复。
  // 登录过程中会先出现「已登录但仍是默认视图」的中间提交，此时不要记录，
  // 否则会把教师/学生带到错误的落地页。
  useEffect(() => {
    if (auth.status === "loading" || auth.status === "error" || showLogin || !restoreSettledRef.current) return;
    writeViewSession({ view: activeView, challengeId: activeView === "lab" ? lab.selectedChallengeId : null });
  }, [auth.user?.id, auth.status, activeView, lab.selectedChallengeId, showLogin]);

  // 学情加载完成后再恢复实验台关卡；目标关卡仍锁定则退回首页。
  // 必须把 activeView 纳入依赖：pendingLabRestoreRef 是在 setAuth/progress 之后才赋值的，
  // 只依赖前两者会让这次恢复永远不会执行。
  useEffect(() => {
    if (activeView !== "lab") return;
    const pending = pendingLabRestoreRef.current;
    if (!pending || !auth.user) return;
    pendingLabRestoreRef.current = null;
    // 恢复时强制进入：此刻学情可能还没加载完，按本地进度判断会误判为锁定
    if (!lab.selectChallenge(pending, { force: true })) setActiveView("home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, auth.user?.role, progress]);

  // 设置页变更（如跳关开关）后刷新班级列表
  useEffect(() => {
    function handleClassSettingsChanged() {
      if (auth.user?.role === "teacher") refreshTeacherClasses();
    }
    window.addEventListener("zcyl:class-settings-changed", handleClassSettingsChanged);
    return () => window.removeEventListener("zcyl:class-settings-changed", handleClassSettingsChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.role]);

  async function loadRoleData(user = auth.user) {
    if (!user) return;
    if (user.role === "student") {
      const results = await Promise.allSettled([api.studentProgress(), api.knowledgeDocuments(), api.studentProjects()]);
      if(activeUserRef.current?.id!==user.id)return;
      if(results[0].status==='fulfilled') {
        setProgress({ ...buildInitialLearningProgress(), ...results[0].value.progress });
        setAllowSkipLocked(Boolean(results[0].value.allowSkipLocked));
      }
      if(results[1].status==='fulfilled')setNotes((results[1].value.documents??[]).map(document=>({id:document.id,title:document.title,content:document.analysis?.summary??''})));
      if(results[2].status==='fulfilled')setStudentProjects(results[2].value.projects??[]);
      setStudent({
        name: user.displayName,
        mode: user.profile?.mode ?? "\u5f3a\u5f15\u5bfc\u6a21\u5f0f",
      });
      if(results.some(result=>result.status==='rejected'))throw new Error('部分学习记录未能读取，请重试同步。');
      setRoleDataError('');setStatusMessage('已同步当前账号的学习进度与资料。'); return;
    }
    if (user.role === "teacher") {
      const [personal] = await Promise.all([api.studentProgress(), refreshTeacherClasses()]);
      if(activeUserRef.current?.id!==user.id)return;
      setProgress({ ...buildInitialLearningProgress(), ...personal.progress });
      setAllowSkipLocked(true);
      setStudent({ name: user.displayName, mode: user.profile?.mode ?? '强引导模式' });
      setRoleDataError('');
    }
  }

  function resetAssistantState() {
    setAssistantReport(null);
    setAssistantError("");
    setAssistantLoading(false);
  }

  async function refreshTeacherClasses(preferredClassId = selectedTeacherClassIdRef.current) {
    const teacherId=activeUserRef.current?.id;
    const { classes } = await api.teacherClasses();
    if(activeUserRef.current?.id!==teacherId||activeUserRef.current?.role!=='teacher')return;
    setTeacherClasses(classes);
    const nextClassId = classes.some((item) => item.id === preferredClassId)
      ? preferredClassId
      : classes[0]?.id ?? null;
    if (selectedTeacherClassIdRef.current !== nextClassId) {
      resetAssistantState();
    }
    selectedTeacherClassIdRef.current = nextClassId;
    setSelectedTeacherClassId(nextClassId);
    await refreshClassOverview(nextClassId);
  }

  async function refreshClassOverview(classId = selectedTeacherClassIdRef.current) {
    const requestId = ++classOverviewRequestIdRef.current;
    if (!classId) {
      selectedTeacherClassIdRef.current = null;
      setClassOverview(null);
      setSelectedTeacherStudent(null);
      resetAssistantState();
      return;
    }
    const overview = await api.classOverview(classId);
    if (
      requestId !== classOverviewRequestIdRef.current
      || selectedTeacherClassIdRef.current !== classId
    ) return;
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

  async function completeLogin(user, destination) {
    activeUserRef.current=user;
    setPersonalLearningRole(user.role); setTeacherReviewStudent('all');
    setProgress(buildInitialLearningProgress());setNotes([]);setStudentProjects([]);setActivityLog([]);setRoleDataError('');
    setAuth({ status: "authenticated", user });
    try { await loadRoleData(user); } catch(error) {setRoleDataError(`学习数据同步失败：${error.message}`);}
    setShowLogin(false);
    if (user.role === "teacher") {
      setActiveView("teacher");
    } else if (destination?.view === "demo" && demoId) {
      setActiveView("demo");
    } else if (destination?.type === "challenge") {
      openChallenge(destination.challengeId);
    } else {
      setActiveView(destination?.view ?? "home");
    }
  }

  async function handleLogin(event, role) {
    event.preventDefault();
    setLoginError("");
    try {
      const { user } = await api.login({ ...loginForm, role });
      const destination = pendingDestinationRef.current;
      pendingDestinationRef.current = null;
      await completeLogin(user, destination);
    } catch (error) {
      setLoginError(error.message);
    }
  }

  // 演示入口按身份创建或复用专用演示账号。
  async function handleDemoLogin(role = 'student') {
    setLoginError("");
    try {
      const { user } = await api.demoLogin({ role });
      const destination = pendingDestinationRef.current;
      pendingDestinationRef.current = null;
      await completeLogin(user, destination);
    } catch (error) {
      setLoginError("演示账号登录失败：" + error.message);
    }
  }

  async function handleLogout() {
    try { await api.logout(); } catch(error) {if(error.status!==401){setRoleDataError(`退出失败：${error.message}。请重试退出。`);setShowUserPanel(false);return;}}
    setShowUserPanel(false);
    activeUserRef.current=null;
    setPersonalLearningRole(null); setTeacherReviewStudent('all');
    setAuth({ status: "anonymous", user: null });
    setProgress(buildInitialLearningProgress());
    setNotes([]);
    setActivityLog([]);setStudentProjects([]);setAllowSkipLocked(false);setRoleDataError('');
    setTeacherClasses([]);setClassOverview(null);setSelectedTeacherClassId(null);selectedTeacherClassIdRef.current=null;
    setSelectedTeacherStudent(null);setAssistantReport(null);setHardwareFeedback(null);
    setSelectedHardwareCaseId(HARDWARE_GAME_CASES[0].id);setHardwareSelection({cpu:'cpu-i3',memory:'mem-8',storage:'ssd-512',gpu:'gpu-integrated'});
    setQuestSettlement(null);prevFeedbackRef.current=null;setSupportPanel(null);setShowSettings(false);
    setStatusMessage('已退出登录，可以浏览课程或登录其他账号。');
    changeView("home");
    // 同一台机房电脑换人登录时，不要带上一位学生停留的页面
    pendingLabRestoreRef.current = null;
    clearViewSession();
  }

  function changeView(view) {
    if (auth.user?.role === 'teacher' && view === 'home') view = 'teacher';
    if (!auth.user && !["home", "courseware", "demos"].includes(view)) {
      requestLogin({ type: "view", view });
      return;
    }
    setShowUserPanel(false);
    setSupportPanel(null);
    if (demoId) {
      setDemoId(null);
    }
    setStudyTarget(null);
    setActiveView(view);
    window.scrollTo(0,0);
    setStatusMessage(`已切换到${navGroups.flatMap((group) => group.items).find((item) => item.id === view)?.label ?? "当前页面"}。`);
  }

  function openDemo(id) {
    setShowUserPanel(false);
    setSupportPanel(null);
    setStudyTarget(null);
    setDemoId(id);
    setActiveView("demo");
    window.scrollTo(0, 0);
  }

  function openStudyTarget(target) {
    if (auth.user?.role === 'teacher' && target?.source === 'assignment') { changeView('teacher'); return; }
    changeView(target?.source==='service'?"hardware-game":"assignments");
    setStudyTarget(target);
  }

  function navigateToChallenge(challengeId) {
    if (!['student','teacher'].includes(auth.user?.role)) {
      requestLogin({ type: "challenge", challengeId });
      return;
    }
    openChallenge(challengeId);
  }

  function openChallenge(challengeId) {
    setShowUserPanel(false);
    if (challengeId && challengeId.startsWith("game-")) {
      setStudyTarget({source:'assembly',caseId:challengeId});
      setSelectedHardwareCaseId(challengeId);
      setActiveView("hardware-game");
      return;
    }
    if (!lab.selectChallenge(challengeId)) return;
    setActiveView("lab");
  }

  function requestLogin(destination = null) {
    pendingDestinationRef.current = destination ?? (demoId ? {type:"view",view:"demo"} : null);
    setLoginError("");
    setShowLogin(true);
  }

  function returnToGuestHome() {
    pendingDestinationRef.current = null;
    setLoginError("");
    setShowLogin(false);
    changeView("home");
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
    const saved = await persistStudentAttempt(selectedCase.id, result);
    return { result, synced: Boolean(saved) };
  }

  async function enterClassroomMission(sessionId) {
    try {
      const entered = await classroomSession.enter(sessionId);
      const stageIndex = entered.studentState?.current_stage_index ?? 0;
      const challengeId = entered.mission?.stages?.[stageIndex]?.challengeId ?? "computer-components";
      navigateToChallenge(challengeId);
    } catch (error) {
      setStatusMessage("\u8fdb\u5165\u8bfe\u5802\u4efb\u52a1\u5931\u8d25\uff1a" + error.message);
    }
  }

  async function persistStudentAttempt(challengeId, result) {
    if (!['student','teacher'].includes(auth.user?.role)) return;
    try {
      const saved = classroomSession.viewModel.active && !classroomSession.viewModel.ended
        ? await classroomSession.submit({ challengeId, result })
        : await api.submitAttempt({ challengeId, result });
      if (saved.progress) {
        setProgress({ ...buildInitialLearningProgress(), ...saved.progress });
      }
      return saved;
    } catch (error) {
      setStatusMessage("\u63d0\u4ea4\u5df2\u5728\u672c\u9875\u8bb0\u5f55\uff0c\u4f46\u540c\u6b65\u670d\u52a1\u5668\u5931\u8d25\uff1a" + error.message);
    }
  }

  async function saveStudentSettings(settings) {
    const accountId = activeUserRef.current?.id;
    const response = await api.updateAccountSettings(settings);
    const { user } = response;
    if (!accountId || activeUserRef.current?.id !== accountId) throw new Error('账号已切换，请在当前账号重新打开设置。');
    activeUserRef.current = user;
    setAuth((current) => ({ ...current, user }));
    if (user.role === "student") {
      setStudent({ name: user.displayName, mode: user.profile?.mode ?? "强引导模式" });
    }
    return response;
  }

  async function createTeacherClass() {
    try {
      const { class: createdClass } = await api.createClass({ name: classNameDraft });
      setTeacherMessage("\u73ed\u7ea7\u5df2\u521b\u5efa\uff1a" + createdClass.name);
      selectedTeacherClassIdRef.current = createdClass.id;
      setSelectedTeacherClassId(createdClass.id);
      await refreshTeacherClasses(createdClass.id);
    } catch (error) {
      setTeacherMessage("\u521b\u5efa\u73ed\u7ea7\u5931\u8d25\uff1a" + error.message);
    }
  }

  async function importStudentsToClass() {
    if (!selectedTeacherClassId) return;
    try {
      const report = await api.importStudents(selectedTeacherClassId, csvImportText);
      setTeacherMessage(`导入完成：新增 ${report.imported}，更新 ${report.updated}，跳过 ${report.skipped}`);
      setImportCredentials(report.credentials ?? []);
      await refreshTeacherClasses(selectedTeacherClassId);
    } catch (error) {
      setTeacherMessage(`导入失败：${error.message}`);
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

  if (auth.status === "loading" || auth.status==='error') {
    return <main className="platform-connection"><img src="/home/wordmark.png" alt="芯游记"/><section className="section-panel"><Cpu size={32}/><h1>{auth.status==='error'?'暂时无法连接课堂服务':'正在连接课堂服务'}</h1><p>{auth.status==='error'?roleDataError:'正在确认账号与学习记录，请稍候。'}</p>{auth.status==='error'&&<button className="primary-button" type="button" onClick={()=>{setAuth({status:'loading',user:null});setRoleDataError('');setBootstrapVersion(version=>version+1);}}>重新连接</button>}</section></main>;
  }

  if (showLogin) {
    return renderLogin();
  }

  function renderPlatformTopbar() {
    return (
      <header ref={platformTopbarRef} className="topbar">
        <button className="brand" onClick={() => changeView("home")} type="button">
          <img className="brand-wordmark" src="/home/wordmark.png" alt="芯游记" />
          <img className="brand-logo" src="/home/logo.png" alt="芯游记" />
        </button>

        <nav className="topbar-nav" aria-label="主导航">
          {navGroups.flatMap((group) => group.items).filter((item) => auth.user?.role === "teacher" ? ["teacher", "hardware-game", "records", "mistakes", "courseware", "demos", "notes"].includes(item.id) : auth.user?.role === "student" ? item.id !== "teacher" : ["home", "courseware", "demos"].includes(item.id)).map(({ id, icon: Icon, label }) => (
            <button
              className={(activeView === id || (activeView === "lab" && id === "home") || (activeView === "demo" && id === (demoId === "courseware" ? "courseware" : "demos"))) ? "topbar-nav-item active" : "topbar-nav-item"}
              key={id}
              onClick={() => changeView(id)}
              type="button"
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <button
            aria-label="通知"
            className="icon-button"
            aria-haspopup="dialog"
            onClick={() => setSupportPanel('notifications')}
            type="button"
          >
            <Bell size={22} />
            {(auth.user?.role==='student'?classroomSession.viewModel.active&&!classroomSession.viewModel.ended:teacherSession.viewModel.active&&!teacherSession.viewModel.ended)&&<span className="notification-dot">1</span>}
          </button>
          {auth.user ? <div className="profile-wrap">
            <button className="profile-button" aria-expanded={showUserPanel} aria-controls="profile-options" onClick={() => setShowUserPanel((value) => !value)} type="button">
              <img alt="学生头像" src={avatarImage} />
              <span>
                <strong>{auth.user?.displayName ?? "学习档案"}</strong>
                <small>{auth.user?.role === "teacher" ? "教师" : student.mode}</small>
              </span>
              <CaretDown size={18} />
            </button>
            {showUserPanel ? (
              <div className="profile-menu" id="profile-options">
                <button onClick={() => {setShowUserPanel(false);setSettingsSection('account');setShowSettings(true);}} type="button">个人设置</button>
                <button onClick={() => {setShowUserPanel(false);setSupportPanel('help');}} type="button">帮助支持</button>
                <button onClick={handleLogout} type="button">退出登录</button>
              </div>
            ) : null}
          </div> : <button className="ghost-button" onClick={() => requestLogin()} type="button">登录</button>}
        </div>
      </header>
    );
  }

  if (activeView === "lab") {
    return (
      <div className={'app-shell lab-mode-shell'+(lab.currentChallenge?.id==='computer-components'?' lab-overview-shell':'')}>
        {renderPlatformTopbar()}
        {renderPlatformState()}
        <ErrorBoundary fallback={(
          <LabFeatureFallback
            challenge={lab.currentChallenge}
            completed={lab.currentRecord?.status === "completed"}
            onBack={() => changeView("home")}
            onComplete={lab.completeOverviewChallenge}
          />
        )}>
          <Suspense fallback={<FeatureLoading label="正在加载实验工作台..." />}>
            <LabPage lab={lab} isMobile={isMobile}
              memoryAddress={memoryAddress} memoryOperation={memoryOperation} memoryWriteValue={memoryWriteValue}
              setMemoryAddress={setMemoryAddress} setMemoryOperation={setMemoryOperation} setMemoryWriteValue={setMemoryWriteValue}
              memoryAccessState={memoryAccessState}
              statusMessage={statusMessage} changeView={changeView}
              courseGuide={activeCourseGuide}
              classroomLabViewModel={{ ...classroomSession.viewModel, submitAttempt: classroomSession.submit }} />
          </Suspense>
        </ErrorBoundary>
        {renderSettingsModal()}
        {renderQuestSettlement()}
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className={activeView === "teacher" ? "app-shell teacher-reference-shell" : activeView === "home" ? "app-shell home-shell" : activeView === "demo" ? "app-shell demo-mode-shell" : "app-shell"}>
      {renderPlatformTopbar()}
      {renderPlatformState()}

      <div className="workspace">
        <main className="dashboard">
          <Suspense fallback={<FeatureLoading label="正在加载当前功能..." />}>
          <ErrorBoundary key={activeView}>
          {!["teacher","demo"].includes(activeView) ? (
            <div className="status-banner">
              <Sparkle size={18} />
              <span>{statusMessage}</span>
            </div>
          ) : null}

          {activeView === "home" ? <StudentHome progress={progress} routeGroups={routeGroups} nextRecommendedChallenge={nextRecommendedChallenge} navigateToChallenge={navigateToChallenge} summary={summary} notes={notes} onOpenKnowledge={()=>changeView('notes')} classroomViewModel={classroomSession.viewModel} onClassroomEnter={enterClassroomMission} allowSkipLocked={allowSkipLocked} userId={auth.user?.id ?? auth.user?.username ?? "anonymous"} /> : null}
          {['records','mistakes'].includes(activeView) && auth.user?.role === 'teacher' ? <TeacherLearningReview key={auth.user.id} mode={activeView} classes={teacherClasses} classId={selectedTeacherClassId} onClassChange={id=>{selectedTeacherClassIdRef.current=id;setSelectedTeacherClassId(id);refreshClassOverview(id);}} selectedStudent={teacherReviewStudent} onStudentChange={setTeacherReviewStudent} changeView={changeView} navigateToChallenge={navigateToChallenge} openStudyTarget={openStudyTarget}/> : null}
          {activeView === "records" && auth.user?.role !== 'teacher' ? <StudentRecords key={auth.user?.id} userId={auth.user?.id} summary={summary} progress={progress} activityLog={activityLog} changeView={changeView} selectChallenge={navigateToChallenge} openStudyTarget={openStudyTarget} /> : null}
          {activeView === "demos" ? <InteractiveDemos openDemo={openDemo} navigateToChallenge={navigateToChallenge} /> : null}
          {activeView === "demo" ? <DemoPage demoId={demoId} role={auth.user?.role} changeView={changeView} openStudyTarget={openStudyTarget} /> : null}
          {activeView === "mistakes" && auth.user?.role !== 'teacher' ? <MistakeBookPage key={auth.user?.id} navigateToChallenge={navigateToChallenge} changeView={changeView} openStudyTarget={openStudyTarget} /> : null}
          {activeView === "hardware-game" ? (
            <ErrorBoundary>
              <Suspense fallback={<FeatureLoading label="正在加载硬件配置挑战..." />}>
                <HardwareGamePage key={auth.user?.id} userId={auth.user?.id} allowCustom={auth.user?.role !== 'teacher'} hardwareSelection={hardwareSelection} setHardwareSelection={setHardwareSelection} hardwareFeedback={hardwareFeedback} setHardwareFeedback={setHardwareFeedback} selectedHardwareCaseId={selectedHardwareCaseId} setSelectedHardwareCaseId={setSelectedHardwareCaseId} progress={progress} submitHardwareBuild={submitHardwareBuild} serviceTarget={['service','assembly'].includes(studyTarget?.source)?studyTarget:null} onServiceExit={()=>setStudyTarget(null)}/>
              </Suspense>
            </ErrorBoundary>
          ) : null}
          {activeView === "notes" ? <NotesPage key={auth.user?.id} userId={auth.user?.id} /> : null}
          {activeView === "assignments" ? <StudentAssignments key={`${auth.user?.id}:${JSON.stringify(studyTarget)}`} userId={auth.user?.id} practiceOnly={auth.user?.role === 'teacher'} destination={studyTarget} progress={progress} navigateToChallenge={navigateToChallenge} onOpenMistakes={() => changeView("mistakes")} onOpenLearning={() => changeView('records')} /> : null}
          {activeView === "courseware" ? <CoursewareView key={auth.user?.id??'guest'} navigateToChallenge={navigateToChallenge} auth={auth} teacherClasses={teacherClasses} selectedTeacherClassId={selectedTeacherClassId} onSelectTeacherClass={setSelectedTeacherClassId} /> : null}
          {activeView === "teacher" ? (
            <ErrorBoundary>
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
              teacherSession={teacherSession}
            />
            </ErrorBoundary>
          ) : null}
          </ErrorBoundary>
          </Suspense>
        </main>
      </div>

      {renderSettingsModal()}

      {renderQuestSettlement()}
    </div>
    </ErrorBoundary>
  );

  function renderLogin() {
    return (
      <Suspense fallback={<FeatureLoading label="正在加载登录界面…"/>}><LoginPortal
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        loginError={loginError}
        onSubmit={handleLogin}
        onBack={returnToGuestHome}
        onDemoLogin={handleDemoLogin}
      /></Suspense>
    );
  }

  async function retryRoleData() {
    if(roleDataLoading)return;setRoleDataLoading(true);
    try {await loadRoleData();} catch(error) {setRoleDataError(`学习数据同步失败：${error.message}`);} finally {setRoleDataLoading(false);}
  }

  function renderPlatformState() {
    return <>{(!online||roleDataError)&&<div className="platform-sync-banner" role="alert"><WarningCircle size={20}/><span>{!online?'网络连接已断开，请恢复网络后同步或提交。':roleDataError}</span>{online&&<button className="ghost-button" type="button" disabled={roleDataLoading} onClick={retryRoleData}>{roleDataLoading?'正在同步…':'重试同步'}</button>}</div>}{supportPanel&&<Suspense fallback={<FeatureLoading label="正在加载帮助与提醒…"/>}><PlatformSupport mode={supportPanel} user={auth.user} classroom={auth.user?.role==='teacher'?teacherSession.viewModel:classroomSession.viewModel} nextChallenge={nextRecommendedChallenge} onClose={()=>setSupportPanel(null)} onOpenSettings={section=>{setSettingsSection(section==='classroom'?'classroom':'account');setShowSettings(true);}} changeView={changeView} onMission={auth.user?.role==='student'?enterClassroomMission:()=>changeView('teacher')} navigateToChallenge={navigateToChallenge}/></Suspense>}</>;
  }

  function renderSettingsModal() {
    if (!showSettings) return null;
    return (
      <ErrorBoundary key="settings-modal">
        <Suspense fallback={<FeatureLoading label="正在加载设置..." />}>
          <SettingsModal setShowSettings={setShowSettings} initialSection={settingsSection} auth={auth} teacherClasses={teacherClasses} selectedTeacherClassId={selectedTeacherClassId} csvImportText={csvImportText} setCsvImportText={setCsvImportText} importStudentsToClass={importStudentsToClass} importCredentials={importCredentials} student={student} saveStudentSettings={saveStudentSettings} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  function renderQuestSettlement() {
    if (!questSettlement) return null;
    return (
      <QuestSettlement
        settlement={classroomSession.viewModel.active && !classroomSession.viewModel.ended
          ? { ...questSettlement, nextTitle: classroomSession.viewModel.currentStage?.title ?? "课堂任务已完成" }
          : questSettlement}
        onReview={() => setQuestSettlement(null)}
        onContinue={() => {
          const nextId = classroomSession.viewModel.active && !classroomSession.viewModel.ended
            ? classroomSession.viewModel.currentStage?.challengeId : questSettlement.nextId;
          setQuestSettlement(null);
          if (nextId) {
            navigateToChallenge(nextId);
          } else {
            setActiveView("home");
          }
        }}
      />
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
  );}
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



