import { ArrowRight, ClockCountdown, Target, TrendUp } from "@phosphor-icons/react";

export function CurrentQuestPanel({ stage, record, onEnter }) {
  if (!stage) return null;

  const isContinue = record?.status === "in-progress";
  const attempts = record?.attempts ?? 0;
  const bestScore = record?.bestScore ?? 0;

  return (
    <section className="current-quest-panel">
      <div className="current-quest-info">
        <span className="eyebrow">当前任务</span>
        <h1>{stage.title}</h1>
        {stage.description ? <p>{stage.description}</p> : null}
        <div className="quest-facts">
          <span className="quest-fact">
            <ClockCountdown aria-hidden="true" size={16} />
            预计 {stage.estimatedLabel ?? `${stage.estimatedMinutes ?? "?"} 分钟`}
          </span>
          <span className="quest-fact">
            <TrendUp aria-hidden="true" size={16} />
            {attempts} 次尝试
          </span>
          <span className="quest-fact">
            <Target aria-hidden="true" size={16} />
            通过全部评测条件
          </span>
          {bestScore > 0 ? (
            <span className="quest-fact quest-fact-score">最佳 {bestScore} 分</span>
          ) : null}
        </div>
      </div>
      <button
        className="primary-button quest-primary-action"
        onClick={onEnter}
        type="button"
      >
        <ArrowRight aria-hidden="true" size={18} weight="bold" />
        {isContinue ? "继续实验" : "进入当前关卡"}
      </button>
    </section>
  );
}
