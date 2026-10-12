import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { studyAnswerSourceLabel } from './studyAnswerSource.js';
import { apiRequest } from '../../apiClient.js';
import { assemblyHelp, safeAssemblySnapshot } from '../../assemblyHelp.js';
import { useStudySnapshot } from './currentStudyContext.js';
import { publishTaskAssistantStatus } from './taskAssistantStatus.js';
import './studyMascot.css';
import './studyCompanion.css';
import { useStudyRecommendations } from '../learning/useStudyRecommendations.js';
import { StudySpark } from '../learning/StudySpark.jsx';
import { useStudyEngagement } from '../learning/useStudyEngagement.js';
import { StudyEngagement } from '../learning/StudyEngagement.jsx';
const clamp = (p) => ({x:Math.max(8,Math.min(Number.isFinite(p?.x)?p.x:innerWidth-112,Math.max(8,innerWidth-104))),y:Math.max(8,Math.min(Number.isFinite(p?.y)?p.y:innerHeight-144,Math.max(8,innerHeight-124)))});
export function StudyCompanion({userId,page,pageTitle,chapterId,readOnly=false,embedded=false,suggestions=[],sidebar}) {
 const [chat,setChat]=useState([]),[toolsOpen,setToolsOpen]=useState(()=>innerWidth>=900);
 const thread=useRef(null);
 const engagement=useStudyEngagement(userId,!readOnly);
 const [memoryIds,setMemoryIds]=useState([]);
 const {data:spark,error:sparkError,refresh:refreshSpark}=useStudyRecommendations(userId,true);
 const liveSnapshot=useStudySnapshot(),storageKey=`chipquest:companion:${userId}`;
 const snapshot=embedded?{title:pageTitle,publicContext:{chapterId},summary:'结合本章公开课程内容讲解；请说明你已经尝试的做法和遇到的疑问。'}:liveSnapshot;
 const [position,setPosition]=useState(()=>{try{return clamp(JSON.parse(localStorage.getItem(storageKey)));}catch{return clamp();}});
 const [open,setOpen]=useState(embedded),[question,setQuestion]=useState(''),[answer,setAnswer]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[includeState,setIncludeState]=useState(false),[selected,setSelected]=useState(null),[history,setHistory]=useState([]),[historyMore,setHistoryMore]=useState(false);
 const [viewport,setViewport]=useState(()=>({height:window.visualViewport?.height??innerHeight,top:window.visualViewport?.offsetTop??0}));
 const trigger=useRef(null),field=useRef(null),sequence=useRef(0),drag=useRef(null),suppressClick=useRef(false),sentKey=useRef(null);
 const current=snapshot?.kind==='assembly'?safeAssemblySnapshot(snapshot.assembly):null,help=current?assemblyHelp(current):null;
 const action=help?.action??snapshot?.action;
 const publicContext=selected?.context??snapshot?.publicContext??{chapterId};
 const classroom=selected?.classroom??snapshot?.classroom;
 const stateKey=JSON.stringify([page,publicContext,current,snapshot?.circuit,snapshot?.action]);
 const publicKey=JSON.stringify([snapshot?.publicContext,snapshot?.classroom]);
 useEffect(()=>{setSelected(null);setAnswer(null);setChat([]);setError('');setMemoryIds([]);sequence.current++;setBusy(false);},[publicKey]);
 useEffect(()=>{setSelected(null);setQuestion('');setAnswer(null);setError('');setIncludeState(false);setMemoryIds([]);setOpen(embedded);sequence.current++;setBusy(false);},[page,embedded]);
 useEffect(()=>{setIncludeState(false);},[snapshot?.kind,snapshot?.expert]);
 useEffect(()=>()=>{sequence.current++;},[]);
 useEffect(()=>{if(snapshot?.inlineAssistant)setOpen(false);},[snapshot?.inlineAssistant]);
 useEffect(()=>{if(open&&!embedded)field.current?.focus();},[open,embedded]);
 useEffect(()=>{if(embedded&&thread.current)thread.current.scrollTop=chat.length===0||String(chat[0]?.id).startsWith('history-')?0:thread.current.scrollHeight;},[chat,embedded]);
 useEffect(()=>{if(!embedded)return;const media=matchMedia('(min-width:900px)');const resize=()=>setToolsOpen(media.matches);media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);},[embedded]);
 useEffect(()=>{if(!open)return;let cancelled=false;apiRequest('/api/student/study-assistant/history').then(data=>{if(!cancelled){setHistory(data.conversations??[]);setHistoryMore(Boolean(data.hasMore));}}).catch(()=>{});return()=>{cancelled=true;};},[open]);
 useEffect(()=>{
  const resize=()=>{setPosition(value=>clamp(value));setViewport({height:window.visualViewport?.height??innerHeight,top:window.visualViewport?.offsetTop??0});};
  window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
  return ()=>{window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);};
 },[]);
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(position));}catch{}},[position,storageKey]);
 useEffect(()=>{
  const request=event=>{setSelected(event.detail);setAnswer(null);setError('');sequence.current++;setBusy(false);setOpen(true);};
  const escape=event=>{if(event.key==='Escape'&&open&&!embedded){event.stopImmediatePropagation();close();}};
  window.addEventListener('study-companion-request',request);window.addEventListener('keydown',escape,true);
  return ()=>{window.removeEventListener('study-companion-request',request);window.removeEventListener('keydown',escape,true);};
 },[open,embedded]);
 function close(){setOpen(false);trigger.current?.focus();}
 function move(event){const start=drag.current;if(!start||event.pointerId!==start.id)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.hypot(dx,dy)>5){suppressClick.current=true;setPosition(clamp({x:start.position.x+dx,y:start.position.y+dy}));}}
 function stopDrag(event){if(drag.current?.id!==event.pointerId)return;drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
 async function ask(event){
  event.preventDefault();if(busy||!question.trim())return;
  const requestId=++sequence.current;setBusy(true);setAnswer(null);setError('');sentKey.current=stateKey;
  const submittedQuestion=question.trim();
  if(embedded)setChat(rows=>[...rows,{id:requestId,question:submittedQuestion,pending:true}]);
  publishTaskAssistantStatus(classroom,userId,'pending');
  const context={questionId:publicContext.questionId,conceptId:publicContext.conceptId,chapterId:publicContext.chapterId,lectureIndex:publicContext.lectureIndex};
  if(includeState&&!snapshot?.expert&&current)context.assembly=current;
  if(includeState&&!snapshot?.expert&&snapshot?.circuit)context.circuit=snapshot.circuit;
  try{const result=await apiRequest('/api/student/study-assistant',{method:'POST',timeoutMs:25000,body:JSON.stringify({question:submittedQuestion,context,consent:'deepseek-public-question',...(memoryIds.length?{memoryIds,memoryConsent:'selected-course-questions'}:{}),...(classroom?{classroom}:{}),...(includeState?{stateConsent:'current-task-state'}:{})})});if(requestId===sequence.current){setAnswer(result);if(embedded){setChat(rows=>rows.map(row=>row.id===requestId?{...row,pending:false,answer:result}:row));setQuestion('');}setMemoryIds([]);publishTaskAssistantStatus(classroom,userId,result.classroomAnswer?'answered':'failed',result.classroomAnswer?.conversationId);apiRequest('/api/student/study-assistant/history').then(data=>{setHistory(data.conversations??[]);setHistoryMore(Boolean(data.hasMore));}).catch(()=>{});}}
  catch(err){if(requestId===sequence.current){const message=`提问失败：${err.message}。可以重试。`;setError(message);if(embedded)setChat(rows=>rows.map(row=>row.id===requestId?{...row,pending:false,error:message}:row));publishTaskAssistantStatus(classroom,userId,'failed');}}
  finally{if(requestId===sequence.current)setBusy(false);}
 }
 if(snapshot?.inlineAssistant)return null;
 const content=<>
  {!embedded&&<div className="study-companion" data-testid="study-companion" style={{left:position.x,top:position.y}}>
   <button ref={trigger} className="study-companion-trigger" type="button" aria-label="小芯随行学伴，点击答疑或拖动移动" title="点击提问；拖动或用方向键移动，Home键复位" aria-expanded={open}
    onPointerDown={event=>{if(event.button!==0)return;suppressClick.current=false;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,position};event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={move} onPointerUp={stopDrag} onPointerCancel={stopDrag}
    onKeyDown={event=>{const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];if(delta){event.preventDefault();setPosition(value=>clamp({x:value.x+delta[0],y:value.y+delta[1]}));}if(event.key==='Home'){event.preventDefault();setPosition(clamp());}}}
    onClick={event=>{if(suppressClick.current&&event.detail>0){suppressClick.current=false;return;}suppressClick.current=false;setOpen(value=>!value);}}>
    <img src="/ai/study-mascot.webp" alt="小芯，芯片机器人" width="72" height="72" draggable="false"/><strong>小芯学伴</strong><small>{help&&!help.ready?'帮我排查':spark?.todayPoints?`✦ 今日 +${spark.todayPoints} 火花`:'点击答疑 · 可拖动'}</small>
   </button>
  </div>}
  {open&&<section className={`study-mascot-dialog study-companion-dialog${embedded?' companion-embedded':''}`} role={embedded?'region':'dialog'} aria-labelledby="companion-title" style={embedded?undefined:{top:viewport.top+Math.max(8,viewport.height-650),maxHeight:Math.max(120,viewport.height-Math.max(8,viewport.height-650)-16)}}>
   <header><img src="/ai/study-mascot.webp" alt="" width="48" height="48"/><div><h3 id="companion-title">{embedded?'小芯课程答疑':'小芯随行答疑'}</h3><p>当前：{snapshot?.title??pageTitle}{embedded?'':' · 状态实时更新'}</p></div>{!embedded&&<button type="button" className="icon-button" aria-label="关闭小芯助教" onClick={close}>×</button>}</header>
   <div className="study-mascot-reply" ref={embedded?thread:undefined}>
    {embedded ? <div className="companion-chat-thread" role="log" aria-label="课程对话" aria-live="polite">
      {chat.length===0?<div className="companion-chat-empty"><img src="/ai/study-mascot.webp" alt="小芯" width="84" height="84"/><h2>今天想弄懂什么？</h2><p>说说你的疑问，或选一个下方的示例开始。</p></div>:chat.map(row=><div className="companion-chat-turn" key={row.id}>
        <article className="companion-user-message"><strong>我</strong><p>{row.question}</p></article>
        <article className="companion-ai-message"><strong>小芯助教</strong>{row.pending?<p role="status">小芯正在整理讲解…</p>:row.error?<p role="alert" className="study-mascot-error">{row.error}</p>:<><span className="study-mascot-source">{studyAnswerSourceLabel(row.answer)}</span><p>{row.answer.explanation??row.answer.hint?.conceptReview??'已生成讲解'}</p>{row.answer.steps?.length>0&&<ol>{row.answer.steps.map((step,index)=><li key={index}>{step}</li>)}</ol>}{row.answer.check&&<div className="study-mascot-check"><strong>试着想一想</strong><p>{row.answer.check}</p></div>}</>}</article>
      </div>)}
    </div> : <>
    <StudySpark spark={spark} compact/>{sparkError&&<button type="button" className="ghost-button" onClick={refreshSpark}>重新加载学习火花</button>}
    <StudyEngagement {...engagement} compact/>
    <section className="companion-live" aria-label="当前现场状态"><strong>现场提示 · 本机规则检查</strong><p role="status">{snapshot?.expert?'当前为独立排障练习，请先自行判断或在工作台点击“查看提示”。':help?.summary??snapshot?.summary??selected?.suggestion??'告诉我此刻遇到的问题；课程问题会结合当前公开学习内容讲解。'}</p>
     {action&&!snapshot?.expert&&<section className="companion-action" aria-label="最近操作解释"><strong>最近操作 · {action.ok?'已完成':'未完成'}</strong><p>{action.description}</p><p><b>原因：</b>{action.reason}</p><p><b>{action.ok?'下一步：':'怎么改：'}</b>{action.fix}</p></section>}
     {!snapshot?.expert&&help&&<><p className="companion-next">下一步：{help.steps[0]}</p><details><summary>查看装配检查与接线指引</summary><ol>{help.steps.map(step=><li key={step}>{step}</li>)}</ol></details></>}
     {snapshot?.issues?.length>0&&!snapshot?.expert&&<ul>{snapshot.issues.slice(0,3).map((item,index)=><li key={index}>{item}</li>)}</ul>}
     {snapshot?.testRows?.length>0&&<p>{snapshot.testRows.slice(0,6).map(row=>`${row.label}：${row.actual}`).join('；')}</p>}
    </section>
    {busy&&<p role="status">小芯正在整理讲解…</p>}{error&&<p role="alert" className="study-mascot-error">{error}</p>}
    {answer&&<section aria-live="polite"><span className="study-mascot-source">{studyAnswerSourceLabel(answer)}</span>{sentKey.current!==stateKey&&<p className="companion-stale">页面状态已变化，下面是上次提问时的回答；请参考上方实时提示或重新提问。</p>}<p>{answer.explanation}</p><ol>{answer.steps?.map((step,index)=><li key={index}>{step}</li>)}</ol>{answer.check&&<div className="study-mascot-check"><strong>试着想一想</strong><p>{answer.check}</p></div>}</section>}
    <details className="companion-history"><summary>我的助教对话记录（已显示 {history.length} 条）</summary>{history.length?history.map(item=><details key={item.id}><summary>{item.createdAt} · {item.topic} · {item.kind==='lab_hint'?'实验讲解':'提问'} · {item.answerSource==='ai'?'AI 生成':'本地提示'}</summary><p><strong>我：</strong>{item.question}</p><p><strong>助教：</strong>{item.answer.explanation??item.answer.hint?.conceptReview??'已生成讲解'}</p>{item.answer.steps?.length?<ol>{item.answer.steps.map((step,index)=><li key={index}>{step}</li>)}</ol>:null}{item.answer.check&&<p><strong>自测：</strong>{item.answer.check}</p>}</details>):<p>暂无记录。</p>}{historyMore&&<button type="button" className="ghost-button" onClick={()=>apiRequest(`/api/student/study-assistant/history?before=${history.at(-1).id}`).then(data=>{setHistory(rows=>[...rows,...data.conversations]);setHistoryMore(Boolean(data.hasMore));}).catch(()=>{})}>加载更早对话</button>}</details>
    </>}
   </div>
   <form onSubmit={ask}>
    {embedded&&suggestions.length>0&&<div className="companion-suggestions" aria-label="提问示例">{suggestions.map(text=><button key={text} type="button" disabled={busy} onClick={()=>{setQuestion(text);field.current?.focus();}}>{text}</button>)}</div>}
    <label htmlFor="companion-question">你的课程问题</label><textarea ref={field} id="companion-question" rows={2} maxLength={1600} placeholder={help?'例如：为什么部件装齐了还不能开机？':'我不理解……'} value={question} onChange={event=>setQuestion(event.target.value)} disabled={busy}/>
    {engagement.data?.memory.length>0&&<details className="companion-memory-select"><summary>本次答疑选取小芯记忆 · 已选 {memoryIds.length} 条</summary><p>仅把下面选中的既往问题发送给助教服务，用于衔接本次讲解；每次提问重新选择。</p>{engagement.data.memory.map(m=><label key={m.id}><input type="checkbox" checked={memoryIds.includes(m.id)} disabled={busy||readOnly} onChange={e=>setMemoryIds(ids=>e.target.checked?[...ids,m.id]:ids.filter(id=>id!==m.id))}/><span>{m.topic}：{m.question.slice(0,1600)}</span></label>)}</details>}
    {(current||snapshot?.circuit)&&!snapshot?.expert&&<label className="companion-state-consent"><input type="checkbox" checked={includeState} onChange={event=>setIncludeState(event.target.checked)} disabled={busy}/>本次提问附带当前{current?'装配与接线快照':'电路输入与检查计数'}（含最近操作）</label>}
    {includeState&&!snapshot?.expert&&(current||snapshot?.circuit)&&<details className="companion-payload"><summary>查看本次将附带的状态</summary><pre>{JSON.stringify(current??snapshot?.circuit,null,2)}</pre></details>}
    <button className="primary-button" type="submit" disabled={busy||!question.trim()}>{busy?'正在思考…':'询问助教'}</button>
   </form>
  </section>}
 </>;
 return embedded?<div className="ai-assistant-layout">
   <aside className="ai-assistant-guide" aria-label="助教侧栏">{sidebar}
    <button type="button" className="companion-new-chat" disabled={busy} onClick={()=>{setChat([]);setQuestion('');setAnswer(null);setError('');setMemoryIds([]);setSelected(null);field.current?.focus();}}>＋ 开始新对话</button>
    <details className="ai-assistant-tools" open={toolsOpen} onToggle={event=>setToolsOpen(event.currentTarget.open)}><summary>学习状态与对话记录</summary><div>
     <StudySpark spark={spark} compact/>{sparkError&&<button type="button" className="ghost-button" onClick={refreshSpark}>重新加载学习火花</button>}
     <StudyEngagement {...engagement} compact/>
     <section className="companion-history" aria-label="我的助教对话记录"><h2>我的助教对话记录 <small>{history.length} 条</small></h2>{history.length?history.map(item=><button type="button" key={item.id} disabled={busy} title={item.question} onClick={()=>{setChat([{id:`history-${item.id}`,question:item.question,answer:{...item.answer,source:item.answerSource}}]);setError('');}}><strong>{item.question}</strong><small>{item.topic} · {item.createdAt}</small></button>):<p>暂无记录。</p>}{historyMore&&<button type="button" onClick={()=>apiRequest(`/api/student/study-assistant/history?before=${history.at(-1).id}`).then(data=>{setHistory(rows=>[...rows,...data.conversations]);setHistoryMore(Boolean(data.hasMore));}).catch(()=>{})}>加载更早对话</button>}</section>
    </div></details>
   </aside>{content}
 </div>:createPortal(content,document.body);
}
