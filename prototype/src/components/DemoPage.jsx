import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Notebook } from "@phosphor-icons/react";
import { hostedDemoOf } from "../shared/demoNavigation.js";
import { COURSE_CHAPTERS } from "../courseChapters.js";
import "./demoPage.css";

export function DemoPage({ demoId, changeView, openStudyTarget, role }) {
  const demo = hostedDemoOf(demoId);
  const [loaded,setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [demoId]);
  const parentView = demoId === "courseware" ? "courseware" : "demos";
  const backLabel = parentView === "demos" ? "返回互动演示" : "返回课程课件";
  if (!demo) return <section className="section-panel"><h1>演示页面不存在</h1><button type="button" className="primary-button" onClick={() => changeView(parentView)}>{backLabel}</button></section>;
  const chapter = COURSE_CHAPTERS.find(item => item.id === demo.chapterId);
  return <section className="hosted-demo" aria-label="课程互动演示">
    <header className="hosted-demo-context">
      <button type="button" className="ghost-button" onClick={() => changeView(parentView)}><ArrowLeft size={17} /> {backLabel}</button>
      <div className="hosted-demo-title"><span>{chapter ? `第${chapter.number}章 · 课堂互动演示` : "课程课件"}</span><h1>{demo.title}</h1></div>
      <div className="hosted-demo-actions"><button type="button" className="ghost-button" onClick={() => changeView("home")}><BookOpen size={17} /> 课程首页</button>{role === "student" && demo.chapterId ? <button type="button" className="primary-button" onClick={() => openStudyTarget({source:"practice",chapterId:demo.chapterId})}><Notebook size={17} /> 本章练习</button> : null}</div>
    </header>
    {!loaded ? <p className="hosted-demo-loading" role="status">正在加载互动演示…</p> : null}
    <iframe key={demo.id} className="hosted-demo-frame" title={demo.title} src={`${demo.path}?embedded=1`} onLoad={() => setLoaded(true)} allow="fullscreen" />
  </section>;
}
