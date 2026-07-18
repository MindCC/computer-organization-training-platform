import { useState } from "react";
import { BookOpen, CaretRight, ArrowSquareOut, Lightbulb, Flask, Presentation, Star } from "@phosphor-icons/react";
import { COURSEWARE } from "../courseware.js";

export function CoursewareView({ navigateToChallenge }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="courseware-view">
      <header className="courseware-header">
        <BookOpen size={28} />
        <div>
          <h1>{COURSEWARE.title}</h1>
          <p>教材：{COURSEWARE.textbook}</p>
        </div>
      </header>

      <div className="courseware-chapters">
        {COURSEWARE.chapters.map((ch) => (
          <div className={`courseware-chapter ${expanded === ch.id ? "expanded" : ""}`} key={ch.id}>
            <button className="chapter-header" onClick={() => setExpanded(expanded === ch.id ? null : ch.id)}>
              <CaretRight size={16} className={`chevron ${expanded === ch.id ? "rotated" : ""}`} />
              <div>
                <strong>{ch.title}</strong>
                <span><Presentation size={12} /> {ch.slides} 页PPT · {ch.sections?.length ?? 0} 个小节</span>
              </div>
            </button>
            {expanded === ch.id && (
              <div className="chapter-body">
                <section>
                  <strong><Star size={14} /> 小节内容</strong>
                  <div className="section-grid">
                    {ch.sections?.map((s, i) => (
                      <div className="section-chip" key={i}>{s}</div>
                    ))}
                  </div>
                </section>
                <section>
                  <strong><Lightbulb size={14} /> 核心知识点</strong>
                  <ul>{ch.keyPoints?.map((kp, i) => <li key={i}>{kp}</li>)}</ul>
                </section>
                <section>
                  <strong><Lightbulb size={14} /> 教学目标</strong>
                  <ul>{ch.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
                </section>
                {ch.discussionQuestions.length > 0 && (
                  <section>
                    <strong>思考题</strong>
                    <ol>{ch.discussionQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol>
                  </section>
                )}
                {ch.linkedChallenges.length > 0 && (
                  <section>
                    <strong><Flask size={14} /> 关联实验</strong>
                    <div className="linked-challenges">
                      {ch.linkedChallenges.map((cid) => (
                        <button key={cid} className="ghost-button" onClick={() => navigateToChallenge?.(cid)}>
                          <ArrowSquareOut size={14} /> 进入实验 →
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="courseware-footer">
        <h3>参考书目</h3>
        {COURSEWARE.references.map((ref, i) => <p key={i}>{i + 1}. {ref}</p>)}
        <p>在线资源：智慧树 杨泽雪 计算机组成原理与体系结构</p>
      </div>
    </div>
  );
}
