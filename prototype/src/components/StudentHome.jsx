import { Play } from "@phosphor-icons/react";
import { formatEstimatedMinutes } from "../courseRoute.js";
import { buildStudentQuestModel, buildFirstUseSteps } from "../questExperience.js";
import { CurrentMissionCard } from "./classroom/student/CurrentMissionCard.jsx";
import { CurrentQuestPanel } from "./quest/CurrentQuestPanel.jsx";
import { QuestMap } from "./quest/QuestMap.jsx";
import { FirstUseGuide } from "./quest/FirstUseGuide.jsx";

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

export function StudentHome({ progress, routeGroups, nextRecommendedChallenge, navigateToChallenge, summary, notes, classroomViewModel, onClassroomEnter }) {
  const questModel = buildStudentQuestModel(routeGroups, nextRecommendedChallenge, progress);
  const firstUseSteps = buildFirstUseSteps(progress);
  const recommended = nextRecommendedChallenge;
  const sortedGroups = routeGroups.map((group) => ({
    ...group,
    completedCount: group.items.filter((item) => item.status === "completed").length,
  }));

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
                      disabled={item.status === "locked"}
                      onClick={() => navigateToChallenge(item.id)}
                      type="button"
                    >
                      <div className="route-card-top">
                        <span className={`route-card-status ${item.status}`}>
                          {item.status === "completed" ? "已完成" : item.status === "in-progress" ? "进行中" : "未开始"}
                        </span>
                        <small>{formatEstimatedMinutes(item.estimatedMinutes)}</small>
                      </div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                      <div className="route-card-footer">
                        <span>得分 {item.bestScore}</span>
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
            <span>{summary.averageScore} 分</span>
          </div>
        </aside>
      </main>
    );
  }

  return (
    <main className="quest-student-home">
      <FirstUseGuide
        steps={firstUseSteps}
        storageKey={`zcyl:quest-guide-dismissed:${typeof window !== "undefined" ? window.__USER_ID__ ?? "" : ""}`}
      />

      <section className="quest-hero" aria-label="当前任务和操作">
        <CurrentQuestPanel
          stage={questModel.current}
          record={questModel.current ? progress[questModel.current.id] : null}
          onEnter={() => questModel.current && navigateToChallenge(questModel.current.id)}
        />
        <div className="quest-hero-stats">
          <div className="quest-stat-card metric-card">
            <strong>{summary.completionRate}%</strong>
            <span>完成率</span>
          </div>
          <div className="quest-stat-card metric-card">
            <strong>{summary.averageScore}</strong>
            <span>平均分</span>
          </div>
          <div className="quest-stat-card metric-card">
            <strong>{summary.totalStudyMinutes} 分钟</strong>
            <span>累计耗时</span>
          </div>
          <div className="quest-stat-card metric-card">
            <strong>{formatEstimatedMinutes(recommended?.estimatedMinutes)}</strong>
            <span>下一关预估</span>
          </div>
        </div>
      </section>

      <QuestMap
        model={questModel}
        onSelect={(id) => navigateToChallenge(id)}
      />

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
              <span>{summary.averageScore} 分</span>
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
