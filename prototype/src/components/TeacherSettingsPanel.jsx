import { useEffect, useState } from "react";
import { api } from "../apiClient.js";
import { passwordStrength } from "../passwordStrength.js";

const AUDIT_ACTION_LABELS = {
  login_success: "登录成功",
  login_failure: "登录失败",
  import_students: "导入学生",
  reset_password: "重置密码",
  export_csv: "导出 CSV",
  export_archive: "导出成绩包",
  ai_report: "生成 AI 报告",
  backup_download: "下载备份",
  archive_class: "归档/恢复班级",
  disable_student: "停用学生",
  enable_student: "启用学生",
  transfer_student: "转班",
  update_skip_locked: "跳关设置",
  revoke_session: "下线会话",
};

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
  const [auditLogs, setAuditLogs] = useState(null);
  const [auditError, setAuditError] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [sessions, setSessions] = useState(null);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    fetch("/api/admin/db-info", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("数据库信息获取失败"))))
      .then((data) => { if (!cancelled) setDbInfo(data); })
      .catch((error) => { if (!cancelled) setDbInfoError(error.message); });
    return () => { cancelled = true; };
  }, [isTeacher]);

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    api.auditLogs({ action: auditAction, page: 1, pageSize: 20 })
      .then((data) => { if (!cancelled) setAuditLogs(data); })
      .catch((error) => { if (!cancelled) setAuditError(error.message); });
    return () => { cancelled = true; };
  }, [isTeacher, auditAction]);

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    api.sessions()
      .then((data) => { if (!cancelled) setSessions(data.sessions ?? []); })
      .catch((error) => { if (!cancelled) setSessionError(error.message); });
    return () => { cancelled = true; };
  }, [isTeacher]);

  async function revokeSession(sessionId) {
    try {
      await api.revokeSession(sessionId);
      setSessions((current) => current.filter((s) => s.id !== sessionId));
    } catch (error) {
      setSessionError(error.message ?? "下线会话失败");
    }
  }

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

            <section className="settings-block teacher-rule-settings">
              <div>
                <span className="eyebrow">教学规则</span>
                <h3>跳关开关</h3>
                <p>默认不允许跳关：未完成前置关卡时不能提交后续关卡。开启后学生可浏览并提交任意关卡。</p>
              </div>
              <label className="form-row teacher-rule-row">
                <span>允许学生跳关</span>
                <input
                  aria-label="允许学生跳关"
                  checked={selectedClass?.allowSkipLocked === 1}
                  onChange={async (event) => {
                    if (!selectedTeacherClassId) return;
                    try {
                      await api.setSkipLocked(selectedTeacherClassId, event.target.checked);
                      // 通知父组件刷新班级列表以更新开关状态
                      window.dispatchEvent(new CustomEvent("zcyl:class-settings-changed"));
                    } catch (error) {
                      setDbInfoError(`跳关开关设置失败：${error.message}`);
                    }
                  }}
                  type="checkbox"
                />
              </label>
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

            <section className="settings-block teacher-audit-settings">
              <div>
                <span className="eyebrow">审计日志</span>
                <h3>关键操作记录</h3>
                <p>登录、导入、导出、备份等关键操作会记录在这里，用于追溯「谁在什么时候做了什么」。</p>
              </div>
              <div className="teacher-audit-toolbar">
                <select
                  aria-label="按操作类型筛选"
                  value={auditAction}
                  onChange={(e) => setAuditAction(e.target.value)}
                >
                  <option value="">全部操作</option>
                  {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <small>共 {auditLogs?.total ?? 0} 条</small>
              </div>
              {auditError ? <p className="teacher-ai-warning">{auditError}</p> : null}
              {auditLogs ? (
                auditLogs.items.length > 0 ? (
                  <div className="teacher-audit-list">
                    {auditLogs.items.map((entry) => (
                      <div className="teacher-audit-row" key={entry.id}>
                        <span className="teacher-audit-action">
                          {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                        </span>
                        <span className="teacher-audit-meta">
                          {entry.actorRole === "teacher" ? "教师" : "学生"}
                          {entry.targetType ? ` · ${entry.targetType}${entry.targetId ? `#${entry.targetId}` : ""}` : ""}
                        </span>
                        <small className="teacher-audit-time">{formatAuditTime(entry.createdAt)}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">暂无审计记录，执行操作后会显示在这里。</p>
                )
              ) : (
                <p className="empty-state">正在加载审计日志...</p>
              )}
              </section>

              <section className="settings-block teacher-session-settings">
              <div>
              <span className="eyebrow">活跃会话</span>
              <h3>登录设备管理</h3>
              <p>查看当前账号的活跃登录，可一键下线可疑设备。下线后该设备需重新登录。</p>
              </div>
              {sessionError ? <p className="teacher-ai-warning">{sessionError}</p> : null}
              {sessions ? (
              sessions.length > 0 ? (
                <div className="teacher-session-list">
                  {sessions.map((entry) => (
                    <div className="teacher-session-row" key={entry.id}>
                      <div className="teacher-session-info">
                        <strong>{describeUserAgent(entry.userAgent)}</strong>
                        <small>{entry.ipAddress ?? "未知 IP"} · {formatAuditTime(entry.lastActiveAt ?? entry.createdAt)}</small>
                      </div>
                      <button className="ghost-button danger" onClick={() => revokeSession(entry.id)} type="button">
                        下线
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">当前没有活跃会话。</p>
              )
              ) : (
              <p className="empty-state">正在加载会话...</p>
              )}
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

            <hr className="settings-divider" />
            <ChangePasswordBlock />
          </section>
        )}
      </div>
    </div>
  );
}

function formatAuditTime(value) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function describeUserAgent(userAgent) {
  if (!userAgent) return "未知设备";
  if (/Chrome/.test(userAgent) && !/Edg/.test(userAgent)) return "Chrome 浏览器";
  if (/Edg/.test(userAgent)) return "Edge 浏览器";
  if (/Firefox/.test(userAgent)) return "Firefox 浏览器";
  if (/Safari/.test(userAgent)) return "Safari 浏览器";
  if (/node/i.test(userAgent)) return "API 客户端";
  return String(userAgent).slice(0, 40);
}

function ChangePasswordBlock() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(""); // success | error
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(nextPassword);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    if (nextPassword !== confirmPassword) {
      setMessageType("error");
      setMessage("两次输入的新密码不一致");
      return;
    }
    if (strength.score === "weak") {
      setMessageType("error");
      setMessage("密码强度太弱：至少 8 位并包含字母和数字或特殊字符");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({ currentPassword, nextPassword });
      setMessageType("success");
      setMessage("密码修改成功");
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message ?? "密码修改失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="change-password-form" onSubmit={handleSubmit}>
      <span className="eyebrow">修改密码</span>
      <label className="form-row">
        <span>当前密码</span>
        <input autoComplete="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </label>
      <label className="form-row">
        <span>新密码</span>
        <input autoComplete="new-password" type="password" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} />
      </label>
      {nextPassword ? (
        <div className={`password-strength password-strength-${strength.score}`} aria-label={`密码强度：${strength.label}`}>
          <span className="password-strength-bar" />
          <small>密码强度：{strength.label}</small>
        </div>
      ) : null}
      <label className="form-row">
        <span>确认新密码</span>
        <input autoComplete="new-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
      </label>
      {message ? <p className={messageType === "error" ? "note-error" : "note-success"}>{message}</p> : null}
      <button className="primary-button" disabled={busy} type="submit">
        {busy ? "提交中..." : "修改密码"}
      </button>
    </form>
  );
}
