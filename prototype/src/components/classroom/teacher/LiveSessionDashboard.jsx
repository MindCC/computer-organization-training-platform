import { ClockCountdown, Pause, Play, Stop, ArrowClockwise } from "@phosphor-icons/react";

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function LiveSessionDashboard({ viewModel, onControl, onRefresh, lastUpdatedAt }) {
  const { title, status, paused } = viewModel;

  return (
    <div className="live-session-dashboard">
      <div className="live-session-status">
        <div className="live-session-info">
          <strong>{title}</strong>
          <span className={`session-status-tag ${status}`}>
            {status === "live" ? "进行中" : status === "paused" ? "已暂停" : status === "ended" ? "已结束" : "草稿"}
          </span>
        </div>
        <div className="live-session-controls">
          <span className="live-session-time">
            <ClockCountdown size={14} />
            最后更新：{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : "—"}
          </span>
          <button className="ghost-button" onClick={onRefresh} type="button">
            <ArrowClockwise size={14} /> 刷新
          </button>
          {status === "draft" && (
            <button className="primary-button" onClick={() => onControl("start")} type="button">
              <Play size={16} /> 开始课堂
            </button>
          )}
          {status === "live" && (
            <>
              <button className="secondary-button" onClick={() => onControl("pause")} type="button">
                <Pause size={16} /> 暂停
              </button>
              <button className="danger-button" onClick={() => onControl("end")} type="button">
                <Stop size={16} /> 结束课堂
              </button>
            </>
          )}
          {status === "paused" && (
            <>
              <button className="primary-button" onClick={() => onControl("resume")} type="button">
                <Play size={16} /> 恢复
              </button>
              <button className="danger-button" onClick={() => onControl("end")} type="button">
                <Stop size={16} /> 结束课堂
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function EndConfirmation({ visible, title, onConfirm, onCancel }) {
  if (!visible) return null;
  return (
    <div className="confirmation-overlay">
      <div className="confirmation-dialog">
        <strong>结束课堂</strong>
        <p>确定要结束「{title}」吗？结束后不可恢复。</p>
        <div className="confirmation-actions">
          <button className="ghost-button" onClick={onCancel} type="button">取消</button>
          <button className="danger-button" onClick={onConfirm} type="button">确认结束</button>
        </div>
      </div>
    </div>
  );
}
