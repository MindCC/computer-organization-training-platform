import { useEffect, useRef, useState } from "react";
import { ArrowsIn, ArrowsOut, MonitorPlay } from "@phosphor-icons/react";
import { COURSEWARE } from "../courseware.js";
import "./coursewareView.css";

const AI_CHAPTERS = COURSEWARE.chapters.filter(chapter => (chapter.embeds ?? []).length > 0);

export function CoursewareView() {
  const [lectureChapter, setLectureChapter] = useState(AI_CHAPTERS[0]?.id ?? null);
  const playerRef = useRef(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fullscreen = nativeFullscreen || expanded;
  const chapter = AI_CHAPTERS.find(item => item.id === lectureChapter) ?? AI_CHAPTERS[0];
  const embed = chapter?.embeds[0];

  useEffect(() => {
    const onFullscreenChange = () => setNativeFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = event => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', escape);
    };
  }, [expanded]);

  async function toggleFullscreen() {
    if (expanded) { setExpanded(false); return; }
    if (document.fullscreenElement === playerRef.current) {
      await document.exitFullscreen();
      return;
    }
    try {
      if (!playerRef.current?.requestFullscreen) { setExpanded(true); return; }
      await playerRef.current.requestFullscreen();
    } catch {
      setExpanded(true);
    }
  }

  return (
    <div className="courseware-view">
      <section className="courseware-lecture" aria-label="AI 互动课件">
        <header className="courseware-lecture-head">
          <strong><MonitorPlay size={18} /> AI 互动课件</strong>
          <nav className="lecture-chapter-tabs" aria-label="选择 AI 课件章节">
            {AI_CHAPTERS.map(item => <button key={item.id} type="button" aria-pressed={lectureChapter === item.id} className={lectureChapter === item.id ? "active" : ""} onClick={() => setLectureChapter(item.id)}>{item.title}</button>)}
          </nav>
        </header>
        {embed ? <div ref={playerRef} className={`courseware-lecture-player${expanded ? ' is-expanded' : ''}`}>
          <div className="courseware-lecture-player-head"><strong>{embed.title}</strong><button type="button" className="ghost-button lecture-fullscreen-button" aria-pressed={fullscreen} onClick={toggleFullscreen}>{fullscreen ? <ArrowsIn size={18}/> : <ArrowsOut size={18}/>} {fullscreen ? '退出全屏' : '全屏'}</button></div>
          <iframe key={embed.src} allow="fullscreen" allowFullScreen src={embed.src} title={`${embed.title} · AI 互动课件`} />
        </div> : <div className="courseware-lecture-empty"><p>暂无已配置的 AI 互动课件。</p></div>}
      </section>
    </div>
  );
}
