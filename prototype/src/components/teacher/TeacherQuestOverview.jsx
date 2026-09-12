import { CaretRight, Users } from "@phosphor-icons/react";

export function TeacherQuestOverview({ model, onSelectStage }) {
  const chapters = model.chapters ?? [];
  const overall = chapters.length
    ? Math.round(chapters.reduce((sum, ch) => sum + ch.completionRate, 0) / chapters.length)
    : 0;

  return (
    <section aria-label="班级探索进度" className="teacher-quest-overview">
      <div className="teacher-quest-header">
        <Users aria-hidden="true" size={20} weight="fill" />
        <div>
          <span className="eyebrow">班级探索进度</span>
          <h2>课程路线覆盖率</h2>
        </div>
        <div className="teacher-quest-summary">
          <strong>{overall}%</strong>
          <span>全课程平均完成度 · {model.totalStudents} 名学生</span>
        </div>
      </div>
      <div className="teacher-quest-chapters">
        {chapters.map((chapter, index) => (
          <article
            className={`teacher-quest-chapter ${chapter.completionRate >= 100 ? "completed" : chapter.completionRate > 0 ? "in-progress" : ""}`}
            key={chapter.id}
          >
            <div className="teacher-quest-chapter-index" aria-hidden="true">{index + 1}</div>
            <div className="teacher-quest-chapter-main">
              <div className="teacher-quest-chapter-title">
                <strong>{chapter.title}</strong>
                <small>{chapter.experimentCount} 个实验 · {chapter.completed}/{chapter.total} 项人次完成</small>
              </div>
              <div className="teacher-quest-bar-shell">
                <div className="teacher-quest-bar-fill" style={{ width: `${chapter.completionRate}%` }} />
              </div>
              <details className="teacher-quest-chapter-detail">
                <summary>实验明细</summary>
                <div className="teacher-quest-chapter-items">
                  {chapter.items?.map((item) => (
                    <button type="button" key={item.id} className="teacher-quest-item" onClick={() => onSelectStage?.(item.id)}>
                      <span>{item.title}</span>
                      <span className="teacher-quest-item-rate">{item.completionRate}%</span>
                    </button>
                  ))}
                </div>
              </details>
            </div>
            <div className="teacher-quest-chapter-rate">
              <strong>{chapter.completionRate}%</strong>
              <span>{chapter.completionRate >= 100 ? "已完成" : chapter.completionRate > 0 ? "进行中" : "未开始"}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
