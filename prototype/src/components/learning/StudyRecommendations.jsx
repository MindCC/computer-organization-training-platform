import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest } from '../../apiClient.js';
import { useStudyRecommendations } from './useStudyRecommendations.js';
import { StudySpark } from './StudySpark.jsx';
import { useQuestionObservation } from './useQuestionObservation.js';
import { useStudyEngagement } from './useStudyEngagement.js';
import { StudyEngagement } from './StudyEngagement.jsx';
import './studyRecommendations.css';

const prefix='/api/student/study-recommendations';
const kindLabel={diagnosis:'先做诊断',remediation:'针对性补学',review:'间隔复习'};
export function StudyRecommendations({userId,onOpenKnowledge,onOpenDemo,onOpenChallenge}) {
  const {data,error,refresh}=useStudyRecommendations(userId);
  const engagement=useStudyEngagement(userId);
  const [session,setSession]=useState(null),[busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[notice,setNotice]=useState('');
  const sequence=useRef(0),launchButton=useRef(null);
  useEffect(()=>()=>{sequence.current++;},[]);
  async function mutate(path,body,openSession=false) {
    if(busy)return;
    const seq=++sequence.current;setBusy(true);setActionError('');setNotice('');
    try {
      const result=await apiRequest(prefix+path,{method:'POST',body:JSON.stringify(body)});
      if(seq===sequence.current){if(openSession)setSession(result);else setNotice('已调整推荐，新的答题错误仍会作为补学线索。');refresh();}
    } catch(err){if(seq===sequence.current)setActionError(err.message);}
    finally{if(seq===sequence.current)setBusy(false);}
  }
  async function resume(id,event) {
    if(busy)return;launchButton.current=event.currentTarget;setBusy(true);setActionError('');const seq=++sequence.current;
    try {const result=await apiRequest(`${prefix}/sessions/${id}`);if(seq===sequence.current)setSession(result);}
    catch(err){if(seq===sequence.current)setActionError(err.message);}
    finally{if(seq===sequence.current)setBusy(false);}
  }
  function close(){setSession(null);refresh();requestAnimationFrame(()=>launchButton.current?.focus());}
  return <section className="study-recommendations" aria-labelledby="today-study-heading" data-testid="study-recommendations">
    <header className="today-study-header"><div><span className="eyebrow">小芯学习建议</span><h2 id="today-study-heading">今日补学</h2><p>根据你的提问与学习证据，选一个具体问题继续。</p></div>
      {data?.activeSession&&<button type="button" className="ghost-button" disabled={busy} onClick={event=>resume(data.activeSession.id,event)}>继续上次补学 · {data.activeSession.title}</button>}
    </header>
    {(error||actionError)&&<p role="alert">{actionError||error}<button type="button" className="ghost-button" onClick={refresh}>重新加载建议</button></p>}
    {notice&&<p role="status">{notice}</p>}
    {!data&&!error&&<p role="status">正在整理学习线索…</p>}
    <div className="today-study-layout"><div className="today-study-cards">
      {data?.items.map(item=><article key={item.conceptId} className="today-study-card" data-concept-id={item.conceptId}>
        <div className="today-study-meta"><span>{kindLabel[item.kind]}</span><small>{item.chapterTitle}</small></div>
        <h3>{item.title}</h3><p>{item.reason}</p><small className="today-study-evidence">{item.evidenceLabel}</small>
        {item.prerequisites.length>0&&<details><summary>前置知识 · {item.prerequisites.length} 项</summary><p>{item.prerequisites.map(p=>p.title).join('、')}。补学讲解中可先复习这些基础。</p></details>}
        {item.questionCount<2&&<p className="today-study-limited">题量不足，提供讲解与练习；暂不能验证不同题号复测。</p>}
        <button type="button" className="primary-button" disabled={busy} onClick={event=>{launchButton.current=event.currentTarget;mutate('/sessions',{conceptId:item.conceptId},true);}}>{item.questionCount===0?'查看讲解':item.kind==='remediation'?'开始补学':'开始自测'}</button>
        <div className="today-study-feedback"><button type="button" disabled={busy} onClick={()=>mutate('/feedback',{conceptId:item.conceptId,choice:'not-difficulty'})}>这不是我的难点</button><button type="button" disabled={busy} onClick={()=>mutate('/feedback',{conceptId:item.conceptId,choice:'later'})}>稍后再学</button></div>
      </article>)}
      {data&&!data.items.length&&<p>当前没有需要补学的充分证据。你可以继续课程学习，新的提问和答题会更新建议。</p>}
    </div><div className="study-engagement-sidebar"><StudySpark spark={data?.spark}/><StudyEngagement {...engagement}/></div></div>
    {session&&<RemediationDialog key={`${session.id}:${session.stage}:${session.question?.id??''}:${session.pendingResult}`} session={session} busy={busy} error={actionError} onClose={close}
      onSubmit={body=>mutate(`/sessions/${session.id}`,body,true)}
      onOpenKnowledge={()=>{close();onOpenKnowledge?.();}}
      onOpenDemo={demoId=>{close();onOpenDemo?.(demoId);}}
      onOpenChallenge={challengeId=>{close();onOpenChallenge?.(challengeId);}}/>}
  </section>;
}

function RemediationDialog({session,busy,error,onClose,onSubmit,onOpenKnowledge,onOpenDemo,onOpenChallenge}) {
  const dialog=useRef(null),[value,setValue]=useState('');
  const clocks=useRef(new Map()),submission=useRef(null);
  const observation=useQuestionObservation(session.question?.id??'none',clocks.current,Boolean(session.question)&&!session.pendingResult);
  function changeValue(next){observation.answer();submission.current=null;setValue(next);}
  const stageName={diagnosis:'先检查困惑',learning:'理解知识点',practice:'做一道练习',retest:'换题复测',complete:'本轮结果'};
  useEffect(()=>{dialog.current.showModal();},[]);
  useEffect(()=>{setValue('');},[session.question?.id,session.stage,session.pendingResult]);
  return createPortal(<dialog ref={dialog} className="study-remediation-dialog" aria-labelledby="remediation-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <header><div><span className="eyebrow">{stageName[session.stage]}</span><h2 id="remediation-title">{session.title}</h2></div><button className="ghost-button" type="button" onClick={onClose} aria-label="关闭补学">关闭</button></header>
    <p className="study-remediation-progress">诊断 → 讲解 → 练习 → 换题复测 <span>进度自动保存</span></p>
    {error&&<p role="alert">{error}</p>}
    {session.lastResult&&<section className={`remediation-result ${session.lastResult.correct?'correct':'incorrect'}`} aria-live="polite"><strong>{session.lastResult.correct?'这道题答对了':'这道题需要订正'}</strong><p>参考答案：{session.lastResult.referenceAnswer==='true'?'正确':session.lastResult.referenceAnswer==='false'?'错误':session.lastResult.referenceAnswer}</p><p>{session.lastResult.explanation}</p></section>}
    {session.stage==='learning'&&<section className="remediation-lesson"><h3>先理解这个原理</h3><p>{session.summary}</p>
      {session.prerequisites.length>0&&<details><summary>先复习前置知识</summary>{session.prerequisites.map(p=><article key={p.id}><strong>{p.title}</strong><p>{p.summary}</p></article>)}</details>}
      <div className="remediation-resources"><button className="ghost-button" type="button" onClick={onOpenKnowledge}>打开知识库</button>{session.resources.demoId&&onOpenDemo&&<button className="ghost-button" type="button" onClick={()=>onOpenDemo(session.resources.demoId)}>打开本章互动演示</button>}{session.resources.challengeIds[0]&&onOpenChallenge&&<button className="ghost-button" type="button" onClick={()=>onOpenChallenge(session.resources.challengeIds[0])}>进入关联实验</button>}</div>
      <button className="primary-button" type="button" disabled={busy} onClick={()=>onSubmit({action:'continue'})}>{session.coverage?'进入练习':'完成本次阅读'}</button></section>}
    {session.question&&<form ref={observation.ref} onSubmit={event=>{event.preventDefault();submission.current??=clocks.current.get(session.question.id).snapshot();onSubmit({action:'answer',questionId:session.question.id,value,observation:submission.current});}}>
      <fieldset disabled={busy}><legend>{session.question.stem}</legend>
        {['choice','truefalse'].includes(session.question.type)?<div className="remediation-options">{(session.question.type==='truefalse'?['true','false']:session.question.options).map((option,index)=><label key={option}><input type="radio" name="remediation-answer" value={option} checked={value===option} onChange={()=>changeValue(option)}/><span>{session.question.type==='truefalse'?(option==='true'?'正确':'错误'):`${String.fromCharCode(65+index)}. ${option}`}</span></label>)}</div>:<label className="remediation-text">填写答案<input value={value} onChange={event=>changeValue(event.target.value)} maxLength={2000}/></label>}
      </fieldset><button className="primary-button" disabled={busy||!value.trim()} type="submit">{busy?'正在检查…':session.stage==='retest'?'提交复测':'提交检查'}</button>
    </form>}
    {session.pendingResult&&<button className="primary-button" type="button" disabled={busy} onClick={()=>onSubmit({action:'retry'})}>{session.stage==='retest'?'继续复测':'订正后再试'}</button>}
    {session.stage==='complete'&&<section className="remediation-complete" role="status"><h3>{session.verified?'本轮复测通过':'本轮学习已记录'}</h3><p>{session.verified?'你通过了练习和不同题号的复测。建议过几天再自测一次，确认能否保持。':session.limitation}</p><p>这项结果用于更新学习建议，不改变原课程成绩或知识图谱掌握状态。</p><button className="primary-button" type="button" onClick={onClose}>返回今日补学</button></section>}
  </dialog>,document.body);
}
