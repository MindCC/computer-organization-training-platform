import { useMemo, useState } from "react";
import {
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
import avatarImage from "./assets/alex-chen-avatar.png";
import labIllustration from "./assets/lab-circuit-illustration.png";
import studyDiagram from "./assets/study-tip-carry-diagram.png";

const navItems = [
  { id: "home", label: "课程首页", icon: House },
  { id: "lab", label: "关卡实验", icon: Flask },
  { id: "records", label: "学习记录", icon: ChartPieSlice },
  { id: "notes", label: "学习笔记", icon: Notebook },
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

export function App() {
  const [activeView, setActiveView] = useState("home");
  const [selectedChallengeId, setSelectedChallengeId] = useState("full-adder");
  const [progress, setProgress] = useState(createDemoProgress);
  const [connections, setConnections] = useState(["输入A->异或门1", "输入B->异或门1"]);
  const [placedComponents, setPlacedComponents] = useState(["异或门1", "异或门2", "进位逻辑"]);
  const [expandedComponent, setExpandedComponent] = useState("进位逻辑");
  const [selectedComponent, setSelectedComponent] = useState("进位逻辑");
  const [inputState, setInputState] = useState({ a: 1, b: 1, cin: 0, select: 1, op: 0 });
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
    name: "陈一鸣",
    goal: "本周完成全加器与多位加法器",
    mode: "强引导模式",
  });

  const currentChallenge = useMemo(
    () => CHALLENGES.find((challenge) => challenge.id === selectedChallengeId) ?? CHALLENGES[0],
    [selectedChallengeId],
  );
  const simulation = useMemo(
    () => simulateChallenge(selectedChallengeId, inputState),
    [selectedChallengeId, inputState],
  );
  const summary = useMemo(() => summarizeLearning(CHALLENGES, progress), [progress]);
  const currentRecord = progress[selectedChallengeId];
  const activeStep = simulation.steps[Math.min(simulationStep, simulation.steps.length - 1)];

  function changeView(view) {
    setActiveView(view);
    setStatusMessage(`已切换到${navItems.find((item) => item.id === view)?.label ?? "当前页面"}。`);
  }

  function selectChallenge(challengeId) {
    const challenge = CHALLENGES.find((item) => item.id === challengeId);
    if (!challenge) return;
    setSelectedChallengeId(challengeId);
    setConnections(progress[challengeId]?.status === "completed" ? challenge.requiredConnections : []);
    setPlacedComponents(challenge.components.map((component) => component.name).slice(0, 3));
    setExpandedComponent(challenge.components[0]?.name ?? "");
    setSelectedComponent(challenge.components[0]?.name ?? "");
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

  function submitChallenge() {
    const result = {
      ...gradeConnections(selectedChallengeId, connections),
      elapsedMinutes: currentChallenge.estimatedMinutes,
    };
    setFeedback(result);
    setProgress((current) => recordAttempt(current, selectedChallengeId, result));
    setActivityLog((current) => [
      `${currentChallenge.title}提交${result.passed ? "通过" : "未通过"}，得分 ${result.score}。`,
      ...current.slice(0, 5),
    ]);
    setStatusMessage(result.passed ? `恭喜，${currentChallenge.title}已通过。` : "系统已定位当前结构中的问题。");
  }

  function resetChallenge() {
    setConnections([]);
    setFeedback(null);
    setSimulationStep(0);
    setStatusMessage("当前关卡已重置，可以重新连线。");
  }

  function fillReferenceStructure() {
    setConnections(currentChallenge.requiredConnections);
    setFeedback(null);
    setStatusMessage("已填入本关参考结构，可以运行演示或提交检测。");
  }

  function handleDrop(event) {
    event.preventDefault();
    const componentName = event.dataTransfer.getData("text/plain");
    if (!componentName) return;
    setPlacedComponents((current) => current.includes(componentName) ? current : [...current, componentName]);
    setSelectedComponent(componentName);
    setStatusMessage(`已把“${componentName}”放入画布。`);
  }

  function saveNote() {
    const content = noteDraft.trim();
    if (!content) {
      setStatusMessage("笔记内容不能为空。");
      return;
    }
    setNotes((current) => [
      {
        id: Date.now(),
        title: `${currentChallenge.shortTitle}复盘`,
        content,
        tag: currentChallenge.shortTitle,
      },
      ...current,
    ]);
    setStatusMessage("学习笔记已保存。");
  }

  function updateStudent(key, value) {
    setStudent((current) => ({ ...current, [key]: value }));
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
          <button className="continue-pill" onClick={() => selectChallenge(selectedChallengeId)} type="button">
            <Play size={16} weight="fill" />
            <span>
              <strong>继续实验</strong>
              <small>{currentChallenge.title} · {currentRecord?.bestScore ?? 0} 分</small>
            </span>
          </button>
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
                <strong>{student.name}</strong>
                <small>初学者 · 第 2 阶段</small>
              </span>
              <CaretDown size={18} />
            </button>
            {showUserPanel ? (
              <div className="profile-menu">
                <button onClick={() => setShowSettings(true)} type="button">个人设置</button>
                <button onClick={() => changeView("records")} type="button">查看学情</button>
                <button onClick={() => changeView("notes")} type="button">打开笔记</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <nav className="sidebar-nav" aria-label="主导航">
            {navItems.map(({ id, icon: Icon, label }) => (
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
        </aside>

        <main className="dashboard">
          <div className="status-banner">
            <Sparkle size={18} />
            <span>{statusMessage}</span>
          </div>

          {activeView === "home" ? renderHome() : null}
          {activeView === "lab" ? renderLab() : null}
          {activeView === "records" ? renderRecords() : null}
          {activeView === "notes" ? renderNotes() : null}
        </main>
      </div>

      {showSettings ? renderSettingsModal() : null}
    </div>
  );

  function renderHome() {
    return (
      <div className="home-layout">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">今日学习</span>
            <h1>{student.name}，继续把运算器拼起来。</h1>
            <p>当前主线是“运算器路线”。先完成数据流、半加器和全加器，再进入多位加法器、多路选择器和简化 ALU。</p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => changeView("lab")} type="button">
                <Play size={18} weight="fill" />
                进入实验台
              </button>
              <button className="ghost-button" onClick={() => changeView("records")} type="button">
                查看学习记录
              </button>
            </div>
          </div>
          <div className="hero-module">
            <span>当前模块</span>
            <strong>{currentChallenge.title}</strong>
            <p>{currentChallenge.objective}</p>
            <div className="progress-bar"><span style={{ width: `${summary.completionRate}%` }} /></div>
            <small>首版完成度 {summary.completionRate}%</small>
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
              <p>从数据流开始，逐步走到简化 ALU。</p>
            </div>
          </div>
          <div className="challenge-grid">
            {CHALLENGES.map((challenge, index) => {
              const record = progress[challenge.id];
              return (
                <button
                  className={`challenge-card ${statusTone(record.status)} ${challenge.id === selectedChallengeId ? "selected" : ""}`}
                  key={challenge.id}
                  onClick={() => selectChallenge(challenge.id)}
                  type="button"
                >
                  <span className="step-index">{index + 1}</span>
                  <strong>{challenge.title}</strong>
                  <p>{challenge.objective}</p>
                  <footer>
                    <span>{statusText(record.status)}</span>
                    <small>{record.attempts} 次尝试 · {record.bestScore} 分</small>
                  </footer>
                </button>
              );
            })}
          </div>
        </section>

        <section className="two-column">
          <article className="section-panel">
            <div className="section-heading">
              <h2>推荐下一步</h2>
              <Star size={22} weight="fill" />
            </div>
            <div className="recommend-card">
              <strong>补齐全加器的输入进位</strong>
              <p>你当前结构已经连上 A/B，但 Cin 和 Cout 还没有闭合。建议先运行动态演示，再提交检测。</p>
              <button className="primary-button" onClick={() => selectChallenge("full-adder")} type="button">继续全加器</button>
            </div>
          </article>

          <article className="section-panel">
            <div className="section-heading">
              <h2>错误博物馆</h2>
              <WarningCircle size={22} weight="fill" />
            </div>
            <div className="mistake-list">
              {["缺少进位输入", "输出端未连接", "缺少控制信号"].map((mistake, index) => (
                <button className="mistake-row" key={mistake} onClick={() => changeView("records")} type="button">
                  <span>{index + 1}</span>
                  <strong>{mistake}</strong>
                  <small>{index === 0 ? "高频" : "中频"}</small>
                </button>
              ))}
            </div>
          </article>
        </section>
      </div>
    );
  }

  function renderLab() {
    return (
      <div className="lab-layout">
        <aside className="task-panel">
          <span className="eyebrow">关卡任务</span>
          <h1>{currentChallenge.title}</h1>
          <p>{currentChallenge.goal}</p>

          <div className="condition-list">
            <strong>通关条件</strong>
            {currentChallenge.requiredConnections.map((connection) => (
              <button
                className={connections.includes(connection) ? "condition done" : "condition"}
                key={connection}
                onClick={() => toggleConnection(connection)}
                type="button"
              >
                <CheckCircle size={18} weight={connections.includes(connection) ? "fill" : "regular"} />
                <span>{connection}</span>
              </button>
            ))}
          </div>

          <div className="lab-actions">
            <button className="primary-button" onClick={submitChallenge} type="button">提交检测</button>
            <button className="ghost-button" onClick={resetChallenge} type="button">重置本关</button>
            <button className="ghost-button" onClick={fillReferenceStructure} type="button">查看参考结构</button>
          </div>
        </aside>

        <section className="lab-workbench">
          <div className="bench-toolbar">
            <div>
              <h2>可视化实验台</h2>
              <p>拖放元件到画布，勾选连线后运行信号演示。</p>
            </div>
            <div className="run-controls">
              <button onClick={runStep} type="button">单步演示</button>
              <button onClick={runAll} type="button">连续演示</button>
            </div>
          </div>

          <div className="input-board">
            <Toggle label="输入A" value={inputState.a} onChange={(value) => handleInputChange("a", value)} />
            <Toggle label="输入B" value={inputState.b} onChange={(value) => handleInputChange("b", value)} />
            <Toggle label="进位Cin" value={inputState.cin} onChange={(value) => handleInputChange("cin", value)} />
            <Stepper label="选择信号" value={inputState.select} max={1} onChange={(value) => handleInputChange("select", value)} />
            <Stepper label="ALU控制位" value={inputState.op} max={3} onChange={(value) => handleInputChange("op", value)} />
          </div>

          <div className="canvas-wrap">
            <div className="component-palette">
              <strong>元件区</strong>
              {currentChallenge.components.map((component) => (
                <button
                  draggable
                  className="component-chip"
                  key={component.name}
                  onClick={() => {
                    setSelectedComponent(component.name);
                    setExpandedComponent(component.name);
                  }}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", component.name)}
                  type="button"
                >
                  <Cpu size={18} />
                  {component.name}
                </button>
              ))}
            </div>

            <div
              className="circuit-canvas"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="signal-stage active">
                <span>输入端</span>
                <strong>A={inputState.a} · B={inputState.b} · Cin={inputState.cin}</strong>
              </div>
              <div className={`signal-path ${simulationStep > 0 ? "active" : ""}`} />
              <div className="canvas-components">
                {placedComponents.map((componentName) => (
                  <button
                    className={expandedComponent === componentName ? "canvas-node expanded" : "canvas-node"}
                    key={componentName}
                    onClick={() => {
                      setExpandedComponent(componentName);
                      setSelectedComponent(componentName);
                    }}
                    type="button"
                  >
                    <strong>{componentName}</strong>
                    <small>{expandedComponent === componentName ? "内部结构已展开" : "点击查看内部结构"}</small>
                    {expandedComponent === componentName ? (
                      <span className="node-detail">输入端口 · 逻辑核心 · 输出端口</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className={`signal-path ${simulationStep > 1 ? "active" : ""}`} />
              <div className="signal-stage output">
                <span>输出端</span>
                <strong>{formatOutputs(simulation.outputs)}</strong>
              </div>
            </div>
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

        <aside className="inspector-panel">
          <section>
            <span className="eyebrow">元件说明</span>
            <h2>{selectedComponent}</h2>
            <p>{currentChallenge.components.find((component) => component.name === selectedComponent)?.description ?? "选择一个元件查看说明。"}</p>
            <div className="concept-card">
              <strong>原理卡片</strong>
              <p>{currentChallenge.principle}</p>
            </div>
          </section>

          <section>
            <span className="eyebrow">判题反馈</span>
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
                <p>提交后系统会同时检查结果、结构和教学提示。</p>
              </div>
            )}
          </section>
        </aside>
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
              <h2>个人设置</h2>
              <p>这些设置会影响首页推荐和实验提示强度。</p>
            </div>
            <button className="ghost-button" onClick={() => setShowSettings(false)} type="button">关闭</button>
          </div>
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
            onClick={() => {
              setShowSettings(false);
              setStatusMessage("个人设置已更新。");
            }}
            type="button"
          >
            保存设置
          </button>
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
