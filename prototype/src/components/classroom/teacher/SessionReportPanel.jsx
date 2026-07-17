import { CheckCircle, Star, Users } from "@phosphor-icons/react";

export function SessionReportPanel({ report }) {
  if (!report) {
    return (
      <div className="session-report-panel empty">
        <p>课堂尚未结束，报告不可用。</p>
      </div>
    );
  }

  const { totalStudents, completedStudents, passedStudents, averageScore, studentReports } = report;

  return (
    <div className="session-report-panel">
      <div className="session-report-header">
        <strong>课堂报告</strong>
        <span>冻结于 {report.frozenAt ? new Date(report.frozenAt).toLocaleString() : "—"}</span>
      </div>
      <div className="session-report-metrics">
        <div className="report-metric">
          <Users size={20} />
          <strong>{completedStudents}/{totalStudents}</strong>
          <span>完成人数</span>
        </div>
        <div className="report-metric">
          <CheckCircle size={20} />
          <strong>{passedStudents}/{totalStudents}</strong>
          <span>通过人数</span>
        </div>
        <div className="report-metric">
          <Star size={20} />
          <strong>{Math.round(averageScore)}</strong>
          <span>平均分</span>
        </div>
      </div>
      <div className="session-report-list">
        {studentReports?.map((student) => (
          <div className="report-student-row" key={student.studentId}>
            <span className="report-student-name">{student.displayName}</span>
            <span className="report-student-status">{student.status}</span>
            <span>{student.xp} XP</span>
            <span>
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= (student.stars ?? 0) ? "star-filled" : "star-empty"}>★</span>
              ))}
            </span>
            <span>{student.badges?.join(" · ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
