import { CheckCircle, Star, Users } from "@phosphor-icons/react";

const STATUS_LABELS = { completed: "已完成", in_progress: "进行中", not_started: "未开始" };

export function SessionReportPanel({ report }) {
  if (!report) {
    return (
      <div className="session-report-panel empty">
        <p>课堂尚未结束，报告不可用。</p>
      </div>
    );
  }

  const { totalStudents, completedStudents, passedStudents, averageScore, studentReports } = report;
  const completionRate = totalStudents > 0 ? Math.round((completedStudents / totalStudents) * 100) : 0;

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
        <div className="report-metric">
          <strong>{completionRate}%</strong>
          <span>班级完成度</span>
        </div>
      </div>
      <div className="session-report-matrix">
        <table className="report-matrix-table">
          <thead>
            <tr>
              <th>学生</th>
              <th>状态</th>
              <th>完成度</th>
              <th>星级</th>
              <th>XP</th>
              <th>徽章</th>
            </tr>
          </thead>
          <tbody>
            {studentReports?.map((student) => {
              const percent = student.status === "completed" ? 100 : student.status === "in_progress" ? 50 : 0;
              return (
                <tr key={student.studentId} className={`report-row ${student.status}`}>
                  <td className="report-student-name">{student.displayName}</td>
                  <td>
                    <span className={`report-status-chip ${student.status}`}>{STATUS_LABELS[student.status] ?? "未开始"}</span>
                  </td>
                  <td>
                    <div className="report-completion">
                      <div className="report-completion-shell">
                        <div className="report-completion-fill" style={{ width: `${percent}%` }} />
                      </div>
                      <span>{student.status === "completed" ? "100%" : percent > 0 ? "进行中" : "0%"}</span>
                    </div>
                  </td>
                  <td>
                    {[1, 2, 3].map((n) => (
                      <span key={n} className={n <= (student.stars ?? 0) ? "star-filled" : "star-empty"}>★</span>
                    ))}
                  </td>
                  <td className="report-xp">{student.xp}</td>
                  <td className="report-badges">{student.badges?.length ? student.badges.join(" · ") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
