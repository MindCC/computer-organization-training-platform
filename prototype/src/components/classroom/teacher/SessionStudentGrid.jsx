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
        <strong>学生队列</strong>
        <div className="session-grid-counts">
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
      <div className="session-grid-rows">
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
            <span className="session-student-stage">{stageLabel(student.currentStageIndex)}</span>
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
