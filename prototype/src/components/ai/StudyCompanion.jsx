import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { studyAnswerSourceLabel } from './studyAnswerSource.js';
import { apiRequest } from '../../apiClient.js';
import { assemblyHelp, safeAssemblySnapshot } from '../../assemblyHelp.js';
import { useStudySnapshot } from './currentStudyContext.js';
import './studyMascot.css';
import './studyCompanion.css';
const clamp = (p) => ({x:Math.max(8,Math.min(Number.isFinite(p?.x)?p.x:innerWidth-112,Math.max(8,innerWidth-104))),y:Math.max(8,Math.min(Number.isFinite(p?.y)?p.y:innerHeight-144,Math.max(8,innerHeight-124)))});
export function StudyCompanion({userId,page,pageTitle,chapterId}) {
 const snapshot=useStudySnapshot(),storageKey=`chipquest:companion:${userId}`;
 const [position,setPosition]=useState(()=>{try{return clamp(JSON.parse(localStorage.getItem(storageKey)));}catch{return clamp();}});
 const [open,setOpen]=useState(false),[question,setQuestion]=useState(''),[answer,setAnswer]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[includeState,setIncludeState]=useState(false),[selected,setSelected]=useState(null);
 const [viewport,setViewport]=useState(()=>({height:window.visualViewport?.height??innerHeight,top:window.visualViewport?.offsetTop??0}));
 const trigger=useRef(null),field=useRef(null),sequence=useRef(0),drag=useRef(null),suppressClick=useRef(false),sentKey=useRef(null);
 const current=snapshot?.kind==='assembly'?safeAssemblySnapshot(snapshot.assembly):null,help=current?assemblyHelp(current):null;
 const action=help?.action??snapshot?.action;
 const publicContext=selected?.context??snapshot?.publicContext??{chapterId};
 const stateKey=JSON.stringify([page,publicContext,current,snapshot?.circuit,snapshot?.action]);
 const publicKey=JSON.stringify(snapshot?.publicContext);
 useEffect(()=>{setSelected(null);setAnswer(null);setError('');sequence.current++;setBusy(false);},[publicKey]);
 useEffect(()=>{setSelected(null);setQuestion('');setAnswer(null);setError('');setIncludeState(false);setOpen(false);sequence.current++;setBusy(false);},[page]);
 useEffect(()=>{setIncludeState(false);},[snapshot?.kind,snapshot?.expert]);
 useEffect(()=>()=>{sequence.current++;},[]);
 useEffect(()=>{if(open)field.current?.focus();},[open]);
 useEffect(()=>{
  const resize=()=>{setPosition(value=>clamp(value));setViewport({height:window.visualViewport?.height??innerHeight,top:window.visualViewport?.offsetTop??0});};
  window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
  return ()=>{window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);};
 },[]);
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(position));}catch{}},[position,storageKey]);
 useEffect(()=>{
  const request=event=>{setSelected(event.detail);setAnswer(null);setError('');sequence.current++;setBusy(false);setOpen(true);};
  const escape=event=>{if(event.key==='Escape'&&open){event.stopImmediatePropagation();close();}};
  window.addEventListener('study-companion-request',request);window.addEventListener('keydown',escape,true);
  return ()=>{window.removeEventListener('study-companion-request',request);window.removeEventListener('keydown',escape,true);};
 },[open]);
 function close(){setOpen(false);trigger.current?.focus();}
 function move(event){const start=drag.current;if(!start||event.pointerId!==start.id)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.hypot(dx,dy)>5){suppressClick.current=true;setPosition(clamp({x:start.position.x+dx,y:start.position.y+dy}));}}
 function stopDrag(event){if(drag.current?.id!==event.pointerId)return;drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
 async function ask(event){
  event.preventDefault();if(busy||!question.trim())return;
  const requestId=++sequence.current;setBusy(true);setAnswer(null);setError('');sentKey.current=stateKey;
  const context={questionId:publicContext.questionId,conceptId:publicContext.conceptId,chapterId:publicContext.chapterId};
  if(includeState&&!snapshot?.expert&&current)context.assembly=current;
  if(includeState&&!snapshot?.expert&&snapshot?.circuit)context.circuit=snapshot.circuit;
  try{const result=await apiRequest('/api/student/study-assistant',{method:'POST',timeoutMs:25000,body:JSON.stringify({question:question.trim(),context,consent:'deepseek-public-question',...(includeState?{stateConsent:'current-task-state'}:{})})});if(requestId===sequence.current)setAnswer(result);}
  catch(err){if(requestId===sequence.current)setError(`提问失败：${err.message}。可以重试。`);}
  finally{if(requestId===sequence.current)setBusy(false);}
 }
 return createPortal(<>
  <div className="study-companion" data-testid="study-companion" style={{left:position.x,top:position.y}}>
   <button ref={trigger} className="study-companion-trigger" type="button" aria-label="小芯随行学伴，点击答疑或拖动移动" title="点击提问；拖动或用方向键移动，Home键复位" aria-expanded={open}
    onPointerDown={event=>{if(event.button!==0)return;suppressClick.current=false;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,position};event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={move} onPointerUp={stopDrag} onPointerCancel={stopDrag}
    onKeyDown={event=>{const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];if(delta){event.preventDefault();setPosition(value=>clamp({x:value.x+delta[0],y:value.y+delta[1]}));}if(event.key==='Home'){event.preventDefault();setPosition(clamp());}}}
    onClick={event=>{if(suppressClick.current&&event.detail>0){suppressClick.current=false;return;}suppressClick.current=false;setOpen(value=>!value);}}>
    <img src="/ai/study-mascot.webp" alt="小芯，芯片机器人" width="72" height="72" draggable="false"/><strong>小芯学伴</strong><small>{help&&!help.ready?'帮我排查':'点击答疑 · 可拖动'}</small>
   </button>
  </div>
  {open&&<section className="study-mascot-dialog study-companion-dialog" role="dialog" aria-labelledby="companion-title" style={{top:viewport.top+Math.max(8,viewport.height-650),maxHeight:Math.max(120,viewport.height-Math.max(8,viewport.height-650)-16)}}>
   <header><img src="/ai/study-mascot.webp" alt="" width="48" height="48"/><div><h3 id="companion-title">小芯随行答疑</h3><p>当前：{snapshot?.title??pageTitle} · 状态实时更新</p></div><button type="button" className="icon-button" aria-label="关闭小芯助教" onClick={close}>×</button></header>
   <div className="study-mascot-reply">
    <section className="companion-live" aria-label="当前现场状态"><strong>现场提示 · 本机规则检查</strong><p role="status">{snapshot?.expert?'当前为独立排障练习，请先自行判断或在工作台点击“查看提示”。':help?.summary??snapshot?.summary??selected?.suggestion??'告诉我此刻遇到的问题；课程问题会结合当前公开学习内容讲解。'}</p>
     {action&&!snapshot?.expert&&<section className="companion-action" aria-label="最近操作解释"><strong>最近操作 · {action.ok?'已完成':'未完成'}</strong><p>{action.description}</p><p><b>原因：</b>{action.reason}</p><p><b>{action.ok?'下一步：':'怎么改：'}</b>{action.fix}</p></section>}
     {!snapshot?.expert&&help&&<><p className="companion-next">下一步：{help.steps[0]}</p><details><summary>查看装配检查与接线指引</summary><ol>{help.steps.map(step=><li key={step}>{step}</li>)}</ol></details></>}
     {snapshot?.issues?.length>0&&!snapshot?.expert&&<ul>{snapshot.issues.slice(0,3).map((item,index)=><li key={index}>{item}</li>)}</ul>}
     {snapshot?.testRows?.length>0&&<p>{snapshot.testRows.slice(0,6).map(row=>`${row.label}：${row.actual}`).join('；')}</p>}
    </section>
    {busy&&<p role="status">小芯正在整理讲解…</p>}{error&&<p role="alert" className="study-mascot-error">{error}</p>}
    {answer&&<section aria-live="polite"><span className="study-mascot-source">{studyAnswerSourceLabel(answer)}</span>{sentKey.current!==stateKey&&<p className="companion-stale">页面状态已变化，下面是上次提问时的回答；请参考上方实时提示或重新提问。</p>}<p>{answer.explanation}</p><ol>{answer.steps?.map((step,index)=><li key={index}>{step}</li>)}</ol>{answer.check&&<div className="study-mascot-check"><strong>试着想一想</strong><p>{answer.check}</p></div>}</section>}
   </div>
   <form onSubmit={ask}><label htmlFor="companion-question">你的课程问题</label><textarea ref={field} id="companion-question" rows={2} maxLength={1600} placeholder={help?'例如：为什么部件装齐了还不能开机？':'我不理解……'} value={question} onChange={event=>setQuestion(event.target.value)} disabled={busy}/>
    {(current||snapshot?.circuit)&&!snapshot?.expert&&<label className="companion-state-consent"><input type="checkbox" checked={includeState} onChange={event=>setIncludeState(event.target.checked)} disabled={busy}/>本次提问附带当前{current?'装配与接线快照':'电路输入与检查计数'}（含最近操作）</label>}
    {includeState&&!snapshot?.expert&&(current||snapshot?.circuit)&&<details className="companion-payload"><summary>查看本次将附带的状态</summary><pre>{JSON.stringify(current??snapshot?.circuit,null,2)}</pre></details>}
    <button className="primary-button" type="submit" disabled={busy||!question.trim()}>{busy?'正在思考…':'询问助教'}</button>
   </form>
  </section>}
 </>,document.body);
}
