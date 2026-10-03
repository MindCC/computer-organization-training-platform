import { CaretDown, CaretRight, CheckCircle, Clock, MonitorPlay, Play } from "@phosphor-icons/react";
import { useState } from "react";
import { formatEstimatedMinutes } from "../courseRoute.js";
import { buildStudentQuestModel, buildFirstUseSteps } from "../questExperience.js";
import { buildStudentHomeEmptyState } from "../emptyStates.js";
import { buildCompletionOverview } from "../completionOverview.js";
import { CurrentMissionCard } from "./classroom/student/CurrentMissionCard.jsx";
import { CurrentQuestPanel } from "./quest/CurrentQuestPanel.jsx";
import { FirstUseGuide } from "./quest/FirstUseGuide.jsx";
import { buildProjectChapters, buildStudentProjectSummary } from "../courseWorkbenchState.js";
import { COURSEWARE } from "../courseware.js";
import './studentHome.css';

/** 章节 → 课堂演示页入口（courseware demos 字段派生，首页章节板与课件页共用一份数据） */
const DEMOS_BY_CHAPTER = Object.fromEntries(
  (COURSEWARE.chapters ?? [])
    .filter((chapter) => (chapter.demos ?? []).length > 0)
    .map((chapter) => [chapter.id, chapter.demos]),
);

function NextStepCard({ challenge, progress, onEnter }) {
  return (
    <div className="next-step-card">
      <div>
        <span className="eyebrow">下一步建议</span>
        <h2>{challenge.title}</h2>
        <p>{challenge.principle}</p>
        {progress ? <small>{progress.attempts} 次尝试 · {progress.bestScore} 分</small> : null}
      </div>
      <button className="primary-button" onClick={onEnter} type="button">
        <Play size={16} /> {progress?.status === "in-progress" ? "继续" : "开始"}
      </button>
    </div>
  );
}

export function StudentHome({ progress, routeGroups, nextRecommendedChallenge, navigateToChallenge, summary, notes, classroomViewModel, onClassroomEnter, projects = [], onOpenProjects, userId = "anonymous" }) {
  const questModel = buildStudentQuestModel(routeGroups, nextRecommendedChallenge, progress);
  const firstUseSteps = buildFirstUseSteps(progress);
  const homeEmptyState = buildStudentHomeEmptyState(summary, routeGroups);
  const completion = buildCompletionOverview(summary);
  const averageLabel = summary.scoredCompleted > 0 ? `${summary.averageScore} 分` : "暂无成绩";
  const sortedGroups = routeGroups.map((group) => ({
    ...group,
    completedCount: group.items.filter((item) => item.status === "completed").length,
  }));
  const projectSummary = buildStudentProjectSummary(projects);
  const projectChapters = buildProjectChapters(projects);
  const courseChapters = routeGroups.map((group) => ({
    id: group.id,
    number: group.number,
    title: group.shortTitle ?? group.title,
    description: group.description,
    teamName: "课程章节",
    completedCount: group.items.filter((item) => item.status === "completed").length,
    experiments: group.items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status === "completed" ? "reviewed" : item.status === "in-progress" ? "submitted" : "not-started",
      courseStatus: item.status,
      challengeId: item.id,
    })),
  }));
  const homepageChapters = projectChapters.length ? projectChapters : courseChapters;
  const [expandedProjectChapters, setExpandedProjectChapters] = useState({});

  if (classroomViewModel?.active) {
    return (
      <main className="mission-home">
        <section className="mission-route-board" aria-label="课程电路路线">
          <header className="mission-channel-bar">
            <CurrentMissionCard
              viewModel={classroomViewModel}
              onEnter={() => onClassroomEnter?.(classroomViewModel.sessionId)}
            />
          </header>
          <div className="mission-route-canvas">
            <div className="route-map-header">
              <span className="eyebrow">课程路线</span>
              <h1>电路装配路线图</h1>
              <p>从信号流动到逻辑门，再到加法器和 ALU——顺着运算器的装配线一步步完成。</p>
            </div>
            {sortedGroups.map((group) => (
              <section className="route-map-group" key={group.id}>
                <div className="route-map-group-header">
                  <div>
                    <h2>{group.title}</h2>
                    <p>{group.description}</p>
                  </div>
                  <span className="route-map-group-progress">
                    {group.completedCount} / {group.items.length}
                  </span>
                </div>
                <div className="route-map-cards">
                  {group.items.map((item) => (
                    <button
                      className={`route-card ${item.status}`}
                      key={item.id}
                      onClick={() => navigateToChallenge(item.id)}
                      title={item.status === "locked" ? "尚未解锁：可以进去练习，解锁后才能提交检测" : undefined}
                      type="button"
                    >
                      <div className="route-card-top">
                        <span className={`route-card-status ${item.status}`}>
                          {item.status === "completed" ? "已完成" : item.status === "in-progress" ? "进行中" : item.status === "locked" ? "可进入练习" : "未开始"}
                        </span>
                        <small>{formatEstimatedMinutes(item.estimatedMinutes)}</small>
                      </div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                      <div className="route-card-footer">
                        <span>{item.scoreLabel ?? `得分 ${item.bestScore}`}</span>
                        <small>{item.attempts} 次尝试</small>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
        <aside className="mission-brief-panel">
          <strong>任务简报</strong>
          <p>{summary.weakSpot || "暂无高频错误"}</p>
          <div className="route-map-stat">
            <span>完成率</span>
            <span>{summary.completionRate}%</span>
          </div>
          <div className="route-map-stat">
            <span>平均得分</span>
            <span>{averageLabel}</span>
          </div>
        </aside>
      </main>
    );
  }

  return (
    <main className="quest-student-home">
      <header className="home-intro">
        <div><span className="eyebrow">计算机组成原理 · 实践课程</span><h1>把原理，接成电路。</h1><p>从认识部件到搭建系统，沿着课程路线完成每一次探索。</p></div>
        <span className="home-course-count">{homepageChapters.length} 章课程 <span aria-hidden="true">/</span> {routeGroups.reduce((count, group) => count + group.items.length, 0)} 项实验</span>
      </header>

      <section className="quest-hero" aria-label="当前任务和操作">
        {questModel.current ? <CurrentQuestPanel
          stage={questModel.current}
          record={progress[questModel.current.id]}
          onEnter={() => navigateToChallenge(questModel.current.id)}
        /> : <section className="current-quest-panel home-course-complete"><CheckCircle size={32} weight="fill"/><h2>{summary.completed === summary.totalChallenges ? "课程路线已完成" : "从章节进入下一次探索"}</h2><p>展开下方章节，复盘实验或尝试更简洁的电路。</p></section>}
        <div className="home-progress-panel">
          <div className="home-workshop-scene"><img src="/shop-story/shop-empty.webp" alt="阳光下的装机工坊，桌上摆着电脑与维修工具"/><span>你的下一次探索，从这里开始</span></div>
          <div className="quest-hero-stats">
            <div className="quest-stat-card metric-card"><strong>{summary.completionRate}<small>%</small></strong><span>课程完成率</span><progress value={summary.completionRate} max="100" aria-label="课程完成率"/></div>
            <div className="quest-stat-card metric-card"><strong>{summary.scoredCompleted > 0 ? <>{summary.averageScore}<small>分</small></> : "暂无成绩"}</strong><span>计分实验平均分</span></div>
            <div className="quest-stat-card metric-card"><strong>{completion.completedLabel}</strong><span>已完成实验</span></div>
            <div className="quest-stat-card metric-card"><strong>{completion.remainingLabel}</strong><span>预计剩余课时</span></div>
          </div>
        </div>
      </section>

      <FirstUseGuide
        steps={firstUseSteps}
        storageKey={`zcyl:quest-guide-dismissed:${userId}`}
      />

      {homeEmptyState ? (
        <section className="quest-empty-banner" aria-label="首次学习引导">
          <div>
            <span className="eyebrow">从这里开始</span>
            <h2>{homeEmptyState.title}</h2>
            <p>{homeEmptyState.description}</p>
          </div>
          {homeEmptyState.targetId ? (
            <button className="primary-button quest-empty-action" onClick={() => navigateToChallenge(homeEmptyState.targetId)} type="button">
              <Play size={16} /> {homeEmptyState.ctaLabel}
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="project-chapter-board" aria-labelledby="project-chapter-heading">
        <header className="project-chapter-board-heading">
          <div>
            <span className="eyebrow">{projectSummary.count ? "协作项目" : "课程路线"}</span>
            <h2 id="project-chapter-heading">{projectSummary.count ? "按章节完成协作实验" : "按章节完成课程实验"}</h2>
            <p>{projectSummary.count ? "每个项目是一章；展开章节后，可进入对应的小实验并提交个人成果。" : "从章节进入小实验，完成后会同步更新你的课程进度。"}</p>
          </div>
          {projectSummary.count ? <button className="ghost-button" onClick={onOpenProjects} type="button">查看全部项目</button> : null}
        </header>

        {homepageChapters.length ? <div className="project-chapter-list">
          {homepageChapters.map((chapter, index) => {
            const expanded = expandedProjectChapters[chapter.id] ?? index === 0;
            return <article className="project-chapter" data-expanded={expanded} key={chapter.id}>
              <button
                aria-expanded={expanded}
                aria-controls={`home-chapter-${chapter.id}`}
                className="project-chapter-toggle"
                onClick={() => setExpandedProjectChapters((current) => ({ ...current, [chapter.id]: !expanded }))}
                type="button"
              >
                <span className="project-chapter-index">第 {chapter.number ?? index + 1} 章</span>
                <span className="project-chapter-title"><strong>{chapter.title}</strong><small>{chapter.teamName}</small></span>
                <span className="project-chapter-progress"><strong>{chapter.completedCount} / {chapter.experiments.length}</strong> {projectSummary.count ? "已评价" : "已完成"}<progress value={chapter.completedCount} max={chapter.experiments.length || 1} aria-label={`${chapter.title}完成进度`}/></span>
                {expanded ? <CaretDown size={18} /> : <CaretRight size={18} />}
              </button>
              {expanded ? <div className="project-experiment-list" id={`home-chapter-${chapter.id}`}>
                <p className="project-chapter-description">{chapter.description}</p>
                {chapter.experiments.map((experiment, experimentIndex) => <button className="project-experiment-row" key={experiment.id} onClick={() => experiment.challengeId ? navigateToChallenge(experiment.challengeId) : onOpenProjects()} type="button">
                  <span className={`project-experiment-status ${experiment.status}`}>{experiment.status === "reviewed" ? <CheckCircle size={17} weight="fill" /> : <Clock size={17} />}</span>
                  <span className="project-experiment-copy"><strong>{index + 1}-{experimentIndex + 1} {experiment.title}</strong><small>{experiment.description}</small></span>
                  <span className={`project-experiment-state ${experiment.status}`}>{experiment.courseStatus ? experiment.courseStatus === "completed" ? "已完成 · 复盘" : experiment.courseStatus === "in-progress" ? "继续实验" : experiment.courseStatus === "locked" ? "进入练习" : "开始实验" : experiment.status === "reviewed" ? "已评价" : experiment.status === "submitted" ? "待评价" : "开始实验"}</span>
                </button>)}
                {(DEMOS_BY_CHAPTER[chapter.id] ?? []).map((demo) => (
                  <a
                    className="project-experiment-row demo-entry"
                    href={demo.href}
                    key={demo.href}
                    rel="noreferrer"
                    target="_blank"
                    title={demo.note}
                  >
                    <span className="project-experiment-status demo"><MonitorPlay size={17} weight="fill" /></span>
                    <span className="project-experiment-copy"><strong>{demo.title}</strong><small>{demo.note} · 新窗口打开，练习成绩联动学情</small></span>
                    <span className="project-experiment-state demo">课堂演示 →</span>
                  </a>
                ))}
              </div> : null}
            </article>;
          })}
        </div> : null}
      </section>

      <div className="quest-student-supplement">
        <aside className="quest-student-sidebar">
          <div className="route-map-sidebar-card">
            <strong>学习状态</strong>
            <div className="route-map-stat">
              <span>完成率</span>
              <span>{summary.completionRate}%</span>
            </div>
            <div className="route-map-stat">
              <span>平均得分</span>
              <span>{averageLabel}</span>
            </div>
            <div className="route-map-stat">
              <span>累计尝试</span>
              <span>{summary.totalAttempts} 次</span>
            </div>
          </div>

          <div className="route-map-sidebar-card">
            <strong>当前薄弱点</strong>
            <p>{summary.weakSpot}</p>
          </div>

          <div className="route-map-sidebar-card">
            <strong>最近笔记</strong>
            {notes.length > 0 ? (
              <div className="route-map-note-list">
                {notes.slice(0, 2).map((note) => (
                  <article className="route-map-note" key={note.id}>
                    <strong>{note.title}</strong>
                    <p>{note.content}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">暂无笔记</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
