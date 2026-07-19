import { CheckCircle, Circle, Info, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";

export function FirstUseGuide({ steps, storageKey, onDismiss }) {
  const storage = typeof localStorage !== "undefined" ? localStorage : null;
  const [dismissed, setDismissed] = useState(() => {
    try {
      if (storage) return storage.getItem(storageKey) === "1";
    } catch { /* noop */ }
    return false;
  });
  const panelRef = useRef(null);

  if (dismissed) return null;

  function handleDismiss() {
    try {
      if (storage) storage.setItem(storageKey, "1");
    } catch { /* noop */ }
    setDismissed(true);
    onDismiss?.();
  }

  function handleDismissKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleDismiss();
    }
  }

  const allCompleted = steps.every((step) => step.completed);
  if (allCompleted) return null;

  return (
    <section
      aria-label="新手指引"
      className="first-use-guide"
      ref={panelRef}
    >
      <div className="first-use-guide-header">
        <div className="first-use-guide-title">
          <Info aria-hidden="true" size={20} weight="fill" />
          <div>
            <strong>新手上路</strong>
            <span>按步骤熟悉实训平台，完成后自动关闭</span>
          </div>
        </div>
        <button
          aria-label="跳过引导"
          className="ghost-button first-use-dismiss"
          onClick={handleDismiss}
          onKeyDown={handleDismissKeyDown}
          type="button"
        >
          <X aria-hidden="true" size={16} />
          跳过引导
        </button>
      </div>
      <ol className="first-use-steps">
        {steps.map((step) => (
          <li
            className={step.completed ? "first-use-step completed" : "first-use-step"}
            key={step.id}
          >
            {step.completed ? (
              <CheckCircle aria-hidden="true" className="first-use-step-icon" size={22} weight="fill" />
            ) : (
              <Circle aria-hidden="true" className="first-use-step-icon" size={22} />
            )}
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
