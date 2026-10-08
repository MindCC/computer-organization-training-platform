import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowsOut, CaretRight, MonitorPlay } from "@phosphor-icons/react";
import { COURSEWARE } from "../courseware.js";
import { useCurrentStudyContext } from './ai/currentStudyContext.js';
import { LectureQuestionPanel } from './ai/LectureQuestionPanel.jsx';
import "./coursewareView.css";
import "./aiLectureOutline.css";

const lectureChapters = COURSEWARE.chapters.filter((chapter) => chapter.embeds?.length);

export function CoursewareView({ initialChapterId } = {}) {
  // Task-chain stages can enter the assigned chapter directly; the hub itself opens with no player.
  const [selected, setSelected] = useState(() => initialChapterId ? { chapterId: initialChapterId, index: 0 } : null);
  // 章节大纲：默认全部收起，点章节行展开（用户决定 2026-10-06，A 方案）
  const [openChapter, setOpenChapter] = useState(null);
  const [qaOpen, setQaOpen] = useState(() => window.innerWidth > 1000);

  useEffect(() => {
    if (initialChapterId) setSelected({ chapterId: initialChapterId, index: 0 });
  }, [initialChapterId]);

  const chapter = lectureChapters.find((item) => item.id === selected?.chapterId);
  const lecture = chapter?.embeds?.[selected?.index];
  useCurrentStudyContext({kind:'courseware',inlineAssistant:Boolean(lecture&&qaOpen),title:lecture?.title??'AI讲演',publicContext:{chapterId:chapter?.id,lectureIndex:lecture?selected.index:undefined},summary:lecture?`正在学习：${lecture.title}。可围绕本章概念向小芯提问。`:'选择章节进入AI讲演，小芯会跟随当前章节。'});
  const playerRef = useRef(null);

  useLayoutEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;
    const page = player.closest(".ai-lecture-page");
    const head = player.querySelector(".ai-lecture-player-head");
    const back = page.querySelector(".ai-lecture-back");
    function fitQuestions() {
      player.style.setProperty('--lecture-qa-height', `${Math.max(380, Math.floor(window.innerHeight - player.getBoundingClientRect().top - head.getBoundingClientRect().height - 16))}px`);
    }
    function fitPlayer() {
      if (document.fullscreenElement === player) return;
      const bounds = page.getBoundingClientRect();
      // 2026-10-06 用户反馈：要截图那种长宽 —— 满宽 + 撑到屏幕底（扁盒子），
      // 但小屏上不能矮成一条（1366×768 实测只剩 422px），所以给 620px 下限，宁可页面滚动一点。
      const available = window.innerHeight - (bounds.top + window.scrollY)
        - back.getBoundingClientRect().height - head.getBoundingClientRect().height - 30;
      player.style.setProperty("--ai-lecture-width", `${Math.floor(page.clientWidth)}px`);
      player.style.setProperty("--ai-lecture-height", `${Math.max(620, Math.floor(available))}px`);
      fitQuestions();
    }
    const observer = new ResizeObserver(fitPlayer);
    [page, head, page.closest(".dashboard"), document.querySelector(".topbar")]
      .filter(Boolean).forEach(element => observer.observe(element));
    window.addEventListener("resize", fitPlayer);
    window.addEventListener('scroll', fitQuestions, { passive: true });
    document.addEventListener("fullscreenchange", fitPlayer);
    fitPlayer();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fitPlayer);
      window.removeEventListener('scroll', fitQuestions);
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
          <div className="ai-lecture-player-actions"><button type="button" className="ai-lecture-fullscreen" aria-expanded={qaOpen} aria-controls="lecture-question-panel" onClick={() => setQaOpen(open => !open)}>{qaOpen ? '收起答疑' : '本课答疑'}</button>
          <button type="button" className="ai-lecture-fullscreen" onClick={(event) => {
            const player = event.currentTarget.closest(".ai-lecture-player");
            if (document.fullscreenElement) document.exitFullscreen?.();
            else player?.requestFullscreen?.();
          }}><ArrowsOut size={16} /> 全屏</button></div>
        </div>
        <div className={`ai-lecture-body${qaOpen ? ' has-qa' : ''}`}>
        <iframe src={lecture.src} title={lecture.title} allowFullScreen />
        <LectureQuestionPanel key={`${chapter.id}:${selected.index}`} chapter={chapter} lecture={lecture} lectureIndex={selected.index} hidden={!qaOpen} />
        </div>
      </div>
    </section> : <section className="ai-lecture-hub" aria-labelledby="ai-lectures-heading">
      <header className="interactive-demos-heading">
        <span className="interactive-demos-kicker">计算机组成原理 · 课程讲演</span>
        <h1 id="ai-lectures-heading">AI讲演</h1>
        <p>选择章节与讲演主题，进入播放页面学习。</p>
      </header>
      <div className="ai-lecture-outline">
        {COURSEWARE.chapters.map((item) => {
          const embeds = item.embeds ?? [];
          const open = openChapter === item.id;
          return <section key={item.id} className={"ai-lecture-row" + (open ? " is-open" : "")}>
            <button type="button" className="ai-lecture-row-head" aria-expanded={open}
              onClick={() => setOpenChapter(open ? null : item.id)}>
              <CaretRight size={16} className="ai-lecture-row-caret" />
              <strong>{item.title}</strong>
              <span className="ai-lecture-row-meta">
                {item.slides ? item.slides + " 页PPT" : null}
                {item.sections?.length ? " · " + item.sections.length + " 小节" : null}
                {embeds.length ? " · 含 " + (embeds.length > 1 ? embeds.length + " 个 " : "") + "AI 互动讲演" : null}
              </span>
            </button>
            {open ? <div className="ai-lecture-row-body">
              {item.sections?.length ? <ul className="ai-lecture-sections">
                {item.sections.map((section) => <li key={section}>{section}</li>)}
              </ul> : null}
              {embeds.length ? <div className="ai-lecture-card-links">
                {embeds.map((embed, index) => <button type="button" key={embed.src} onClick={() => openLecture(item.id, index)}>
                  <MonitorPlay size={16} /><span>{embed.title}</span><small>开始讲演 →</small>
                </button>)}
              </div> : <p className="ai-lecture-row-empty">本章暂无 AI 互动讲演。</p>}
            </div> : null}
          </section>;
        })}
      </div>
    </section>}
  </div>;
}
