import { Play } from "@phosphor-icons/react";
import { buildCourseRouteGroups } from "../courseRoute.js";

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

export function StudentHome({ progress, nextRecommendedChallenge, navigateToChallenge, summary, notes }) {
  const recommended = nextRecommendedChallenge;
  const routeGroups = buildCourseRouteGroups();
  const sortedGroups = routeGroups.map((group) => ({
    ...group,
    completedCount: group.items.filter((item) => item.status === "completed").length,
  }));

  return (
    <div className="route-map">
      <header className="route-map-header">
        <span className="eyebrow">今日学习</span>
        <h1>课程路线地图</h1>
        <p>从信号流动到逻辑门，再到加法器和 ALU——顺着运算器的装配线一步步走完电路路线。</p>
      </header>

      <div className="route-map-body">
        <div className="route-map-overview">
          <div className="route-map-stat-card">
            <strong>{summary.completionRate}%</strong>
            <span>完成率</span>
          </div>
          <div className="route-map-stat-card">
            <strong>{summary.averageScore}</strong>
            <span>平均分</span>
          </div>
          <div className="route-map-stat-card">
            <strong>{summary.totalStudyMinutes} 分钟</strong>
            <span>累计耗时</span>
          </div>
          <div className="route-map-stat-card">
            <strong>{recommended?.estimatedMinutes ?? "-"} 分钟</strong>
            <span>下一关预估</span>
          </div>
        </div>
        <div className="route-map-main">
          {recommended ? (
            <NextStepCard
              challenge={recommended}
              progress={progress[recommended.id]}
              onEnter={() => navigateToChallenge(recommended.id)}
            />
          ) : null}

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
                    type="button"
                  >
                    <div className="route-card-top">
                      <span className={`route-card-status ${item.status}`}>
                        {item.status === "completed" ? "已完成" : item.status === "in-progress" ? "进行中" : "未开始"}
                      </span>
                      <small>{item.estimatedMinutes} 分钟</small>
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

        <aside className="route-map-sidebar">
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
    </div>
  );
}
