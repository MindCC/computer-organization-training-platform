import { useEffect, useRef, useState } from "react";
import { MonitorPlay } from "@phosphor-icons/react";
import { COURSEWARE } from "../courseware.js";
import "./coursewareView.css";

const AI_CHAPTERS = COURSEWARE.chapters.filter(chapter => (chapter.embeds ?? []).length > 0);

export function CoursewareView() {
  const [lectureChapter, setLectureChapter] = useState(AI_CHAPTERS[0]?.id ?? null);
  const lectureRef = useRef(null);
  const chapter = AI_CHAPTERS.find(item => item.id === lectureChapter) ?? AI_CHAPTERS[0];
  const embed = chapter?.embeds[0];

  useEffect(() => {
    const element = lectureRef.current;
    if (!element) return undefined;
    const fitLecture = () => {
      element.style.height = `${Math.max(420, window.innerHeight - element.getBoundingClientRect().top)}px`;
    };
    fitLecture();
    window.addEventListener("resize", fitLecture);
    return () => window.removeEventListener("resize", fitLecture);
  }, []);

  return (
    <div className="courseware-view">
      <section className="courseware-lecture" ref={lectureRef} aria-label="AI 互动课件">
        <header className="courseware-lecture-head">
          <strong><MonitorPlay size={18} /> AI 互动课件</strong>
          <nav className="lecture-chapter-tabs" aria-label="选择 AI 课件章节">
            {AI_CHAPTERS.map(item => <button key={item.id} type="button" aria-pressed={lectureChapter === item.id} className={lectureChapter === item.id ? "active" : ""} onClick={() => setLectureChapter(item.id)}>{item.title}</button>)}
          </nav>
          {embed && <a className="ghost-button lecture-fullscreen-link" href={embed.src} target="_blank" rel="noreferrer">独立打开 AI 课件 ↗</a>}
        </header>
        {embed ? <div className="courseware-lecture-player">
          <div className="courseware-lecture-player-head"><strong>{embed.title}</strong><span>若课件未显示，可尝试“独立打开 AI 课件”。</span></div>
          <iframe key={embed.src} allowFullScreen src={embed.src} title={`${embed.title} · AI 互动课件`} />
        </div> : <div className="courseware-lecture-empty"><p>暂无已配置的 AI 互动课件。</p></div>}
      </section>
    </div>
  );
}
