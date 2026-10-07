import { useEffect, useMemo, useState } from "react";
import { Fire, Info } from "@phosphor-icons/react";
import { api } from "../../apiClient.js";
import { buildHeatmapModel } from "../../recordsScreenModel.js";
import "./recordsHeatmap.css";

/**
 * 学习热力图（近 7 天 × 每 2 小时）。
 * 借鉴学习通「在线学习热力图」的组织方式，但每一格都来自真实 attempt 时间戳：
 * 关卡提交（challenge_attempts）+ 课堂演示练习（demo_attempts），按本地时区归格。
 */
export function RecordsHeatmap({ days = 7, bucketHours = 2, suppliedActivity }) {
  const [activity, setActivity] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (suppliedActivity !== undefined) { setActivity(suppliedActivity); setFailed(false); return; }
    api.learningActivity()
      .then((data) => { if (!cancelled) setActivity(data ?? {}); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [suppliedActivity]);

  const model = useMemo(() => buildHeatmapModel(activity ?? {}, { days, bucketHours }), [activity, days, bucketHours]);
  // 参照学习通版式：时间从下往上（00:00 在底、22:00 在顶）
  const rowsDesc = useMemo(() => [...model.rows].reverse(), [model.rows]);

  if (failed) {
    return (
      <section aria-label="学习热力图" className="records-panel records-heatmap-panel">
        <div className="records-panel-head"><strong><Fire size={16} /> 学习热力图</strong></div>
        <p className="heatmap-empty">暂时取不到学习时间数据，稍后再试。</p>
      </section>
    );
  }

  return (
    <section aria-label="学习热力图" className="records-panel records-heatmap-panel">
      <div className="records-panel-head">
        <strong><Fire size={16} /> 学习热力图</strong>
        <small>近 {model.days} 天 · 每 {model.bucketHours} 小时 · 来自真实实验与演示记录</small>
      </div>

      {model.hasData ? (
        <>
          <div className="heatmap-body">
            <div className="heatmap-hours" aria-hidden="true">
              {rowsDesc.map((row) => <span key={row.startHour}>{String(row.startHour).padStart(2, "0")}</span>)}
            </div>
            <div className="heatmap-grid-wrap">
              <div className="heatmap-weekdays" aria-hidden="true">
                {model.columns.map((col) => (
                  <span className={col.isToday ? "is-today" : undefined} key={col.day}>{col.weekday}</span>
                ))}
              </div>
              <div className="heatmap-grid" role="img"
                aria-label={`近 ${model.days} 天共 ${model.total} 次学习提交，覆盖 ${model.activeDays} 天`}>
                {rowsDesc.map((row) => model.columns.map((col, index) => {
                  const cell = row.cells[index];
                  const title = `${col.label} 周${col.weekday} ${String(row.startHour).padStart(2, "0")}:00–${String(row.endHour % 24).padStart(2, "0")}:00　${cell.attempts} 次提交 · ${Math.round(cell.minutes * 10) / 10} 分钟`;
                  return <span className={`heatmap-cell level-${cell.level}`} key={`${row.startHour}-${col.day}`} title={title} />;
                }))}
              </div>
              <div className="heatmap-dates" aria-hidden="true">
                {model.columns.map((col) => (
                  <span className={col.isToday ? "is-today" : undefined} key={col.day}>{col.isToday ? "今日" : col.label}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="heatmap-foot">
            <p className="heatmap-summary">
              近 {model.days} 天共 <strong>{model.total}</strong> 次提交 · 累计 <strong>{Math.round(model.minutes * 10) / 10}</strong> 分钟 · 有活动 <strong>{model.activeDays}</strong> 天
              {model.peak ? <>　最活跃：<strong>周{model.peak.weekday} {String(model.peak.startHour).padStart(2, "0")}:00–{String(model.peak.endHour % 24).padStart(2, "0")}:00</strong>（{model.peak.attempts} 次）</> : null}
            </p>
            <div className="heatmap-legend" aria-hidden="true">
              <span>少</span>
              {[0, 1, 2, 3, 4].map((level) => <i className={`heatmap-cell level-${level}`} key={level} />)}
              <span>多</span>
            </div>
          </div>
          <p className="heatmap-hint"><Info size={13} /> 空格表示那段时间没有实验或演示学习记录；颜色按个人活动强度分档。</p>
        </>
      ) : (
        <p className="heatmap-empty">
          近 {model.days} 天还没有实验或演示提交记录。完成一次实验检测或课堂演示练习后，这里会按你实际提交的时间点亮。
        </p>
      )}
    </section>
  );
}
