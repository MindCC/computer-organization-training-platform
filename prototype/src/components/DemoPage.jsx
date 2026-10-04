import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Notebook } from "@phosphor-icons/react";
import { hostedDemoOf } from "../shared/demoNavigation.js";
import { COURSE_CHAPTERS } from "../courseChapters.js";
import { parameterExperimentForChapter } from "../parameterExperiments.js";
import { ParameterPlayground } from "./ParameterPlayground.jsx";
import "./demoPage.css";

export function DemoPage({ demoId, changeView, openStudyTarget, role }) {
  const demo = hostedDemoOf(demoId);
  const [loaded,setLoaded] = useState(false);
  const [activeMode, setActiveMode] = useState("principles");
  useEffect(() => { setLoaded(false); setActiveMode("principles"); }, [demoId]);
  // 2026-10-04：取消独立「互动演示」入口后，演示页一律返回课程课件页
  const parentView = "courseware";
  const backLabel = "返回课程课件";
  if (!demo) return <section className="section-panel"><h1>演示页面不存在</h1><button type="button" className="primary-button" onClick={() => changeView(parentView)}>{backLabel}</button></section>;
  const chapter = COURSE_CHAPTERS.find(item => item.id === demo.chapterId);
  const parameterExperiment = parameterExperimentForChapter(demo.chapterId);
  return <section className="hosted-demo" aria-label="课程互动演示">
    <header className="hosted-demo-context">
      <button type="button" className="ghost-button" onClick={() => changeView(parentView)}><ArrowLeft size={17} /> {backLabel}</button>
      <div className="hosted-demo-title"><span>{chapter ? `第${chapter.number}章 · 课堂互动演示` : "课程课件"}</span><h1>{demo.title}</h1>{parameterExperiment && <nav className="hosted-demo-modes" role="tablist" aria-label="本章演示内容">
        <button type="button" role="tab" id="demo-principles-tab" aria-controls="demo-principles-panel" aria-selected={activeMode === "principles"} onClick={() => setActiveMode("principles")}>原理演示</button>
        <button type="button" role="tab" id="demo-parameters-tab" aria-controls="demo-parameters-panel" aria-selected={activeMode === "parameters"} onClick={() => setActiveMode("parameters")}>性能参数实验</button>
      </nav>}</div>
      <div className="hosted-demo-actions"><button type="button" className="ghost-button" onClick={() => changeView("home")}><BookOpen size={17} /> 课程首页</button>{role === "student" && demo.chapterId ? <button type="button" className="primary-button" onClick={() => openStudyTarget({source:"practice",chapterId:demo.chapterId})}><Notebook size={17} /> 本章练习</button> : null}</div>
    </header>
    <div id="demo-principles-panel" className="hosted-demo-principles" hidden={activeMode !== "principles"} role={parameterExperiment ? "tabpanel" : undefined} aria-labelledby={parameterExperiment ? "demo-principles-tab" : undefined}>
    {!loaded ? <p className="hosted-demo-loading" role="status">正在加载互动演示…</p> : null}
    <iframe key={demo.id} className="hosted-demo-frame" title={demo.title} src={`${demo.path}?embedded=1`} onLoad={() => setLoaded(true)} allow="fullscreen" />
    </div>
    {parameterExperiment && <div id="demo-parameters-panel" className="hosted-demo-parameters" hidden={activeMode !== "parameters"} role="tabpanel" aria-labelledby="demo-parameters-tab">
      <div className="hosted-demo-parameter-content">
        <header className="hosted-demo-parameter-heading"><span>第{chapter.number}章 · {demo.title}</span><h2>{parameterExperiment.title}</h2><p>{parameterExperiment.question}</p></header>
        <ParameterPlayground key={demo.id} chapterId={demo.chapterId} chapterOnly />
      </div>
    </div>}
  </section>;
}
