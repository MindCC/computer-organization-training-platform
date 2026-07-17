import { ClockCountdown, Star, Lightning, CheckCircle } from "@phosphor-icons/react";

export function MissionHud({ viewModel }) {
  if (!viewModel.active) return null;
  const { title, stageIndex, currentStage, remainingSeconds, xp, stars, streak, paused, studentStatus } = viewModel;
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const statusLabel = studentStatus === "completed" ? "已完成" : paused ? "已暂停" : "进行中";

  return (
    <div className="mission-hud" role="status" aria-label="任务状态">
      <div className="mission-hud-left">
        <span className="mission-hud-stage">
          阶段 {stageIndex + 1} / 4
        </span>
        <strong>{currentStage?.title ?? title}</strong>
        <span className={`mission-hud-status ${paused ? "paused" : ""}`}>{statusLabel}</span>
      </div>
      <div className="mission-hud-right">
        <span className="mission-hud-timer">
          <ClockCountdown size={14} />
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
        <span className="mission-hud-xp">
          <Lightning size={14} /> {xp} XP
        </span>
        <span className="mission-hud-stars">
          {[1, 2, 3].map((n) => (
            <Star key={n} size={14} weight={n <= stars ? "fill" : "regular"} />
          ))}
        </span>
        <span className="mission-hud-streak">
          <CheckCircle size={14} /> ×{streak}
        </span>
      </div>
    </div>
  );
}
