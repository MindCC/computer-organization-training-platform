/** 教师看板左侧栏：班级切换与新建班级。 */
export function TeacherClassSidebar({
  teacherClasses,
  selectedTeacherClassId,
  onCreateClass,
  onSelectClass,
}) {
  return (
    <aside className="teacher-studio-sidebar">
      <div className="teacher-studio-card">
        <div className="teacher-studio-card-heading"><strong>选择班级</strong></div>
        {teacherClasses.length === 0 ? (
          <p className="empty-state">还没有班级，点击“创建班级”开始。</p>
        ) : (
          <label className="form-row teacher-class-select">
            <span>当前班级</span>
            <select
              aria-label="当前班级"
              value={selectedTeacherClassId ?? ""}
              onChange={(event) => {
                const picked = teacherClasses.find((item) => String(item.id) === event.target.value);
                if (picked) onSelectClass(picked.id);
              }}
            >
              {teacherClasses.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.name}（{item.studentCount} 名学生）
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <button className="ghost-button" type="button" onClick={onCreateClass}>创建班级</button>
    </aside>
  );
}
