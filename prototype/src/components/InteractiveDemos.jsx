import { MonitorPlay } from "@phosphor-icons/react";
import { COURSEWARE } from "../courseware.js";
import { LEARNING_ITEMS } from "../platformLogic.js";
import { HOSTED_DEMOS } from "../shared/demoNavigation.js";
import { ExperimentThumbnail } from "./ExperimentThumbnail.jsx";
import { ParameterPlayground } from "./ParameterPlayground.jsx";
import "./coursewareView.css";
import "./interactiveDemos.css";

export function InteractiveDemos({ openDemo, navigateToChallenge }) {
  function followDemo(event, href) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const demo = HOSTED_DEMOS.find(item => `/demos/${item.file}` === href);
    if (!demo) return;
    event.preventDefault();
    openDemo(demo.id);
  }
  return <div className="courseware-view interactive-demos-view">
    <section className="courseware-chapters" aria-labelledby="interactive-demos-heading">
      <header className="interactive-demos-heading">
        <span className="interactive-demos-kicker">计算机组成原理 · 八章原理探索</span>
        <h1 id="interactive-demos-heading">课堂互动演示</h1>
        <p>选择章节，切换输入、观察信号和运算步骤，在操作中理解原理。</p>
      </header>
      <div className="courseware-demo-grid">
        {COURSEWARE.chapters.map(chapter => <article key={chapter.id} className="courseware-demo-card courseware-chapter-card">
          <header><h2>{chapter.title}</h2></header>
          <div className="courseware-chapter-demos">{(chapter.demos ?? []).map(demo => <a href={demo.href} key={demo.href} onClick={event => followDemo(event, demo.href)} className="courseware-demo-entry" title={demo.note}>
            <ExperimentThumbnail demo={demo} /><strong><MonitorPlay size={16} />{demo.title}</strong><small>{demo.note}</small>
          </a>)}</div>
          <details className="courseware-chapter-experiments"><summary>{chapter.linkedChallenges.length} 项相关实验</summary><div>{chapter.linkedChallenges.map(id => {
            const experiment = LEARNING_ITEMS.find(item => item.id === id);
            return <button type="button" key={id} onClick={() => navigateToChallenge(id)} className="courseware-experiment-entry"><ExperimentThumbnail challengeId={id} /><span><strong>{experiment?.title ?? id}</strong><small>进入练习 →</small></span></button>;
          })}</div></details>
        </article>)}
      </div>
    </section>
    <ParameterPlayground />
  </div>;
}
