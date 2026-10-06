import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowsOut, MonitorPlay } from "@phosphor-icons/react";
import { COURSEWARE } from "../courseware.js";
import { ExperimentThumbnail } from "./ExperimentThumbnail.jsx";
import { useCurrentStudyContext } from './ai/currentStudyContext.js';
import "./coursewareView.css";

const lectureChapters = COURSEWARE.chapters.filter((chapter) => chapter.embeds?.length);

export function CoursewareView({ initialChapterId } = {}) {
  // Task-chain stages can enter the assigned chapter directly; the hub itself opens with no player.
  const [selected, setSelected] = useState(() => initialChapterId ? { chapterId: initialChapterId, index: 0 } : null);

  useEffect(() => {
    if (initialChapterId) setSelected({ chapterId: initialChapterId, index: 0 });
  }, [initialChapterId]);

  const chapter = lectureChapters.find((item) => item.id === selected?.chapterId);
  const lecture = chapter?.embeds?.[selected?.index];
  useCurrentStudyContext({kind:'courseware',title:lecture?.title??'AI讲演',publicContext:{chapterId:chapter?.id},summary:lecture?`正在学习：${lecture.title}。可围绕本章概念向小芯提问。`:'选择章节进入AI讲演，小芯会跟随当前章节。'});
  const playerRef = useRef(null);

  useLayoutEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;
    const page = player.closest(".ai-lecture-page");
    const head = player.querySelector(".ai-lecture-player-head");
    const back = page.querySelector(".ai-lecture-back");
    function fitPlayer() {
      if (document.fullscreenElement === player) return;
      const bounds = page.getBoundingClientRect();
      const scale = bounds.width / page.clientWidth || 1;
      const available = window.innerHeight - (bounds.top + window.scrollY)
        - back.getBoundingClientRect().height - head.getBoundingClientRect().height - 38 * scale;
      const width = Math.min(page.clientWidth, 1200, Math.max(1, available / scale) * 16 / 9);
      player.style.setProperty("--ai-lecture-width", `${Math.floor(width)}px`);
    }
    const observer = new ResizeObserver(fitPlayer);
    [page, head, page.closest(".dashboard"), document.querySelector(".topbar")]
      .filter(Boolean).forEach(element => observer.observe(element));
    window.addEventListener("resize", fitPlayer);
    document.addEventListener("fullscreenchange", fitPlayer);
    fitPlayer();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fitPlayer);
      document.removeEventListener("fullscreenchange", fitPlayer);
    };
  }, [lecture?.src]);

  function openLecture(chapterId, index) {
    setSelected({ chapterId, index });
    window.scrollTo(0, 0);
  }

  function returnToHub() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    setSelected(null);
    window.scrollTo(0, 0);
  }

  return <div className="courseware-view ai-lectures-view">
    {lecture ? <section className="ai-lecture-page" aria-label={lecture.title + "播放页面"}>
      <button type="button" className="ai-lecture-back" onClick={returnToHub}><ArrowLeft size={18} /> 返回 AI讲演</button>
      <div className="ai-lecture-player" ref={playerRef}>
        <div className="ai-lecture-player-head">
          <div><small>{chapter.title} · AI讲演</small><h1>{lecture.title}</h1></div>
          <button type="button" className="ai-lecture-fullscreen" onClick={(event) => {
            const player = event.currentTarget.closest(".ai-lecture-player");
            if (document.fullscreenElement) document.exitFullscreen?.();
            else player?.requestFullscreen?.();
          }}><ArrowsOut size={16} /> 全屏</button>
        </div>
        <iframe src={lecture.src} title={lecture.title} allowFullScreen />
      </div>
    </section> : <section className="ai-lecture-hub" aria-labelledby="ai-lectures-heading">
      <header className="interactive-demos-heading">
        <span className="interactive-demos-kicker">计算机组成原理 · 课程讲演</span>
        <h1 id="ai-lectures-heading">AI讲演</h1>
        <p>选择章节与讲演主题，进入播放页面学习。</p>
      </header>
      <div className="ai-lecture-grid">
        {lectureChapters.map((item) => <article key={item.id} className="ai-lecture-card">
          <h2>{item.title}</h2>
          <ExperimentThumbnail demo={item.demos?.[0]} />
          <div className="ai-lecture-card-links">
            {item.embeds.map((embed, index) => <button type="button" key={embed.src} onClick={() => openLecture(item.id, index)}>
              <MonitorPlay size={16} /><span>{embed.title}</span><small>开始讲演 →</small>
            </button>)}
          </div>
          <p>{item.embeds.length} 个 AI讲演</p>
        </article>)}
      </div>
    </section>}
  </div>;
}
