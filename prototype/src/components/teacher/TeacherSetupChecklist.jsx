import { CheckCircle, Circle, ClipboardText } from "@phosphor-icons/react";

export function TeacherSetupChecklist({ steps }) {
  if (!steps || steps.length === 0) return null;

  const allCompleted = steps.every((step) => step.completed);
  if (allCompleted) return null;

  return (
    <section aria-label="首次开课" className="teacher-setup-checklist">
      <div className="teacher-setup-header">
        <ClipboardText aria-hidden="true" size={20} weight="fill" />
        <div>
          <span className="eyebrow">首次开课</span>
          <h2>完成课前准备</h2>
        </div>
      </div>
      <ol className="teacher-setup-steps">
        {steps.map((step) => (
          <li
            className={step.completed ? "teacher-setup-step completed" : "teacher-setup-step"}
            key={step.id}
          >
            {step.completed ? (
              <CheckCircle aria-hidden="true" size={20} weight="fill" />
            ) : (
              <Circle aria-hidden="true" size={20} />
            )}
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
