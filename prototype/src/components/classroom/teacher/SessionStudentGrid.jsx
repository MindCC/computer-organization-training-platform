import { WarningCircle, CheckCircle, ClockCountdown } from "@phosphor-icons/react";

function stageLabel(stageIndex) {
  const labels = ["阶段一", "阶段二", "阶段三", "阶段四"];
  return labels[stageIndex] ?? `阶段${stageIndex + 1}`;
}

export function SessionStudentGrid({ viewModel, onSelectStudent }) {
  const { stageBuckets, needsHelp } = viewModel;
  const all = [
    ...(stageBuckets?.not_started ?? []),
    ...(stageBuckets?.in_progress ?? []),
    ...(stageBuckets?.completed ?? []),
  ];

  return (
    <div className="session-student-grid">
      <div className="session-grid-header">
        <div><strong>学生任务进度与反馈</strong><p className="session-feedback-hint">每 15 秒同步一次，点击学生查看提交反馈。</p></div>
        <div className="session-grid-counts">
          <span className="count-tag">未开始 {stageBuckets?.not_started?.length ?? 0}</span>
          <span className="count-tag needs-help">
            <WarningCircle size={14} /> 需帮助 {needsHelp?.length ?? 0}
          </span>
          <span className="count-tag in-progress">
            进行中 {stageBuckets?.in_progress?.length ?? 0}
          </span>
          <span className="count-tag completed">
            <CheckCircle size={14} /> 已完成 {stageBuckets?.completed?.length ?? 0}
          </span>
        </div>
      </div>
      <div className="session-completion-matrix">
        {all.map((student) => (
          <button
            className="session-student-row"
            key={student.studentId}
            onClick={() => onSelectStudent?.(student)}
            type="button"
          >
            <span className={`session-student-status ${student.status}`}>
              {student.status === "completed" ? <CheckCircle size={16} weight="fill" /> :
                student.status === "in_progress" ? <ClockCountdown size={16} /> :
                <span className="dot" />}
            </span>
            <span className="session-student-name">{student.displayName}</span>
            <strong>{student.status === 'completed' ? '已完成' : student.status === 'in_progress' ? '进行中' : '未开始'}</strong>
            <span className="session-student-stage">{student.status==='completed' ? '全部任务已完成' : viewModel.mission?.stages?.[student.currentStageIndex]?.title ?? stageLabel(student.currentStageIndex)}<small>已完成 {student.currentStageIndex??0} / {viewModel.mission?.stages?.length??4} 环节</small></span>
            <span className="session-student-xp">{student.xp} XP</span>
            <span className="session-student-stars">
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= (student.stars ?? 0) ? "star-filled" : "star-empty"}>★</span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SessionStudentFeedback({ student, mission, onClose }) {
  if(!student)return null;
  const records=student.result?.stageResults??[];
  const count=mission?.stages?.length??4;
  const current=mission?.stages?.[student.currentStageIndex??0];
  return <section className="chain-student-evidence" aria-label="学生任务反馈">
    <header><strong>{student.displayName} · 环节记录</strong><button type="button" className="ghost-button" onClick={onClose}>收起</button></header>
    <p>已完成 {student.currentStageIndex??0} / {count} 环节 · {student.status==='completed'?'全部任务已完成':student.status==='not_started'?'尚未接受任务':`当前任务：${current?.title??'正在同步'}`}</p>
    {!records.length&&<p className="session-feedback-empty">{student.status==='not_started'?'学生可在课程首页直接查看任务，接受后开始。':'学生已接受任务，尚未提交本环节。'}提交后这里会显示评分、错误提示和学习说明。</p>}
    {records.map(result=><article key={result.stageId}>
      <strong>{result.title} · {Number.isFinite(result.score)?`${result.score}分`:result.passed?'参与完成':'未完成'}</strong>
      <p>提交 {result.attempts} 次 · {result.passed?'已完成':'待订正'}</p>
      {result.errors?.length>0&&<ul>{result.errors.map((message,index)=><li key={index}>{message}</li>)}</ul>}
      {result.evidence?.text&&<p className="chain-report-evidence">{result.evidence.text}</p>}
    </article>)}
  </section>;
}
