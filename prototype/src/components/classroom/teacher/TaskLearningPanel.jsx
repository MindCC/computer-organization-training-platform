import { useEffect, useRef, useState } from 'react';
import { api } from '../../../apiClient.js';
import { TASK_TYPES } from '../../../shared/classroomTaskChain.js';
import { useVisibilityInterval } from '../../../hooks/useVisibilityInterval.js';
import { TeachingLoopPanel } from './TeachingLoopPanel.jsx';

const statuses={live:'进行中',paused:'已暂停',ended:'已结束',draft:'草稿'};
const progress={completed:'已完成',in_progress:'正在做',not_started:'尚未开始'};

function StageFeedback({stage}){
  return <section className="task-learning-feedback" aria-label="单个任务学生反馈"><h3>{stage.title} · 学生反馈</h3>
    {stage.students.map(student=><article key={student.studentId}><header><strong>{student.displayName}</strong><span>{progress[student.status]}</span></header>
      {student.result?<><p>{Number.isFinite(student.result.score)?`${student.result.score} 分`:'参与记录 · 不计知识成绩'} · 提交 {student.result.attempts??1} 次</p>
        {student.result.errors?.length?<ul>{student.result.errors.map((message,index)=><li key={index}>{message}</li>)}</ul>:null}
        {student.result.evidence?.text?<p className="task-learning-text">{student.result.evidence.text}</p>:null}
        {student.result.evidence?.skipped?<p>已跳过学习说明</p>:null}
      </>:<p>尚无本任务的提交记录。</p>}
    </article>)}{!stage.students.length?<p>本场课堂暂无学生。</p>:null}
  </section>;
}

/** 库中查看与统计页共用同一课堂、节点筛选和服务端记录。 */
export function TaskLearningPanel({task,initialSessionId=null,initialStageId=null,onOpenStatistics,onCreateFollowUp}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [sessionId,setSessionId]=useState(initialSessionId),[stageId,setStageId]=useState(initialStageId);
  const [followUpScope,setFollowUpScope]=useState(null);
  const [ending,setEnding]=useState(false);
  async function endSource(){if(ending)return;setEnding(true);try{await api.endClassroomSession(sessionId);await load();}catch(cause){setError(cause.message);}finally{setEnding(false);}}
  const sequence=useRef(0);
  async function load(silent=false){
    const request=++sequence.current;
    if(!silent)setLoading(true);
    try{const result=await api.taskLibraryLearning(task.id,sessionId);if(request===sequence.current){setData(result.learning);setError('');}}
    catch(cause){if(request===sequence.current)setError(`学情读取失败：${cause.message}`);}
    finally{if(request===sequence.current)setLoading(false);}
  }
  useEffect(()=>{setData(null);load();return()=>{sequence.current+=1;};},[task.id,sessionId]);
  useVisibilityInterval(()=>load(true),15000,!followUpScope);
  const publication=data?.publications.find(item=>item.sessionId===sessionId);
  if(followUpScope)return <section><button type="button" className="ghost-button" onClick={()=>setFollowUpScope(null)}>返回来源任务学情</button><TaskLearningPanel key={`${followUpScope.taskId}:${followUpScope.sessionId}`} task={{id:followUpScope.taskId,title:followUpScope.title}} initialSessionId={followUpScope.sessionId} onOpenStatistics={onOpenStatistics} onCreateFollowUp={onCreateFollowUp}/></section>;
  return <section className="task-learning-panel" aria-label="任务链学情详情">
    <div className="task-learning-controls"><strong>{task.title}</strong><small>每 15 秒同步</small><button type="button" className="ghost-button" disabled={loading} onClick={()=>load()}>刷新学情</button>{sessionId!==null&&initialSessionId===null?<button type="button" className="ghost-button" onClick={()=>{setSessionId(null);setStageId(null);}}>全部发布</button>:null}</div>
    {loading?<p role="status">正在读取学情…</p>:null}
    {error?<p className="form-error" role="alert">{error}<button type="button" onClick={()=>load()}>重试</button></p>:null}
    {data?<>
      {publication?<p className="task-learning-scope">{publication.className} · 课堂 #{publication.sessionId} · {statuses[publication.status]} · {publication.publishedAt}</p>:null}
      {publication&&['live','paused'].includes(publication.status)?<button type="button" className="secondary-button" disabled={ending} onClick={endSource}>{ending?'正在结束…':'结束本次课堂，准备后续任务'}</button>:null}
      {data.publications.length?<div className="task-learning-summary">
        <span><strong>{data.summary.publishedCount}</strong> 次课堂</span><span><strong>{data.summary.classCount}</strong> 个班级</span>
        <span><strong>{data.summary.completed} / {data.summary.totalStudents}</strong> {sessionId===null?'人次':'人'}完成 · {data.summary.completionRate}%</span>
        <span>{data.summary.averageScore===null?'暂无计分成绩':<>计分平均 <strong>{data.summary.averageScore}</strong> 分</>}</span>
      </div>:<p className="task-learning-empty">还没有课堂记录。发布到班级后可查看完成度与各环节学情。</p>}
      {data.stages.length?<section className="task-learning-stages" aria-label="各环节学情"><h3>各环节学情</h3>
        <ol>{data.stages.map((stage,index)=><li key={stage.key}>
          <span className={`chain-step-number type-${stage.type}`}>{index+1}</span>
          <div className="task-learning-stage-main"><small>{TASK_TYPES[stage.type]?.label??'任务'}</small><strong>{stage.title}</strong>
            <span className="task-learning-stage-stats">{stage.completed} {sessionId===null?'人次':'人'}完成{stage.inProgress?` · ${stage.inProgress} ${sessionId===null?'人次':'人'}正在做`:''} · {stage.averageScore===null?(stage.submitted?'参与完成 · 不计知识成绩':'暂无提交记录'):`计分平均 ${stage.averageScore} 分（${stage.gradedCount} ${sessionId===null?'人次':'人'}）`}</span>
            {stage.topErrors.length?<ul className="task-learning-errors">{stage.topErrors.map(item=><li key={item.message}>{item.message}<small>{item.count} 人次</small></li>)}</ul>:null}
            {sessionId!==null?<div><button type="button" className="ghost-button" aria-pressed={stageId===stage.stageId} onClick={()=>setStageId(stage.stageId)}>查看学生反馈</button>{onOpenStatistics?<button type="button" className="ghost-button" onClick={()=>onOpenStatistics({...publication,taskId:task.id,title:task.title,stageId:stage.stageId})}>在学情统计中查看</button>:null}</div>:null}
            {sessionId!==null&&stageId===stage.stageId?<StageFeedback stage={stage}/>:null}
          </div>
        </li>)}</ol></section>:null}
      {sessionId===null&&data.publications.length?<section className="task-learning-publications" aria-label="发布记录"><h3>发布记录 · 联动学情统计</h3>
        {data.publications.map(item=><article key={item.sessionId}><div className="task-learning-class"><strong>{item.className}</strong><span className={`task-learning-status ${item.status}`}>{statuses[item.status]}</span>{item.imported?<small>导入来源课堂</small>:null}</div>
          <span>课堂 #{item.sessionId} · {item.publishedAt}<br/>{item.students.completed} / {item.students.totalStudents} 人完成</span>
          <button type="button" className="ghost-button" onClick={()=>{setSessionId(item.sessionId);setStageId(null);}}>查看本次课堂</button>
          {onOpenStatistics?<button type="button" className="ghost-button" onClick={()=>onOpenStatistics({...item,taskId:task.id,title:task.title})}>查看学情统计</button>:null}
        </article>)}
      </section>:null}
      <TeachingLoopPanel knowledge={data.knowledge} publication={publication} followUps={data.followUps} onCreateFollowUp={onCreateFollowUp?payload=>onCreateFollowUp({...payload,sourceTaskId:task.id}):undefined} onOpenFollowUp={setFollowUpScope}/>
      <p className="task-learning-note">来自真实课堂记录；参与型环节不计知识成绩。汇总按课堂人次统计，同一学生参加多次课堂分别计入；修改过的节点内容分别统计。</p>
    </>:null}
  </section>;
}
