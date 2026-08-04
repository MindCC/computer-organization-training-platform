import { CaretRight } from "@phosphor-icons/react";

export function QuestMap({ model, onSelect, allowSkipLocked = false }) {
  return (
    <section aria-label="课程探索地图" className="quest-map">
      <div className="quest-track">
        {model.stages.map((stage, index) => (
          <div className="quest-segment" key={stage.id}>
            <button
              aria-current={stage.isCurrent ? "step" : undefined}
              className={`quest-stage ${stage.status} ${stage.isCurrent ? "current" : ""}`}
              disabled={stage.status === "locked" && !allowSkipLocked}
              onClick={() => onSelect(stage.id)}
              type="button"
            >
              <span className="quest-stage-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="quest-stage-body">
                <strong>{stage.title}</strong>
                <small>{stage.statusLabel ?? stage.status}</small>
              </div>
              {stage.unlockRequirement ? (
                <span className="quest-lock-reason">{stage.unlockRequirement}</span>
              ) : null}
              {stage.isCurrent ? (
                <CaretRight aria-hidden="true" className="quest-stage-caret" size={16} weight="fill" />
              ) : null}
            </button>
            {index < model.stages.length - 1 ? (
              <span aria-hidden="true" className="quest-connector" />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
