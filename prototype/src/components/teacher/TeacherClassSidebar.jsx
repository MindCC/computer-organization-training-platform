/** 教师看板左侧栏：班级切换与新建班级。 */
export function TeacherClassSidebar({
  teacherClasses,
  selectedTeacherClassId,
  classNameDraft,
  setClassNameDraft,
  teacherMessage,
  createTeacherClass,
  onSelectClass,
}) {
  return (
    <aside className="teacher-studio-sidebar">
      <div className="teacher-studio-card">
        <div className="teacher-studio-card-heading"><strong>选择班级</strong></div>
        <div className="teacher-class-list">
          {teacherClasses.length === 0 ? <p className="empty-state">还没有班级，先在下方创建一个。</p> : null}
          {teacherClasses.map((item) => (
            <button
              className={item.id === selectedTeacherClassId ? "teacher-class active" : "teacher-class"}
              key={item.id}
              onClick={() => onSelectClass(item.id)}
              type="button"
            >
              <strong>{item.name}</strong>
              <span>{item.studentCount} 名学生</span>
            </button>
          ))}
        </div>
      </div>

      <div className="teacher-studio-card">
        <div className="teacher-studio-card-heading"><strong>创建班级</strong></div>
        <div className="teacher-create-box">
          <label className="form-row">
            <span>新班级名称</span>
            <input value={classNameDraft} onChange={(event) => setClassNameDraft(event.target.value)} />
          </label>
          <button className="primary-button" onClick={createTeacherClass} type="button">创建班级</button>
        </div>
        {teacherMessage ? <p className="teacher-message">{teacherMessage}</p> : null}
      </div>
    </aside>
  );
}
