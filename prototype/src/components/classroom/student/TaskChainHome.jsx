import { ArrowRight, CheckCircle, Lock, Play } from '@phosphor-icons/react';
import { TASK_TYPES } from '../../../shared/classroomTaskChain.js';
import { knowledgePointOf } from '../../../knowledgePoints.js';
import '../taskChain.css';

export function TaskChainHome({viewModel,onEnter,busy=false}) {
  const stages=viewModel.mission?.stages??[],done=viewModel.studentStatus==='completed',started=viewModel.studentStatus!=='not_started';
  return <section className="student-chain-home" aria-label="当前课堂任务链">
    {viewModel.mission?.followUp?<p className="chain-kicker">老师为你安排的个性化后续任务 · 来源课堂 #{viewModel.mission.followUp.sourceSessionId}</p>:null}
    {viewModel.mission?.knowledgePointIds?.length?<p>本次知识目标：{viewModel.mission.knowledgePointIds.map(id=>knowledgePointOf(id)?.title).join('、')}</p>:null}
    <header className="student-chain-intro"><div><span className="chain-kicker">{viewModel.ended?'课堂回顾':'老师发布了课堂任务'}</span><h1>{viewModel.title}</h1><p>{viewModel.lessonPlan?.focus??'沿着这条路线，完成每一步的观察、操作和解释。'}</p></div><span className="chain-progress-count">{viewModel.stageIndex} / {stages.length}<small>已完成环节</small></span></header>
    <div className="student-chain-action"><div><strong>{done?'本节任务已全部完成':viewModel.ended?'课堂已结束':viewModel.paused?'教师已暂停课堂':`下一步：${viewModel.currentStage?.title}`}</strong><p>{done?'可以回看本节任务与自己的学习记录。':viewModel.currentStage?.instructions}</p></div><button type="button" className="primary-button" disabled={viewModel.paused||busy} onClick={onEnter}><Play size={17}/>{viewModel.ended||done?'查看课堂回顾':started?'继续任务':'接受任务并开始'}</button></div>
    <ol className="student-chain-route">{stages.map((stage,index)=>{
      const passed=index<viewModel.stageIndex,current=index===viewModel.stageIndex&&!done;
      return <li key={stage.id} className={passed?'completed':current?'current':'locked'}><span className={`chain-step-number type-${stage.type}`}>{passed?<CheckCircle size={21}/>:index+1}</span><div><small>{TASK_TYPES[stage.type??'lab']?.label} · 预计 {stage.minutes??5} 分钟</small><h3>{stage.title}</h3><p>{stage.instructions}</p></div><span className="chain-route-status">{passed?'已完成':current?<><ArrowRight size={15}/>当前环节</>:<><Lock size={14}/>待开始</>}</span></li>;
    })}</ol>
  </section>;
}
