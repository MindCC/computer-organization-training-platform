import { CheckCircle, ClockCountdown, Flask, TrendUp, WarningCircle } from "@phosphor-icons/react";
import { CHALLENGES } from "../platformLogic.js";

function statusText(status) {
  return { completed: "已完成", "in-progress": "进行中", unlocked: "未开始", locked: "未解锁" }[status] ?? status;
}

function Metric({ icon: Icon, label, value }) {
  return <div className="metric"><Icon size={20} weight="duotone" /><span>{label}</span><strong>{value}</strong></div>;
}

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}小时${rest}分` : `${rest}分钟`;
}

export function StudentRecords({ summary, progress, activityLog, changeView, selectChallenge }) {
  if (summary.totalAttempts === 0) {
    return (
      <div className="records-layout">
        <section className="section-panel">
          <div className="section-heading">
            <h1>个人学情记录</h1>
          </div>
          <div className="empty-state">
            <Flask size={40} weight="duotone" />
            <strong>还没有学习记录</strong>
            <p>完成第一个实验关卡后，这里会显示你的完成率、得分和复习建议。</p>
            <button className="primary-button" onClick={() => changeView("lab")} type="button">去实验工作台</button>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="records-layout">
      <section className="section-panel">
        <div className="section-heading">
          <div>
            <h1>个人学情记录</h1>
            <p>这里记录通关、尝试次数、得分、错误类型和建议复习点。</p>
          </div>
          <div className="toolbar-actions">
            <a className="ghost-button" href="/api/student/report.md">导出实验报告</a>
            <button className="ghost-button" onClick={() => changeView("lab")} type="button">继续实验</button>
          </div>
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
              <button className="record-row" disabled={record?.status === "locked"} key={challenge.id} onClick={() => selectChallenge(challenge.id)} type="button">
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
          <p className="large-copy">优先复习"{summary.weakSpot}"。建议回到全加器实验，先运行动态演示，再补齐缺失连线。</p>
          <button className="primary-button" onClick={() => selectChallenge("full-adder")} type="button">去复习全加器</button>
        </article>
      </section>
    </div>
  );
}
