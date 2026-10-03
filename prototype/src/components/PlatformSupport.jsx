import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, BookOpen, CheckCircle, Lifebuoy, X } from '@phosphor-icons/react';
import { api } from '../apiClient.js';
import './platformSupport.css';

export function PlatformSupport({mode,user,classroom,nextChallenge,onClose,changeView,onMission,navigateToChallenge}) {
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
    const nodes=[...root.current.querySelectorAll('button:not(:disabled),a[href],summary')].filter(node=>node.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  function go(view){onClose();changeView(view);}
  return <div className="platform-support-shade" onClick={onClose}><section className="platform-support" role="dialog" aria-modal="true" aria-labelledby="support-title" ref={root} onClick={event=>event.stopPropagation()} onKeyDown={keyboard}>
    <header><div><span className="support-kicker">芯游记 · {notices?'待办与课堂':'使用指南'}</span><h1 id="support-title">{notices?<Bell size={24}/>:<Lifebuoy size={24}/>} {notices?'学习提醒':'帮助支持'}</h1></div><button type="button" className="icon-button" aria-label="关闭帮助与提醒" onClick={onClose}><X size={20}/></button></header>
    {notices?<><p className="support-intro">基于当前账号的课堂、作业和错题记录。</p>
      {classroom?.active&&!classroom.ended&&<article className="support-task current"><span className="support-task-label">当前课堂 · {classroom.status==='paused'?'已暂停':'进行中'}</span><h2>{classroom.currentStage?.title??classroom.title??'课堂任务'}</h2><button type="button" className="primary-button" onClick={()=>{onClose();onMission();}}>查看课堂任务<ArrowRight size={16}/></button></article>}
      {!user?<div className="support-empty"><BookOpen size={32}/><h2>登录后查看个人提醒</h2><p>课程首页与演示资料可直接浏览。</p><button type="button" className="ghost-button" onClick={()=>go('home')}>浏览课程首页</button></div>:teacher?<article className="support-task"><h2>教师工作台</h2><p>查看课堂状态、待批改作业与学生学习记录。</p><button className="primary-button" type="button" onClick={()=>go('teacher')}>进入教师看板<ArrowRight size={16}/></button></article>:<>
        {!data&&!error&&<p role="status">正在读取当前账号的待办…</p>}
        {error&&<div className="support-error" role="alert"><p>{error}</p><button type="button" className="ghost-button" onClick={()=>setVersion(v=>v+1)}>重试加载提醒</button></div>}
        {data&&<>{data.pending.length>0&&<article className="support-task"><span className="support-task-label">待提交作业 · {data.pending.length} 份</span>{data.pending.map(item=><p key={item.id}>{item.title}</p>)}<button type="button" className="primary-button" onClick={()=>go('assignments')}>前往课后作业<ArrowRight size={16}/></button></article>}{data.mistakes>0&&<article className="support-task"><span className="support-task-label">待巩固错题 · {data.mistakes} 道</span><p>回看解析，重练对应题目或实验。</p><button type="button" className="ghost-button" onClick={()=>go('mistakes')}>打开错题本<ArrowRight size={16}/></button></article>}{data.pending.length===0&&data.mistakes===0&&<div className="support-empty"><CheckCircle size={32}/><h2>当前没有待办</h2><p>可以继续课程探索，新的作业会出现在这里。</p></div>}</>}
        {nextChallenge&&<article className="support-task"><span className="support-task-label">课程建议</span><h2>{nextChallenge.title}</h2><button type="button" className="ghost-button" onClick={()=>{onClose();navigateToChallenge(nextChallenge.id);}}>继续课程探索<ArrowRight size={16}/></button></article>}
      </>}
    </>:<><p className="support-intro">从这里找到入口，按当前任务继续操作。</p>
      {(teacher?[
        ['如何开始课堂？','在教师看板创建或选择班级，导入学生；选择课堂任务并启动。暂停、继续和结束操作位于当前课堂卡片。'],
        ['如何布置与批改作业？','在教学活动展开“课后作业管理”，创建草稿、添加题目后发布。学生提交后可查看原作答并评分。'],
        ['如何查看学生卡点？','在学情统计查看章节覆盖率、干预分组与学情明细。点击学生详情查看实际记录，避免仅凭均分判断。'],
        ['如何发布课件与备份？','课程课件支持 PPTX 上传并选择发布班级。课堂设置提供学生导入、审计记录与备份下载。']
      ]:[
        ['如何进入实验？','课程首页按章节展开实验。进入工作台后可拖动元件和连线、运行测试，再提交检测；依赖关卡按课程规则解锁。'],
        ['装机完成后怎样交付？','先接下客户工单，安装元件并接线，开机自检完成后交付。收到服务器同步的通过回执后，才可以接待下一位客户。'],
        ['题库、作业和错题本如何联动？','课后作业包括按章练习和教师作业。提交后的错题进入错题本；订正用于复习，教师作业原成绩保留。'],
        ['知识库怎么使用？','导入课程资料后，左侧选择文件，右侧阅读摘要或正文。全文检索可定位原文片段；删除文档同时清除对应索引。'],
        ['网络中断怎么办？','恢复网络后重试同步。提交失败时先检查记录与提示，再重试；未经服务器确认的交付不算完成。']
      ]).map(([title,copy])=><details className="support-guide" key={title}><summary>{title}</summary><p>{copy}</p></details>)}
      <div className="support-links"><button className="primary-button" type="button" onClick={()=>go(teacher?'teacher':'home')}>{teacher?'进入教师看板':'返回课程首页'}</button><button className="ghost-button" type="button" onClick={()=>go('courseware')}>打开课程课件</button></div>
    </>}
  </section></div>;
}
