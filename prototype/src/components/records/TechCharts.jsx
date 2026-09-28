import { useId } from "react";

/**
 * 蓝色大屏统计图：全部手写 SVG，不引入图表库（守住首屏构建预算，
 * 也方便套用科技蓝的辉光与网格语言）。
 */

const DONUT_COLORS = {
  completed: "#34d399",
  "in-progress": "#fbbf24",
  pending: "#3b4a6b",
};

function polar(cx, cy, radius, angleDeg) {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function donutSegment(cx, cy, outerR, innerR, startAngle, endAngle) {
  const [ox1, oy1] = polar(cx, cy, outerR, startAngle);
  const [ox2, oy2] = polar(cx, cy, outerR, endAngle);
  const [ix1, iy1] = polar(cx, cy, innerR, endAngle);
  const [ix2, iy2] = polar(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2}`,
    `L ${ix1} ${iy1}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
    "Z",
  ].join(" ");
}

export function StatusDonut({ distribution }) {
  const total = distribution.reduce((sum, entry) => sum + entry.count, 0);
  let cursor = 0;
  const segments = distribution.map((entry) => {
    const fraction = total > 0 ? entry.count / total : 0;
    const start = cursor * 360;
    cursor += fraction;
    return { ...entry, start, end: cursor * 360, fraction };
  });
  const litRate = total > 0 ? Math.round((distribution.find((e) => e.key === "completed")?.count ?? 0) / total * 100) : 0;

  return (
    <div className="tech-chart tech-donut" data-testid="chart-donut">
      <div className="tech-chart-head">
        <strong>树杈点亮分布</strong>
        <small>共 {total} 个实验</small>
      </div>
      <div className="tech-donut-body">
        <svg viewBox="0 0 120 120" role="img" aria-label={`已点亮 ${litRate}%`}>
          <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(59,74,107,0.35)" strokeWidth="14" />
          {segments.filter((s) => s.count > 0).map((s) => (
            <path
              className="donut-segment"
              d={donutSegment(60, 60, 53, 39, s.start + 1, s.end - 1)}
              fill={DONUT_COLORS[s.key]}
              key={s.key}
              opacity={s.key === "pending" ? 0.55 : 0.95}
            />
          ))}
          <text className="donut-center-value" textAnchor="middle" x="60" y="58">{litRate}%</text>
          <text className="donut-center-label" textAnchor="middle" x="60" y="72">已点亮</text>
        </svg>
        <ul className="tech-legend">
          {segments.map((s) => (
            <li key={s.key}>
              <span className="legend-dot" style={{ background: DONUT_COLORS[s.key] }} />
              <span>{s.label}</span>
              <strong>{s.count}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const LINE_W = 300;
const LINE_H = 120;
const LINE_PAD = { left: 30, right: 10, top: 12, bottom: 22 };

function linePoints(series, key) {
  const innerW = LINE_W - LINE_PAD.left - LINE_PAD.right;
  const innerH = LINE_H - LINE_PAD.top - LINE_PAD.bottom;
  const step = series.length > 1 ? innerW / (series.length - 1) : 0;
  return series.map((entry, index) => {
    const x = LINE_PAD.left + index * step;
    const y = LINE_PAD.top + innerH - (Math.max(0, Math.min(100, entry[key])) / 100) * innerH;
    return [x, y];
  });
}

function toPath(points) {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

export function ChapterScoreLine({ series }) {
  const gradientId = useId();
  const scorePoints = linePoints(series, "avgScore");
  const ratePoints = linePoints(series, "completionRate");
  const areaPath = `${toPath(scorePoints)} L ${scorePoints.at(-1)?.[0] ?? LINE_PAD.left} ${LINE_H - LINE_PAD.bottom} L ${scorePoints[0]?.[0] ?? LINE_PAD.left} ${LINE_H - LINE_PAD.bottom} Z`;

  return (
    <div className="tech-chart tech-line" data-testid="chart-line">
      <div className="tech-chart-head">
        <strong>各章得分与点亮率</strong>
        <small>已完成实验平均分 / 完成率（%）</small>
      </div>
      <svg preserveAspectRatio="none" viewBox={`0 0 ${LINE_W} ${LINE_H}`} role="img" aria-label="各章平均分与完成率折线图">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(56,189,248,0.45)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0.02)" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = LINE_PAD.top + (LINE_H - LINE_PAD.top - LINE_PAD.bottom) * (1 - tick / 100);
          return (
            <g key={tick}>
              <line stroke="rgba(80,110,180,0.22)" strokeDasharray="3 5" x1={LINE_PAD.left} x2={LINE_W - LINE_PAD.right} y1={y} y2={y} />
              <text className="line-tick" x={LINE_PAD.left - 6} y={y + 3} textAnchor="end">{tick}</text>
            </g>
          );
        })}
        {series.length > 1 ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
        {series.length > 1 ? <path className="line-score" d={toPath(scorePoints)} fill="none" /> : null}
        {series.length > 1 ? <path className="line-rate" d={toPath(ratePoints)} fill="none" /> : null}
        {scorePoints.map(([x, y], index) => (
          <circle className="line-dot score" cx={x} cy={y} key={`s-${index}`} r={2.6} />
        ))}
        {ratePoints.map(([x, y], index) => (
          <circle className="line-dot rate" cx={x} cy={y} key={`r-${index}`} r={2.2} />
        ))}
        {series.map((entry, index) => {
          const innerW = LINE_W - LINE_PAD.left - LINE_PAD.right;
          const step = series.length > 1 ? innerW / (series.length - 1) : 0;
          const x = LINE_PAD.left + index * step;
          return <text className="line-x-label" key={entry.chapterId} textAnchor="middle" x={x} y={LINE_H - 6}>{entry.number}</text>;
        })}
      </svg>
      <div className="tech-legend inline">
        <span><span className="legend-dot" style={{ background: "#38bdf8" }} />平均分</span>
        <span><span className="legend-dot" style={{ background: "#a78bfa" }} />点亮率</span>
      </div>
    </div>
  );
}

export function ChapterLitBars({ series }) {
  return (
    <div className="tech-chart tech-bars" data-testid="chart-bars">
      <div className="tech-chart-head">
        <strong>章节点亮进度</strong>
        <small>树杈点亮数 / 实验总数</small>
      </div>
      <div className="tech-bars-list">
        {series.map((entry) => (
          <div className="tech-bar-row" key={entry.chapterId}>
            <span className="tech-bar-label" title={entry.shortTitle}>{entry.label}</span>
            <span className="tech-bar-track">
              <span
                className={`tech-bar-fill ${entry.completionRate === 100 ? "full" : entry.completionRate > 0 ? "partial" : "empty"}`}
                style={{ width: `${entry.completionRate}%` }}
              />
            </span>
            <span className="tech-bar-value">{entry.lit}/{entry.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
