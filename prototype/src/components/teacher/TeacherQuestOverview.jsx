import { CaretRight, Users } from "@phosphor-icons/react";

export function TeacherQuestOverview({ model, onSelectStage }) {
  return (
    <section aria-label="班级探索进度" className="teacher-quest-overview">
      <div className="teacher-quest-header">
        <Users aria-hidden="true" size={20} weight="fill" />
        <div>
          <span className="eyebrow">班级探索进度</span>
          <h2>课程路线覆盖率</h2>
        </div>
        <span className="teacher-quest-total">{model.totalStudents} 名学生</span>
      </div>
      <div className="teacher-quest-track">
        {model.stages.map((stage) => (
          <button
            className={`teacher-quest-stage ${stage.completionRate >= 100 ? "completed" : stage.reached > 0 ? "in-progress" : ""}`}
            key={stage.id}
            onClick={() => onSelectStage?.(stage.id)}
            type="button"
          >
            <div className="teacher-quest-stage-top">
              <strong>{stage.title}</strong>
              <CaretRight aria-hidden="true" size={14} weight="fill" />
            </div>
            <div className="teacher-quest-bar-shell">
              <div
                className="teacher-quest-bar-fill"
                style={{ width: `${stage.completionRate}%` }}
              />
            </div>
            <div className="teacher-quest-stage-meta">
              <span>{stage.reached} 已到达</span>
              <span>{stage.completionRate}% 完成</span>
            </div>
            <small className="teacher-quest-blocker">{stage.blocker}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
