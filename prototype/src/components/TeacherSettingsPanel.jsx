import { useEffect, useState } from "react";

export function SettingsModal({
  setShowSettings,
  auth,
  teacherClasses,
  selectedTeacherClassId,
  csvImportText,
  setCsvImportText,
  importStudentsToClass,
  student,
  updateStudent,
  saveStudentSettings,
}) {
  const selectedClass = teacherClasses.find((item) => item.id === selectedTeacherClassId);
  const isTeacher = auth.user?.role === "teacher";
  const [dbInfo, setDbInfo] = useState(null);
  const [dbInfoError, setDbInfoError] = useState("");

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    fetch("/api/admin/db-info", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("数据库信息获取失败"))))
      .then((data) => { if (!cancelled) setDbInfo(data); })
      .catch((error) => { if (!cancelled) setDbInfoError(error.message); });
    return () => { cancelled = true; };
  }, [isTeacher]);

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
      <div className="settings-panel">
        <div className="settings-panel-header">
          <h2>{auth.user?.role === "teacher" ? "课堂设置" : "个人设置"}</h2>
          <button className="ghost-button" onClick={() => setShowSettings(false)} type="button">关闭</button>
        </div>

        {auth.user?.role === "teacher" ? (
          <>
            <section className="settings-block first-use-guide">
              <div>
                <span className="eyebrow">课堂首用</span>
                <h3>第一次上课建议按这 4 步走</h3>
              </div>
              <ol>
                <li>创建或选择班级。</li>
                <li>下载 CSV 模板并导入学生。</li>
                <li>用一个学生账号完成一次实验提交。</li>
                <li>回到教师看板查看完成率、高频错误和 AI 助教建议。</li>
              </ol>
              <p>演示环境可运行 <code>npm run seed:demo</code> 生成课堂样例数据。</p>
            </section>

            <section className="settings-block teacher-import-settings">
              <div>
                <span className="eyebrow">学生导入</span>
                <h3>{selectedClass?.name ?? "请先创建或选择班级"}</h3>
                <p>CSV 列顺序固定为：学号、姓名、初始密码。导入会新增学生或更新同学号学生信息。</p>
              </div>
              <div className="teacher-action-row">
                <a className="ghost-button settings-template-link" download="student-import-template.csv" href="data:text/csv;charset=utf-8,%E5%AD%A6%E5%8F%B7%2C%E5%A7%93%E5%90%8D%2C%E5%88%9D%E5%A7%8B%E5%AF%86%E7%A0%81%0A2026001%2C%E6%9D%8E%E5%90%8C%E5%AD%A6%2CStudent123!">
                  下载学生导入模板
                </a>
                {selectedTeacherClassId ? (
                  <a className="ghost-button" href={`/api/teacher/classes/${selectedTeacherClassId}/export.csv`}>
                    导出当前班级 CSV
                  </a>
                ) : null}
              </div>
              <textarea
                aria-label="学生导入 CSV"
                value={csvImportText}
                onChange={(event) => setCsvImportText(event.target.value)}
                placeholder="学号,姓名,初始密码"
              />
              <button className="primary-button" disabled={!selectedTeacherClassId} onClick={importStudentsToClass} type="button">
                导入学生
              </button>
            </section>

            <section className="settings-block teacher-backup-settings">
              <div>
                <span className="eyebrow">数据与备份</span>
                <h3>数据库位置与备份</h3>
                <p>建议每次课后或导入学生前备份一次，防止数据意外丢失。</p>
              </div>
              <div className="teacher-backup-detail">
                {dbInfo ? (
                  <>
                    <div className="teacher-backup-row">
                      <span>数据库路径</span>
                      <code>{dbInfo.path}</code>
                    </div>
                    <div className="teacher-backup-row">
                      <span>数据库大小</span>
                      <code>{dbInfo.sizeMB} MB</code>
                    </div>
                  </>
                ) : dbInfoError ? (
                  <p className="teacher-ai-warning">{dbInfoError}</p>
                ) : (
                  <p className="empty-state">正在读取数据库信息...</p>
                )}
              </div>
              <div className="teacher-action-row">
                <a className="ghost-button" href="/api/admin/backup">
                  下载备份
                </a>
              </div>
              <details className="teacher-backup-help">
                <summary>恢复备份怎么做？</summary>
                <ol>
                  <li>停止后端服务（Ctrl+C 或 pm2 stop）。</li>
                  <li>用下载的 <code>.sqlite</code> 文件替换服务器上的数据库文件。</li>
                  <li>重新启动后端服务，登录验证数据完整。</li>
                  <li>完整步骤见部署文档 <code>docs/classroom-deployment.md</code>。</li>
                </ol>
              </details>
            </section>
          </>
        ) : (
          <section className="settings-block">
            <label className="form-row">
              <span>姓名</span>
              <input value={student.name} onChange={(event) => updateStudent("name", event.target.value)} />
            </label>
            <label className="form-row">
              <span>本周目标</span>
              <input value={student.goal} onChange={(event) => updateStudent("goal", event.target.value)} />
            </label>
            <label className="form-row">
              <span>提示模式</span>
              <select value={student.mode} onChange={(event) => updateStudent("mode", event.target.value)}>
                <option>强引导模式</option>
                <option>适中提示模式</option>
                <option>挑战模式</option>
              </select>
            </label>
            <button className="primary-button" onClick={saveStudentSettings} type="button">
              保存设置
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
