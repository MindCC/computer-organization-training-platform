import { useEffect, useState } from "react";
import { api } from "../../apiClient.js";

/**
 * Account-scoped chapter-demo practice; keeps loading, empty and retry states visible.
 */
export function DemoPracticePanel({ userId, onOpenCourse, suppliedDemos }) {
  const [demos, setDemos] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDemos(null);
    setError("");
    if (suppliedDemos !== undefined) { setDemos(suppliedDemos); return; }
    api.demoAttempts()
      .then((body) => { if (!cancelled) setDemos(body?.demos ?? []); })
      .catch((failure) => { if (!cancelled) setError(failure?.message ?? "课堂练习记录加载失败"); });
    return () => { cancelled = true; };
  }, [userId, version, suppliedDemos]);

  return (
    <div className="tech-chart demo-practice-chart" data-testid="demo-practice-panel">
      <div className="tech-chart-head">
        <strong>课堂演示练习</strong>
        <small>来自章节演示页的随堂成绩</small>
      </div>
      {error ? <div className="chart-empty-state"><strong className="chart-empty-note" role="alert">{error}</strong><button className="records-inline-action" type="button" onClick={() => setVersion(value => value + 1)}>重试课堂练习记录</button></div>
        : demos === null ? <div className="chart-empty-state" role="status"><strong>正在加载课堂练习…</strong><p>同步章节演示页中的实际成绩。</p></div>
          : demos.length === 0 ? <div className="chart-empty-state"><strong className="chart-empty-note">暂无课堂练习记录</strong><p>打开章节演示页，完成随堂练习后会自动汇总。</p>{onOpenCourse ? <button className="records-inline-action" type="button" onClick={onOpenCourse}>前往课程首页</button> : null}</div>
            : <div className="demo-practice-list">
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
      }
      <p className="tech-chart-foot">{demos?.length ? `${demos.length} 个演示页 · ${demos.reduce((sum, demo) => sum + Number(demo.batches ?? 0), 0)} 批随堂练习` : "课堂演示成绩独立于关卡实验"}</p>
    </div>
  );
}
