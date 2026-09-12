import { LEARNING_ITEMS } from "../../platformLogic.js";

function statusText(status) {
  return { completed: "已完成", "in-progress": "进行中", unlocked: "未开始", locked: "未解锁" }[status] ?? status;
}

function LearningOverviewPanel({ overview }) {
  const cards = [
    { label: "完成率", value: `${overview.completionRate}%`, note: `已完成 ${overview.completedCount}/${overview.totalCount} 关` },
    { label: "平均分", value: `${overview.averageScore}`, note: "已完成关卡均分" },
    { label: "累计耗时", value: `${overview.totalTimeMinutes}`, note: "分钟" },
    { label: "总尝试", value: `${overview.totalAttempts}`, note: "次提交" },
  ];
  return (
    <div className="metric-grid teacher-overview-grid">
      {cards.map((card) => (
        <article className="metric-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small>{card.note}</small>
        </article>
      ))}
    </div>
  );
}

function ErrorProfilePanel({ data = [] }) {
  return (
    <div>
      <h3>高频错误</h3>
      {data.length ? (
        <div className="teacher-progress-list">
          {data.map((entry) => (
            <div className="teacher-progress-row" key={entry.errorType}>
              <strong>{entry.errorType}{entry.repeated ? <span className="teacher-error-badge">连续重复</span> : null}</strong>
              <span>{entry.count} 次 · {entry.relatedChallengeIds.map((id) => LEARNING_ITEMS.find((c) => c.id === id)?.title ?? id).join(" / ")}</span>
            </div>
          ))}
        </div>
      ) : <p className="empty-state">暂无高频错误</p>}
    </div>
  );
}

function NoteLinksPanel({ data = [] }) {
  return (
    <div>
      <h3>笔记与反思</h3>
      {data.length ? (
        <div className="teacher-note-groups">
          {data.map((group) => (
            <section className="teacher-note-group" key={group.challengeId ?? "__unlinked__"}>
              <strong className="teacher-note-group-title">{group.challengeTitle}</strong>
              <div className="teacher-note-list">
                {group.notes.map((note) => (
                  <article className="teacher-note" key={note.id}>
                    <strong>{note.title}</strong>
                    <p>{note.content}</p>
                    {note.tag ? <small>{note.tag}</small> : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : <p className="empty-state">暂无笔记</p>}
    </div>
  );
}

function TimeDistPanel({ data = [] }) {
  return (
    <div>
      <h3>耗时分布</h3>
      <div className="teacher-progress-list">
        {data.slice(0, 6).map((entry) => {
          const challenge = LEARNING_ITEMS.find((c) => c.id === entry.challengeId);
          return (
            <div className="teacher-progress-row" key={entry.challengeId}>
              <strong>{challenge?.title ?? entry.challengeId}</strong>
              <span>{entry.timeSpentMinutes} 分钟 · {entry.attempts} 次</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreTrendsPanel({ data = [] }) {
  return (
    <div>
      <h3>得分趋势</h3>
      <div className="teacher-attempt-list">
        {data.slice(0, 4).map((entry) => {
          const challenge = LEARNING_ITEMS.find((c) => c.id === entry.challengeId);
          return (
            <div className="teacher-attempt" key={entry.challengeId}>
              <strong>{challenge?.title ?? entry.challengeId}</strong>
              <span>最高 {entry.best} 分 · {entry.attempts} 次</span>
              <small>{entry.scores.map((s) => s.score).join(" → ")}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HardwarePanel({ data }) {
  return (
    <div>
      <h3>硬件挑战经营</h3>
      <div className="metric-grid mini">
        <div className="metric"><strong>经营利润</strong><span>{data.totalProfit} 元</span></div>
        <div className="metric"><strong>客户满意度</strong><span>{data.avgSatisfaction} / 100</span></div>
        <div className="metric"><strong>最佳方案</strong><span>{LEARNING_ITEMS.find((c) => c.id === data.bestCaseId)?.title ?? "-"}</span></div>
      </div>
    </div>
  );
}

/** 单个学生的学情详情面板。 */
export function TeacherStudentDetail({ student, onClose }) {
  if (!student) return null;
  return (
    <section className="teacher-studio-panel teacher-detail-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">学生详情</span>
          <h2>{student.displayName}</h2>
          <p>{student.username} · {student.className}</p>
        </div>
        <button className="ghost-button" onClick={onClose} type="button">关闭</button>
      </div>
      {student.learningOverview ? <LearningOverviewPanel overview={student.learningOverview} /> : null}
      <div className="teacher-detail-grid">
        <div>
          <h3>逐关最佳成绩</h3>
          <div className="teacher-progress-list">
            {LEARNING_ITEMS.map((challenge) => {
              const record = student.progress?.[challenge.id];
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
            {(student.attempts ?? []).slice(0, 8).map((attempt) => (
              <div className={attempt.passed ? "teacher-attempt passed" : "teacher-attempt failed"} key={attempt.id}>
                <strong>{LEARNING_ITEMS.find((c) => c.id === attempt.challengeId)?.title ?? attempt.challengeId}</strong>
                <span>{attempt.score} 分 · {attempt.passed ? "通过" : "未通过"}</span>
                <small>{attempt.errors?.length ? attempt.errors.join(" / ") : "暂无错误"}</small>
              </div>
            ))}
            {student.attempts?.length ? null : <p className="empty-state">暂无提交记录</p>}
          </div>
        </div>
        <ErrorProfilePanel data={student.errorProfile ?? []} />
        <NoteLinksPanel data={student.noteLinks ?? []} />
        {student.timeDistribution?.length > 0 ? <TimeDistPanel data={student.timeDistribution} /> : null}
        {student.scoreTrends?.length > 0 ? <ScoreTrendsPanel data={student.scoreTrends} /> : null}
        {student.hardwareSummary ? <HardwarePanel data={student.hardwareSummary} /> : null}
      </div>
    </section>
  );
}
