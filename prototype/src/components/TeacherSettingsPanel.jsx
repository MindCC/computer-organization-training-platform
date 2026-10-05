import { useEffect, useState } from "react";
import { api } from "../apiClient.js";
import { passwordStrength } from "../passwordStrength.js";
import { StudentImportPanel } from './teacher/StudentImportPanel.jsx';
import './accountSettings.css';

const AUDIT_ACTION_LABELS = {
  login_success: "登录成功",
  login_failure: "登录失败",
  import_students: "导入学生",
  reset_password: "重置密码",
  change_password: "修改密码",
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
  onClassesChanged,
  student,
  saveStudentSettings,
  initialSection = 'account',
}) {
  const selectedClass = teacherClasses.find((item) => item.id === selectedTeacherClassId);
  const isTeacher = auth.user?.role === "teacher";
  const isDemoTeacher = isTeacher && auth.user.profile?.demoAccount === true;
  const [section, setSection] = useState(initialSection);
  const [dbInfo, setDbInfo] = useState(null);
  const [dbInfoError, setDbInfoError] = useState("");
  const [auditLogs, setAuditLogs] = useState(null);
  const [auditError, setAuditError] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [sessions, setSessions] = useState(null);
  const [sessionError, setSessionError] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    if (!isTeacher || isDemoTeacher) return;
    let cancelled = false;
    fetch("/api/admin/db-info", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("数据库信息获取失败"))))
      .then((data) => { if (!cancelled) setDbInfo(data); })
      .catch((error) => { if (!cancelled) setDbInfoError(error.message); });
    return () => { cancelled = true; };
  }, [isTeacher, isDemoTeacher]);

  useEffect(() => {
    if (!isTeacher || isDemoTeacher) return;
    let cancelled = false;
    api.auditLogs({ action: auditAction, page: 1, pageSize: 20 })
      .then((data) => { if (!cancelled) setAuditLogs(data); })
      .catch((error) => { if (!cancelled) setAuditError(error.message); });
    return () => { cancelled = true; };
  }, [isTeacher, isDemoTeacher, auditAction]);

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

  async function downloadBackup() {
    setBackupMessage("");
    setBackupBusy(true);
    try {
      const blob = await api.downloadBackup(backupPassword);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `classroom-backup-${new Date().toISOString().slice(0, 10)}.sqlite`;
      anchor.click();
      URL.revokeObjectURL(url);
      setBackupPassword("");
      setBackupMessage("备份已开始下载。");
    } catch (error) {
      setBackupMessage(error.message ?? "备份下载失败");
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
      <div className={`settings-panel ${section === 'account' ? 'personal-settings-panel' : ''}`} role="dialog" aria-modal="true" aria-labelledby="settings-heading">
        <div className="settings-panel-header">
          <h2 id="settings-heading">{isTeacher && section === 'classroom' ? '课堂管理设置' : '个人设置'}</h2>
          <button className="ghost-button" onClick={() => setShowSettings(false)} type="button">关闭</button>
        </div>

        {isTeacher ? <div className="account-settings-tabs" role="tablist" aria-label="设置内容"><button type="button" role="tab" aria-selected={section === 'account'} onClick={() => setSection('account')}>个人设置</button><button type="button" role="tab" aria-selected={section === 'classroom'} onClick={() => setSection('classroom')}>课堂管理</button></div> : null}
        {isTeacher && section === 'classroom' ? (
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
              <p>体验教学流程时，可在登录页选择教师演示，进入独立的演示班级。</p>
            </section>

            <StudentImportPanel key={selectedTeacherClassId ?? 'none'} classId={selectedTeacherClassId} className={selectedClass?.name} onImported={onClassesChanged} isDemoTeacher={isDemoTeacher}/>

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

            {!isDemoTeacher && <><section className="settings-block teacher-backup-settings">
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
              <div className="teacher-backup-confirm">
                <label className="form-row">
                  <span>输入本人口令以确认</span>
                  <input
                    aria-label="备份确认口令"
                    autoComplete="current-password"
                    onChange={(event) => setBackupPassword(event.target.value)}
                    type="password"
                    value={backupPassword}
                  />
                </label>
                <button className="ghost-button" disabled={backupBusy || !backupPassword} onClick={downloadBackup} type="button">
                  {backupBusy ? "正在生成..." : "下载备份"}
                </button>
                {backupMessage ? <p className="teacher-backup-message">{backupMessage}</p> : null}
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
              </section></>}

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
          <PersonalAccountForm user={auth.user} student={student} onSave={saveStudentSettings} />
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

function PersonalAccountForm({ user, student, onSave }) {
  const [displayName, setDisplayName] = useState(user?.displayName ?? student?.name ?? '');
  const [mode, setMode] = useState(user?.profile?.mode ?? student?.mode ?? '适中提示模式');
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
    const passwordRequested = Boolean(currentPassword || nextPassword || confirmPassword);
    if (!displayName.trim()) {
      setMessageType('error'); setMessage('请填写姓名'); return;
    }
    if (passwordRequested && (!currentPassword || !nextPassword || !confirmPassword)) {
      setMessageType('error'); setMessage('修改密码时，请完整填写当前密码、新密码和确认新密码'); return;
    }
    if (passwordRequested && nextPassword !== confirmPassword) {
      setMessageType("error");
      setMessage("两次输入的新密码不一致");
      return;
    }
    if (passwordRequested && strength.score === "weak") {
      setMessageType("error");
      setMessage("密码强度太弱：至少 8 位并包含字母和数字或特殊字符");
      return;
    }
    setBusy(true);
    try {
      await onSave({ displayName: displayName.trim(), ...(user.role === 'student' ? { mode } : {}), ...(passwordRequested ? { currentPassword, nextPassword } : {}) });
      setMessageType("success");
      setMessage(passwordRequested ? '资料与密码已一起保存' : '个人设置已保存');
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message ?? '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="personal-account-form" onSubmit={handleSubmit} aria-busy={busy}>
      <section className="account-profile-fields" aria-label="账户资料">
        <label className="form-row"><span>姓名</span><input value={displayName} onChange={event => setDisplayName(event.target.value)} required maxLength={64} autoComplete="name" disabled={busy} /></label>
        <label className="form-row"><span>账号</span><input value={user.username} readOnly aria-readonly="true" /></label>
        <label className="form-row"><span>身份</span><input value={user.role === 'teacher' ? '教师' : '学生'} readOnly aria-readonly="true" /></label>
        {user.role === 'student' ? <label className="form-row"><span>提示模式</span><select value={mode} onChange={event => setMode(event.target.value)} disabled={busy}><option>强引导模式</option><option>适中提示模式</option><option>挑战模式</option></select></label> : null}
      </section>
      <section className="account-password-fields" aria-label="可选密码修改">
      <div className="account-password-heading"><strong>更新密码</strong><span>可选 · 保留为空即可只保存资料</span></div>
      <label className="form-row">
        <span>当前密码</span>
        <input autoComplete="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={busy} />
      </label>
      <label className="form-row">
        <span>新密码</span>
        <input autoComplete="new-password" type="password" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} maxLength={256} disabled={busy} />
      </label>
      {nextPassword ? (
        <div className={`password-strength password-strength-${strength.score}`} aria-label={`密码强度：${strength.label}`}>
          <span className="password-strength-bar" />
          <small>密码强度：{strength.label}</small>
        </div>
      ) : null}
      <label className="form-row">
        <span>确认新密码</span>
        <input autoComplete="new-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} maxLength={256} disabled={busy} />
      </label>
      </section>
      {message ? <p role={messageType === 'error' ? 'alert' : 'status'} className={messageType === "error" ? "note-error" : "note-success"}>{message}</p> : null}
      <button className="primary-button account-save-button" disabled={busy} type="submit">
        {busy ? '正在保存…' : '保存设置'}
      </button>
    </form>
  );
}
