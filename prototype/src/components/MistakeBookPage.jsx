import { ArrowRight, BookOpen, Flame, Repeat, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api } from "../apiClient.js";

export function MistakeBookPage({ navigateToChallenge, changeView }) {
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.mistakes()
      .then((data) => { if (!cancelled) setBook(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="mistakes-layout">
        <section className="section-panel">
          <div className="section-heading"><h1>错题本</h1></div>
          <p className="note-error">{error}</p>
        </section>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="mistakes-layout">
        <section className="section-panel">
          <div className="section-heading"><h1>错题本</h1></div>
          <p className="empty-state">正在加载错题...</p>
        </section>
      </div>
    );
  }

  const { overview, items } = book;

  return (
    <div className="mistakes-layout">
      <section className="section-panel">
        <div className="section-heading">
          <div>
            <h1>错题本</h1>
            <p>按关卡回顾未通过的提交，找到你的易错点。</p>
          </div>
        </div>

        {overview.totalMistakes === 0 ? (
          <div className="empty-state">
            <BookOpen size={40} weight="duotone" />
            <strong>暂无错题</strong>
            <p>完成实验后这里会记录你的易错点。</p>
            <button className="primary-button" onClick={() => changeView("lab")} type="button">去实验工作台</button>
          </div>
        ) : (
          <>
            <div className="metric-grid">
              <div className="metric">
                <WarningCircle size={20} weight="duotone" />
                <span>错题总数</span>
                <strong>{overview.totalMistakes}</strong>
              </div>
              <div className="metric">
                <Repeat size={20} weight="duotone" />
                <span>涉及关卡</span>
                <strong>{overview.challengeCount}</strong>
              </div>
              <div className="metric">
                <Flame size={20} weight="duotone" />
                <span>最高频错误</span>
                <strong>{overview.topErrorType ?? "—"}</strong>
              </div>
            </div>

            <div className="mistake-group-list">
              {items.map((item) => (
                <article className="mistake-group" key={`${item.challengeId}::${item.errorType}`}>
                  <div className="mistake-group-header">
                    <div>
                      <strong>{item.challengeTitle}</strong>
                      <span className="mistake-type">{item.errorType}</span>
                    </div>
                    <div className="mistake-group-meta">
                      <span>{item.count} 次</span>
                      <small>{formatDate(item.lastSeen)}</small>
                    </div>
                  </div>
                  {item.snapshots.length > 0 ? (
                    <div className="mistake-snapshot-row">
                      {item.snapshots.map((snap, index) => (
                        <span className="mistake-snapshot" key={index}>
                          第 {item.count - index} 次 · {snap.score} 分
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <button
                    className="ghost-button mistake-retry"
                    onClick={() => navigateToChallenge(item.challengeId)}
                    type="button"
                  >
                    <ArrowRight size={14} /> 回到该关卡练习
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("zh-CN");
}
