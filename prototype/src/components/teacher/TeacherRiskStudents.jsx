/** 高风险学生清单，点击进入学生详情。 */
export function TeacherRiskStudents({ atRiskStudents = [], onOpenStudent }) {
  return (
    <div className="teacher-studio-content">
      <section className="teacher-studio-panel teacher-assistant-panel">
        <div className="teacher-risk-list">
          <strong>重点关注学生</strong>
          {atRiskStudents.length > 0
            ? atRiskStudents.map((student) => (
                <button className="teacher-risk-row" key={student.id} onClick={() => onOpenStudent(student.id)} type="button">
                  <span>{student.displayName}</span>
                  <small>{student.summary.completionRate}% · {student.summary.averageScore} 分 · {student.summary.totalAttempts} 次</small>
                </button>
              ))
            : <p className="empty-state">暂无高风险学生。</p>}
        </div>
      </section>
    </div>
  );
}
