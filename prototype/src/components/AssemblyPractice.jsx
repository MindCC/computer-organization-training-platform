import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HardwareAssemblyWorkbench } from './HardwareAssemblyWorkbench.jsx';
import { PRACTICE_FAULTS, createPracticeSeed, recordPracticeEvent, practiceReview, practiceErrorAdvice } from '../assemblyPractice.js';
import { gradeHardwareBuild } from '../hardwareGame.js';
import { saveAssemblyDraft, loadAssemblyDraft } from '../assemblyDraft.js';
import { saveStructure, readStructure } from '../completeAssembly.js';
import { practiceStorageKey, readPracticeStore, savePracticeProgress, resumePractice } from '../assemblyPracticeStorage.js';
import './assemblyPractice.css';

export function AssemblyPractice({initialParts,caseId,userId}) {
  const persistentStorage=useMemo(()=>{try{return window.localStorage;}catch{return null;}},[]);
  const storageKey=practiceStorageKey(userId,caseId);
  const [stored]=useState(()=>readPracticeStore(persistentStorage,storageKey));
  const [restored,setRestored]=useState(()=>resumePractice(stored.active));
  const [mode,setMode]=useState(restored?.mode??'guided'),[fault,setFault]=useState(restored?.fault??'power'),[run,setRun]=useState(0);
  const [history,setHistory]=useState(stored.history);
  const updateHistory=useCallback(next=>setHistory(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next),[]);
  function restart(){setRestored(null);setRun(n=>n+1);}
  return <section className="assembly-practice" aria-label="装机教学练习">
    <header className="practice-setup"><div><strong>装机教学练习</strong><p>按当前学生和订单保存到此浏览器。切换模式、工单或重新练习会开始新一轮，历史复盘保留。</p></div>
      <label>练习模式<select aria-label="练习模式" value={mode} onChange={e=>{setMode(e.target.value);restart();}}><option value="guided">引导练习</option><option value="independent">独立练习</option><option value="fault">故障练习</option></select></label>
      {mode==='fault'&&<label>故障工单<select aria-label="故障工单" value={fault} onChange={e=>{setFault(e.target.value);restart();}}>{PRACTICE_FAULTS.map(f=><option key={f.id} value={f.id}>{f.title}</option>)}</select></label>}
      <button type="button" onClick={restart}>重新练习</button>
    </header>
    <PracticeRun key={mode+fault+run} mode={mode} fault={fault} initialParts={initialParts} caseId={caseId} restored={restored} persistentStorage={persistentStorage} storageKey={storageKey} onHistory={updateHistory}/>
    <section className="practice-history practice-review" aria-label="历史练习复盘"><h2>历史练习复盘 <small>最近 {history.length} / 20 次</small></h2><p>仅保存在此浏览器，按学生和订单区分；历史结果不会作为本轮开机成功状态。</p>
      {history.length?history.map(item=><details key={item.id} data-history-id={item.id}><summary>{new Date(item.completedAt).toLocaleString('zh-CN')} · {item.mode==='guided'?'引导练习':item.mode==='independent'?'独立练习':PRACTICE_FAULTS.find(f=>f.id===item.fault)?.title} · {item.score} 分</summary><p>错误 {item.errorCount} 次 · 提示 {item.hints} 次 · 用时 {item.seconds} 秒</p>{item.errors.length?<ol>{item.errors.map((message,index)=><li key={index}>{message}<p>{practiceErrorAdvice(message)}</p></li>)}</ol>:<p>本次没有错误操作。</p>}</details>):<p>完成一轮练习后，复盘会保存在这里。</p>}
    </section>
  </section>;
}

function PracticeRun({mode,fault,initialParts,caseId,restored,persistentStorage,storageKey,onHistory}) {
  const [initial]=useState(()=>restored??{id:globalThis.crypto?.randomUUID?.()??`run-${Date.now()}-${Math.random().toString(36).slice(2)}`,parts:{...initialParts},...createPracticeSeed(initialParts,mode,fault),category:'cpu',session:{startedAt:Date.now(),events:[]}});
  const [parts,setParts]=useState(initial.parts),[category,setCategory]=useState(initial.category);
  const [session,setSession]=useState(initial.session),[saved,setSaved]=useState(null);
  const persistRef=useRef(null);
  const storage=useMemo(()=>{
    const map=new Map(),memory={getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,value);persistRef.current?.();}};
    saveAssemblyDraft(memory,'practice',initial.installed,initial.parts);saveStructure(memory,'practice',initial.structure);
    return memory;
  },[]);
  const persist=useCallback(()=>{
    const installed=loadAssemblyDraft(storage,'practice',parts),structure=readStructure(storage,'practice',installed,parts);
    const result=savePracticeProgress(persistentStorage,storageKey,{id:initial.id,mode,fault,parts,installed,structure,category,session});
    setSaved(result.ok);if(result.ok&&session.completedAt)onHistory(result.history);
  },[storage,persistentStorage,storageKey,initial.id,mode,fault,parts,category,session,onHistory]);
  persistRef.current=persist;
  useEffect(()=>{persist();},[persist]);
  useEffect(()=>{
    const save=()=>persistRef.current?.();const timer=setInterval(save,15000);
    window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',save);
    return()=>{save();clearInterval(timer);window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',save);};
  },[]);
  const report=practiceReview(session),faultCase=PRACTICE_FAULTS.find(f=>f.id===fault);
  return <>
    <p className="practice-save-status" role="status">{saved===false?'当前浏览器无法保存练习，进度仅在本次页面中保留。':saved?'练习已保存到本机。': '正在保存练习…'}{initial.restored&&' 已恢复未完成练习，须重新开机自检。'}</p>
    <div className="practice-brief"><strong>{mode==='guided'?'跟随任务提示完成一台主机':mode==='independent'?'独立完成装配并通过自检':faultCase.title}</strong><p>{mode==='fault'?faultCase.symptom:mode==='guided'?'每一步说明操作位置和原因。可以自由观察与尝试。':'匹配预览已关闭。请自行判断插槽、接口和安装顺序，需要时可主动求助。'}</p><small>本次练习分：完成后 100 分起，错误操作每次扣 5 分，主动提示每次扣 3 分。仅供练习复盘。</small></div>
    <HardwareAssemblyWorkbench parts={parts} onPartChange={setParts} score={gradeHardwareBuild(caseId,parts)} activeCategory={category} onCategoryChange={setCategory} draftStorage={storage} draftKey="practice" practiceMode={mode} practicePersistence={saved?'练习已保存到本机 · 恢复后重新自检':'当前进度仅在本次页面中保留'} onPracticeEvent={event=>setSession(current=>recordPracticeEvent(current,event))}/>
    <section className="practice-review" aria-label="练习复盘" aria-live="polite"><h2>{report.complete?'练习完成 · 操作复盘':'本次练习记录'}</h2>
      <div className="practice-metrics"><span>练习分 <strong>{report.score??'待完成'}</strong></span><span>错误操作 <strong>{report.errorCount}</strong></span><span>主动提示 <strong>{report.hints}</strong></span>{report.complete&&<span>完成用时 <strong>{report.seconds} 秒</strong></span>}</div>
      <p>{report.complete?'已通过装配和开机自检。复盘错误后，可以重新练习或挑战另一种模式。':'通过真实开机自检后生成完成结果，未完成时不计成功。'}</p>
      {report.errors.length>0?<ol>{report.errors.map((e,i)=><li key={i}>{e.message}{report.complete&&<p>{practiceErrorAdvice(e.message)}</p>}</li>)}</ol>:<p>目前没有错误操作记录。{report.complete&&(mode==='guided'?'下一步可尝试关闭提示的独立练习。':'可以重新练习，或选择另一张故障工单。')}</p>}
    </section>
  </>;
}
