import { ArrowRight, WarningCircle } from "@phosphor-icons/react";

const severityIcon = {
  danger: WarningCircle,
  warn: WarningCircle,
  success: ArrowRight,
};

const severityClass = {
  danger: "intervention-danger",
  warn: "intervention-warn",
  success: "intervention-success",
};

export function InterventionGroups({ groups, onAction }) {
  if (!groups || groups.length === 0) return null;

  return (
    <section aria-label="干预分组" className="intervention-groups">
      <div className="intervention-groups-header">
        <span className="eyebrow">需要关注的学生</span>
        <h2>干预分组</h2>
      </div>
      <div className="intervention-group-list">
        {groups.map((group) => {
          const Icon = severityIcon[group.severity] ?? WarningCircle;
          const cls = severityClass[group.severity] ?? "intervention-warn";

          return (
            <article className={`intervention-group ${cls}`} key={group.id}>
              <div className="intervention-group-header">
                <Icon aria-hidden="true" size={20} weight="fill" />
                <strong>{group.label}</strong>
                <button
                  className="ghost-button intervention-action"
                  onClick={() => onAction?.(group.id, group.students)}
                  type="button"
                >
                  {group.action}
                </button>
              </div>
              <div className="intervention-student-list">
                {group.students.slice(0, 8).map((s) => (
                  <span className="intervention-student-chip" key={s.id}>
                    {s.displayName}
                  </span>
                ))}
                {group.students.length > 8 ? (
                  <span className="intervention-student-chip">+{group.students.length - 8} 人</span>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
