/** A chronological reading of real events, or one summary per attempted experiment. */
export function RecentActivityChart({ model }) {
  const items = model?.items ?? [];
  const isSummary = model?.source === "progress";
  return (
    <div className="tech-chart recent-activity-chart" data-testid="chart-recent-activity">
      <div className="tech-chart-head">
        <strong>最近学习活动</strong>
        <small>{isSummary ? "实验记录汇总 · 每个实验一条" : `本次会话 · 最近 ${items.length} 条记录`}</small>
      </div>
      {items.length ? (
        <ol className="recent-activity-timeline" aria-label="真实学习活动时间轴">
          {items.map((item, index) => (
            <li className={`recent-activity-event ${item.status ?? "recorded"}`} key={item.id}>
              <span className="recent-activity-node" aria-hidden="true" />
              <div className="recent-activity-copy" title={`${item.title} · ${item.detail}`}>
                <div className="recent-activity-title"><strong>{item.title}</strong><time dateTime={item.timestamp ?? undefined} title={item.dateLabel}>{item.dateLabel === "最近记录" ? `记录 ${index + 1}` : item.dateLabel}</time></div>
                <small>{item.detail || item.statusLabel}</small>
              </div>
            </li>
          ))}
        </ol>
      ) : <div className="chart-empty-state"><strong className="chart-empty-note">还没有实验活动</strong><p>开始一次实验并提交检测后，就能看到自己的学习足迹。</p><span>活动仅来自实际记录。</span></div>}
      <p className="tech-chart-foot">{items.length ? isSummary ? "完成时间仅属于完成记录" : model.hasKnownTimestamps ? "按已记录时间展示" : "未记录时间 · 按实际最近顺序展示" : "从课程首页继续探索"}{model?.total > items.length ? ` · 共 ${model.total} 条` : ""}</p>
      {model?.fullItems?.length > items.length ? <div className="recent-activity-expanded-history" aria-label="其余实验活动">{model.fullItems.slice(items.length).map(item => <div key={item.id}><strong>{item.title}</strong><span>{item.detail}</span><small>{item.dateLabel}</small></div>)}</div> : null}
    </div>
  );
}
