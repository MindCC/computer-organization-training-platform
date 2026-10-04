import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, BookOpen, CheckCircle, Lifebuoy, X } from '@phosphor-icons/react';
import { api } from '../apiClient.js';
import { HelpSupportPanel } from './HelpSupportPanel.jsx';
import './platformSupport.css';

export function PlatformSupport({mode,user,classroom,nextChallenge,onClose,changeView,onMission,navigateToChallenge,onOpenSettings}) {
  const root=useRef(null), [data,setData]=useState(null), [error,setError]=useState(''), [version,setVersion]=useState(0);
  const teacher=user?.role==='teacher', notices=mode==='notifications';
  useEffect(()=>{
    const previous=document.activeElement, oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';root.current?.querySelector('button')?.focus();
    return()=>{document.body.style.overflow=oldOverflow;if(previous?.isConnected)previous.focus();};
  },[]);
  useEffect(()=>{
    if(!notices||user?.role!=='student')return;
    let cancelled=false;setError('');setData(null);
    Promise.all([api.studentAssignments(),api.studentSubmissions(),api.mistakes()]).then(([assignments,submissions,mistakes])=>{
      if(cancelled)return;
      const submitted=new Set(submissions.submissions.filter(item=>['submitted','graded'].includes(item.status)).map(item=>item.assignment_id));
      setData({pending:assignments.assignments.filter(item=>item.status==='published'&&!submitted.has(item.id)),mistakes:mistakes.items.filter(item=>!item.resolved).length});
    }).catch(err=>{if(!cancelled)setError(`提醒加载失败：${err.message}`);});
    return()=>{cancelled=true;};
  },[notices,user?.id,version]);
  function keyboard(event){
    if(event.key==='Escape'){event.stopPropagation();onClose();return;}
    if(event.key!=='Tab')return;
    const nodes=[...root.current.querySelectorAll('button:not(:disabled),a[href],summary,input:not(:disabled),select:not(:disabled)')].filter(node=>node.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  function go(view){onClose();changeView(view);}
  return <div className="platform-support-shade" onClick={onClose}><section className={`platform-support ${notices ? '' : 'platform-support-help'}`} role="dialog" aria-modal="true" aria-labelledby="support-title" ref={root} onClick={event=>event.stopPropagation()} onKeyDown={keyboard}>
    <header><div><span className="support-kicker">芯游记 · {notices?'待办与课堂':'使用指南'}</span><h1 id="support-title">{notices?<Bell size={24}/>:<Lifebuoy size={24}/>} {notices?'学习提醒':'帮助支持'}</h1></div><button type="button" className="icon-button" aria-label="关闭帮助与提醒" onClick={onClose}><X size={20}/></button></header>
    {notices?<><p className="support-intro">基于当前账号的课堂、作业和错题记录。</p>
      {classroom?.active&&!classroom.ended&&<article className="support-task current"><span className="support-task-label">当前课堂 · {classroom.status==='paused'?'已暂停':'进行中'}</span><h2>{classroom.currentStage?.title??classroom.title??'课堂任务'}</h2><button type="button" className="primary-button" onClick={()=>{onClose();onMission();}}>查看课堂任务<ArrowRight size={16}/></button></article>}
      {!user?<div className="support-empty"><BookOpen size={32}/><h2>登录后查看个人提醒</h2><p>课程首页与演示资料可直接浏览。</p><button type="button" className="ghost-button" onClick={()=>go('home')}>浏览课程首页</button></div>:teacher?<article className="support-task"><h2>教师工作台</h2><p>查看课堂状态、待批改作业与学生学习记录。</p><button className="primary-button" type="button" onClick={()=>go('teacher')}>进入教师看板<ArrowRight size={16}/></button></article>:<>
        {!data&&!error&&<p role="status">正在读取当前账号的待办…</p>}
        {error&&<div className="support-error" role="alert"><p>{error}</p><button type="button" className="ghost-button" onClick={()=>setVersion(v=>v+1)}>重试加载提醒</button></div>}
        {data&&<>{data.pending.length>0&&<article className="support-task"><span className="support-task-label">待提交作业 · {data.pending.length} 份</span>{data.pending.map(item=><p key={item.id}>{item.title}</p>)}<button type="button" className="primary-button" onClick={()=>go('assignments')}>前往课后作业<ArrowRight size={16}/></button></article>}{data.mistakes>0&&<article className="support-task"><span className="support-task-label">待巩固错题 · {data.mistakes} 道</span><p>回看解析，重练对应题目或实验。</p><button type="button" className="ghost-button" onClick={()=>go('mistakes')}>打开错题本<ArrowRight size={16}/></button></article>}{data.pending.length===0&&data.mistakes===0&&<div className="support-empty"><CheckCircle size={32}/><h2>当前没有待办</h2><p>可以继续课程探索，新的作业会出现在这里。</p></div>}</>}
        {nextChallenge&&<article className="support-task"><span className="support-task-label">课程建议</span><h2>{nextChallenge.title}</h2><button type="button" className="ghost-button" onClick={()=>{onClose();navigateToChallenge(nextChallenge.id);}}>继续课程探索<ArrowRight size={16}/></button></article>}
      </>}
    </>:<HelpSupportPanel user={user} changeView={go} navigateToChallenge={id => {onClose();navigateToChallenge(id);}} onOpenSettings={onOpenSettings ? section => {onClose();onOpenSettings(section);} : null} />}
  </section></div>;
}
