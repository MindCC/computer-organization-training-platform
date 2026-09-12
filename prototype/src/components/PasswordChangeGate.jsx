import { useState } from "react";
import { api } from "../apiClient.js";
import { passwordStrength } from "../passwordStrength.js";

/**
 * 阻断式改密页：账号使用一次性初始口令（导入或重置生成）时，服务端会拒绝所有
 * 业务接口，必须在这里改密后才能继续使用。
 */
export function PasswordChangeGate({ user, onDone, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
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
      setMessage("密码修改成功，正在进入课堂…");
      onDone?.();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message ?? "密码修改失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <strong>首次登录需要修改密码</strong>
        <p className="empty-state">
          {user?.displayName ? `${user.displayName}，` : ""}当前使用的是初始密码，请设置你自己的密码后继续使用。
        </p>
        <label className="form-row">
          <span>当前（初始）密码</span>
          <input autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </label>
        <label className="form-row">
          <span>新密码</span>
          <input autoComplete="new-password" type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
        </label>
        {nextPassword ? (
          <div className={`password-strength password-strength-${strength.score}`} aria-label={`密码强度：${strength.label}`}>
            <span className="password-strength-bar" />
            <small>密码强度：{strength.label}</small>
          </div>
        ) : null}
        <label className="form-row">
          <span>确认新密码</span>
          <input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        {message ? <p className={messageType === "error" ? "note-error" : "note-success"}>{message}</p> : null}
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? "提交中..." : "修改密码并继续"}
        </button>
        {onLogout ? (
          <button className="ghost-button" onClick={onLogout} type="button">退出登录</button>
        ) : null}
      </form>
    </div>
  );
}
