import { Play, ClockCountdown, ArrowRight } from "@phosphor-icons/react";

export function CurrentMissionCard({ viewModel, onEnter }) {
  if (!viewModel.active) return null;
  const { title, stageIndex, currentStage, remainingSeconds, paused } = viewModel;
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;

  return (
    <div className="mission-channel-card" role="status" aria-label="当前课堂任务">
      <div className="mission-channel-badge">
        <span className="mission-channel-dot" />
        课堂频道
      </div>
      <div className="mission-channel-body">
        <div className="mission-channel-info">
          <strong>{title}</strong>
          <span>
            阶段 {stageIndex + 1} / 4 · {currentStage?.title ?? "—"}
          </span>
        </div>
        <div className="mission-channel-meta">
          <span className="mission-channel-time">
            <ClockCountdown size={14} />
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
          {paused ? (
            <span className="mission-channel-paused">已暂停</span>
          ) : (
            <button className="primary-button mission-enter-button" onClick={onEnter} type="button">
              <Play size={16} /> 继续任务
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
