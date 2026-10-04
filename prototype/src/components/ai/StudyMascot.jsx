import { useEffect, useId, useRef, useState } from 'react';
import { PaperPlaneTilt, X } from '@phosphor-icons/react';
import { apiRequest } from '../../apiClient.js';
import './studyMascot.css';

export function StudyMascot({ context = {}, suggestion = '哪里不懂？告诉小芯你的问题，一起理清思路。', compact = false }) {
  const [open,setOpen]=useState(false), [question,setQuestion]=useState(''), [answer,setAnswer]=useState(null), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const button=useRef(null), field=useRef(null), generation=useRef(0), id=useId();
  const contextKey=JSON.stringify([context.questionId,context.conceptId,context.chapterId]);
  useEffect(()=>{generation.current++;setAnswer(null);setError('');setBusy(false);setQuestion('');},[contextKey]);
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{if(open)field.current?.focus();},[open]);
  useEffect(()=>{
    const dismissOther = event => { if(event.detail!==id)setOpen(false); };
    window.addEventListener('study-mascot-open',dismissOther);
    return ()=>window.removeEventListener('study-mascot-open',dismissOther);
  },[id]);
  useEffect(()=>{
    if(!open)return;
    window.dispatchEvent(new CustomEvent('study-mascot-open',{detail:id}));
    const escape = event => {if(event.key==='Escape'){event.stopPropagation();setOpen(false);button.current?.focus();}};
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[open,id]);
  function close(){setOpen(false);button.current?.focus();}
  async function ask(event){
    event.preventDefault();if(busy||!question.trim())return;
    const sequence=++generation.current;setBusy(true);setError('');setAnswer(null);
    try {
      // Local review suggestion, learning records and student answers are never included.
      const result=await apiRequest('/api/student/study-assistant',{method:'POST',timeoutMs:25000,body:JSON.stringify({question:question.trim(),consent:'deepseek-public-question',context:{questionId:context.questionId,conceptId:context.conceptId,chapterId:context.chapterId}})});
      if(sequence===generation.current)setAnswer(result);
    }catch(err){if(sequence===generation.current)setError(`提问失败：${err.message}。问题仍保留，可以重试。`);}
    finally{if(sequence===generation.current)setBusy(false);}
  }
  return <div className={`study-mascot${compact?' is-compact':''}`}>
    <button ref={button} className="study-mascot-trigger" type="button" aria-label={compact ? "小芯复习建议，点击提问" : "向小芯 AI 助教提问"} aria-expanded={open} aria-describedby={open ? undefined : `${id}-tip`} onClick={()=>setOpen(value=>!value)}>
      <img src="/ai/study-mascot.webp" alt="小芯，抱着课本的芯片机器人" width="88" height="88"/><span><strong>小芯助教</strong><small>{compact?'问一问':'有疑问，问小芯'}</small></span>
    </button>
    {!open&&<div className="study-mascot-tip" id={`${id}-tip`} role="tooltip"><strong>小芯的复习提示</strong><p>{suggestion}</p><small>点击小芯，输入问题获得讲解。</small></div>}
    {open&&<section className="study-mascot-dialog" role="dialog" aria-labelledby={`${id}-title`} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
      <header><img src="/ai/study-mascot.webp" alt="" width="52" height="52"/><div><h3 id={`${id}-title`}>和小芯一起想一想</h3><p>先讲概念，再试一个例子</p></div><button className="icon-button" type="button" aria-label="关闭小芯助教" onClick={close}><X size={18}/></button></header>
      <div className="study-mascot-reply" aria-live="polite">
        {!answer&&!busy&&!error&&<>{compact&&<p className="study-mascot-review">复习建议：{suggestion}</p>}<p>把不理解的概念或题目写下来。例如：“半加器和全加器有什么区别？”</p></>}
        {busy&&<p role="status">小芯正在整理讲解…</p>}
        {error&&<p className="study-mascot-error" role="alert">{error}</p>}
        {answer&&<><span className="study-mascot-source">{answer.source==='ai'?'AI 讲解 · DeepSeek':answer.reason==='AI_DISABLED'?'AI 尚未配置 · 课程参考':'AI 暂时不可用 · 课程参考'}</span><p>{answer.explanation}</p>{answer.steps?.length>0&&<ol>{answer.steps.map((step,index)=><li key={index}>{step}</li>)}</ol>}{answer.check&&<div className="study-mascot-check"><strong>试着想一想</strong><p>{answer.check}</p></div>}</>}
      </div>
      <form onSubmit={ask}><label htmlFor={`${id}-question`}>你的课程问题</label><textarea ref={field} id={`${id}-question`} value={question} onChange={event=>setQuestion(event.target.value)} maxLength={1600} rows={3} placeholder="我不理解……" disabled={busy}/><p className="study-mascot-consent">点击发送，将本次问题和公开课程材料发送至 DeepSeek。不会附带你的成绩、作答记录或教师评语。请勿输入个人隐私。</p><button className="primary-button" type="submit" disabled={busy||!question.trim()}>{busy?'正在思考…':'发送到 DeepSeek'}<PaperPlaneTilt size={17}/></button></form>
    </section>}
  </div>;
}
