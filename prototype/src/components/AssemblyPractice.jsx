import { useMemo, useState } from 'react';
import { HardwareAssemblyWorkbench } from './HardwareAssemblyWorkbench.jsx';
import { PRACTICE_FAULTS, createPracticeSeed, recordPracticeEvent, practiceReview, practiceErrorAdvice } from '../assemblyPractice.js';
import { gradeHardwareBuild } from '../hardwareGame.js';
import { saveAssemblyDraft } from '../assemblyDraft.js';
import { saveStructure } from '../completeAssembly.js';
import './assemblyPractice.css';

export function AssemblyPractice({initialParts,caseId}) {
  const [mode,setMode]=useState('guided'),[fault,setFault]=useState('power'),[run,setRun]=useState(0);
  return <section className="assembly-practice" aria-label="装机教学练习">
    <header className="practice-setup"><div><strong>装机教学练习</strong><p>练习进度仅在当前页面保留。切换模式、工单或重新练习会开始新一轮。</p></div>
      <label>练习模式<select aria-label="练习模式" value={mode} onChange={e=>{setMode(e.target.value);setRun(n=>n+1);}}><option value="guided">引导练习</option><option value="independent">独立练习</option><option value="fault">故障练习</option></select></label>
      {mode==='fault'&&<label>故障工单<select aria-label="故障工单" value={fault} onChange={e=>{setFault(e.target.value);setRun(n=>n+1);}}>{PRACTICE_FAULTS.map(f=><option key={f.id} value={f.id}>{f.title}</option>)}</select></label>}
      <button type="button" onClick={()=>setRun(n=>n+1)}>重新练习</button>
    </header>
    <PracticeRun key={mode+fault+run} mode={mode} fault={fault} initialParts={initialParts} caseId={caseId}/>
  </section>;
}

function PracticeRun({mode,fault,initialParts,caseId}) {
  const [parts,setParts]=useState(()=>({...initialParts})),[category,setCategory]=useState('cpu');
  const [session,setSession]=useState(()=>({startedAt:Date.now(),events:[]}));
  const storage=useMemo(()=>{
    const map=new Map(),memory={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};
    const seed=createPracticeSeed(initialParts,mode,fault);
    saveAssemblyDraft(memory,'practice',seed.installed,initialParts);saveStructure(memory,'practice',seed.structure);
    return memory;
  },[]);
  const report=practiceReview(session),faultCase=PRACTICE_FAULTS.find(f=>f.id===fault);
  return <>
    <div className="practice-brief"><strong>{mode==='guided'?'跟随任务提示完成一台主机':mode==='independent'?'独立完成装配并通过自检':faultCase.title}</strong><p>{mode==='fault'?faultCase.symptom:mode==='guided'?'每一步说明操作位置和原因。可以自由观察与尝试。':'匹配预览已关闭。请自行判断插槽、接口和安装顺序，需要时可主动求助。'}</p><small>本次练习分：完成后 100 分起，错误操作每次扣 5 分，主动提示每次扣 3 分。仅供练习复盘。</small></div>
    <HardwareAssemblyWorkbench parts={parts} onPartChange={setParts} score={gradeHardwareBuild(caseId,parts)} activeCategory={category} onCategoryChange={setCategory} draftStorage={storage} draftKey="practice" practiceMode={mode} onPracticeEvent={event=>setSession(current=>recordPracticeEvent(current,event))}/>
    <section className="practice-review" aria-label="练习复盘" aria-live="polite"><h2>{report.complete?'练习完成 · 操作复盘':'本次练习记录'}</h2>
      <div className="practice-metrics"><span>练习分 <strong>{report.score??'待完成'}</strong></span><span>错误操作 <strong>{report.errorCount}</strong></span><span>主动提示 <strong>{report.hints}</strong></span>{report.complete&&<span>完成用时 <strong>{report.seconds} 秒</strong></span>}</div>
      <p>{report.complete?'已通过装配和开机自检。复盘错误后，可以重新练习或挑战另一种模式。':'通过真实开机自检后生成完成结果，未完成时不计成功。'}</p>
      {report.errors.length>0?<ol>{report.errors.map((e,i)=><li key={i}>{e.message}{report.complete&&<p>{practiceErrorAdvice(e.message)}</p>}</li>)}</ol>:<p>目前没有错误操作记录。{report.complete&&(mode==='guided'?'下一步可尝试关闭提示的独立练习。':'可以重新练习，或选择另一张故障工单。')}</p>}
    </section>
  </>;
}
