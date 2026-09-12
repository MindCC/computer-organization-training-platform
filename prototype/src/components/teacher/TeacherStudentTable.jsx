import { buildTeacherEmptyState } from "../../emptyStates.js";

/** 学生表现表：完成率/平均分/尝试次数/薄弱点，含成绩导出入口。 */
export function TeacherStudentTable({ students = [], selectedClass, selectedTeacherClassId, onOpenStudent, onResetPassword }) {
  const emptyState = students.length === 0 ? buildTeacherEmptyState(students) : null;

  return (
    <section className="teacher-studio-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">学生数据</span>
          <h2>{selectedClass ? `${selectedClass.name} 学生表现` : "请选择班级"}</h2>
          <p>展示每名学生的完成率、平均分、尝试次数和最近薄弱点。</p>
        </div>
        <div className="teacher-action-row">
          {selectedTeacherClassId ? <a className="ghost-button" href={`/api/teacher/classes/${selectedTeacherClassId}/export.csv`}>导出 CSV</a> : null}
          {selectedTeacherClassId ? <a className="ghost-button" href={`/api/teacher/classes/${selectedTeacherClassId}/archive.zip`}>导出成绩包</a> : null}
        </div>
      </div>

      <div className="record-table teacher-student-table">
        {students.map((student) => (
          <div className="record-row" key={student.id}>
            <strong>{student.displayName}</strong>
            <span>{student.username}</span>
            <span>{student.summary.completionRate}%</span>
            <span>{student.summary.averageScore} 分</span>
            <span>{student.summary.totalAttempts} 次</span>
            <small>{student.summary.weakSpot}</small>
            <div className="teacher-row-actions">
              <button className="ghost-button" onClick={() => onOpenStudent(student.id)} type="button">查看详情</button>
              <button className="ghost-button" onClick={() => onResetPassword(student.id)} type="button">重置密码</button>
            </div>
          </div>
        ))}

        {students.length === 0 ? (
          <div className="empty-state">
            <strong>{emptyState?.title ?? "暂无学生数据"}</strong>
            <p>{emptyState?.description ?? "请先在左侧边栏「创建班级」后导入学生 CSV。"}</p>
            {emptyState ? (
              <a className="ghost-button settings-template-link" download="student-import-template.csv" href={emptyState.actionHref}>
                {emptyState.actionLabel}
              </a>
            ) : <small>模板格式：学号,姓名,初始密码</small>}
          </div>
        ) : null}
      </div>
    </section>
  );
}
