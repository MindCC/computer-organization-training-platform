import { useEffect, useState } from "react";
import { api } from "../../apiClient.js";

/**
 * 课堂演示练习面板（学习记录 · 蓝色大屏右侧栏）。
 * 展示学生在各课堂演示页（public/demos）中的随堂练习汇总；
 * 未登录或无数据时自动隐藏，不影响大屏其余部分。
 */
export function DemoPracticePanel() {
  const [demos, setDemos] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.demoAttempts()
      .then((body) => { if (!cancelled) setDemos(body?.demos ?? []); })
      .catch(() => { if (!cancelled) setDemos([]); });
    return () => { cancelled = true; };
  }, []);

  if (!demos || demos.length === 0) return null;

  return (
    <div className="tech-chart" data-testid="demo-practice-panel">
      <div className="tech-chart-head">
        <strong>课堂演示练习</strong>
        <small>来自章节演示页的随堂成绩</small>
      </div>
      <div className="demo-practice-list">
        {demos.map((demo) => (
          <div className="demo-practice-row" key={demo.demoId}>
            <span className="demo-practice-title">{demo.title}</span>
            <span className="tech-bar-track">
              <span className={`tech-bar-fill ${demo.accuracy >= 80 ? "full" : demo.accuracy >= 60 ? "partial" : "empty"}`} style={{ width: `${demo.accuracy}%` }} />
            </span>
            <span className="demo-practice-meta">{demo.accuracy}% · {demo.batches} 批</span>
          </div>
        ))}
      </div>
    </div>
  );
}
