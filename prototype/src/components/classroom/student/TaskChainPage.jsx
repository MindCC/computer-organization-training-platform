import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle, Play } from '@phosphor-icons/react';
import { TASK_TYPES,NODE_PURPOSES } from '../../../shared/classroomTaskChain.js';
import { knowledgePointOf } from '../../../knowledgePoints.js';
import { createRandomId } from '../../../shared/randomId.js';
import { questionOf } from '../../../assignmentQuestions.js';
import { hostedDemoOf,taskDemoPath } from '../../../shared/demoNavigation.js';
import { PracticeQuestion, TeacherAssignments } from '../../StudentAssignments.jsx';
import { CoursewareView } from '../../CoursewareView.jsx';
import { StudyMascot } from '../../ai/StudyMascot.jsx';
import { useCurrentStudyContext } from '../../ai/currentStudyContext.js';
import { MissionHud } from './MissionHud.jsx';
import { TaskChainHome } from './TaskChainHome.jsx';
import { KnowledgeGraph } from '../../KnowledgeGraph.jsx';
import { TaskStageKnowledge } from '../TaskStageKnowledge.jsx';
import '../taskChain.css';

export function TaskChainPage({classroomSession,userId,onOpenStage,onHome,onOpenMistakes}) {
  const vm=classroomSession.viewModel,[finished,setFinished]=useState(null),[entryError,setEntryError]=useState('');
  useCurrentStudyContext({kind:'classroom',title:vm.currentStage?.title??'课堂任务',publicContext:{chapterId:vm.currentStage?.chapterId},classroom:vm.currentStage?.type==='ai'&&!vm.ended&&vm.studentStatus==='in_progress'?{sessionId:vm.sessionId,stageId:vm.currentStage.id}:undefined,summary:vm.paused?'教师已暂停课堂，请等待恢复。':vm.ended?'课堂已结束，可以回顾本轮学习问题。':'跟随当前课堂环节完成任务；不理解的概念可以向小芯提问。'});
  async function enter(){if(classroomSession.loading)return;try{setEntryError('');const data=await classroomSession.enter(vm.sessionId);onOpenStage(data.mission.stages[data.studentState.current_stage_index??0]);}catch(cause){setEntryError(cause.message);}}
  if(!vm.active)return <section className="chain-empty"><h2>正在同步课堂任务…</h2><button type="button" className="ghost-button" onClick={classroomSession.refresh}>刷新课堂</button><button type="button" className="primary-button" onClick={onHome}>返回课程</button></section>;
  if(!vm.ended&&vm.studentStatus==='not_started')return <>{entryError&&<p role="alert" className="form-error">{entryError}</p>}<TaskChainHome viewModel={vm} onEnter={enter} busy={classroomSession.loading}/></>;
  if(vm.ended||vm.studentStatus==='completed')return <section className="chain-review"><span className="chain-kicker">课堂回顾</span><h1>{vm.title}</h1><p>{vm.studentStatus==='completed'?'本节任务链已全部完成。':'课堂已结束，以下保留你已提交的学习记录。'}</p>
    <div className="chain-review-metrics"><strong>{vm.stageIndex} / {vm.mission?.stages.length} 环节</strong><strong>{Number.isFinite(vm.result?.averageScore)?`计分环节平均 ${vm.result.averageScore} 分`:'参与型学习 · 不计知识成绩'}</strong></div>
    <ol className="chain-review-list">{(vm.result?.stageResults??[]).map(result=><li key={result.stageId}><strong>{result.title}</strong><span>{Number.isFinite(result.score)?`${result.score}分`:result.passed?'参与完成':'未完成'}</span>{result.evidence?.text&&<p>{result.evidence.text}</p>}</li>)}</ol><button type="button" className="primary-button" onClick={onHome}>返回课程首页</button></section>;
  if(finished)return <section className="chain-stage-feedback" aria-live="polite"><CheckCircle size={40}/><span className="chain-kicker">环节已完成</span><h1>{finished.stage.title}</h1><p>{Number.isFinite(finished.result.score)?`本次得分 ${finished.result.score} 分，结果已同步到账户。`:'已记录本环节的学习完成情况。'}</p>{finished.result.results&&<ul>{Object.entries(finished.result.results).map(([id,result])=><li key={id}>{questionOf(id)?.stem}：{result.correct?'正确':'请结合解析订正'}</li>)}</ul>}<strong>下一步：{vm.currentStage?.title}</strong><button type="button" className="primary-button" onClick={()=>{setFinished(null);if(vm.currentStage?.type==='lab')onOpenStage(vm.currentStage);}}>继续下一环节<ArrowRight size={17}/></button></section>;
  const stage=vm.currentStage;
  return <section className="task-chain-page"><MissionHud viewModel={vm}/><header className="chain-activity-heading"><span className="chain-kicker">{TASK_TYPES[stage?.type??'lab']?.label}{stage?.purpose?` · ${NODE_PURPOSES[stage.purpose]}`:''}</span><h1>{stage?.title}</h1><p>{stage?.instructions}</p>{vm.mission?.followUp&&<p>老师安排的个性化后续任务 · 来源课堂 #{vm.mission.followUp.sourceSessionId}</p>}{vm.mission?.knowledgePointIds?.length?<p>本次知识目标：{vm.mission.knowledgePointIds.map(id=>knowledgePointOf(id)?.title).join('、')}</p>:null}<small>{stage?.type==='practice'?(stage.completion==='passed'?`达到 ${vm.passScore??80} 分后继续`:'提交全部题目即可继续'):TASK_TYPES[stage?.type??'lab']?.completion}</small></header>
    {vm.paused&&<p className="chain-paused" role="status">教师已暂停课堂，请等待恢复。当前输入已保留。</p>}
    <TaskStageKnowledge stage={stage} mission={vm.mission}/>
    <StageActivity key={`${userId}:${vm.sessionId}:${stage?.id}`} stage={stage} vm={vm} userId={userId} submit={classroomSession.submit} onFinished={(result)=>setFinished({stage,result})} onOpenStage={onOpenStage} onOpenMistakes={onOpenMistakes}/>
  </section>;
}

function StageActivity({stage,vm,userId,submit,onFinished,onOpenStage,onOpenMistakes}) {
  const draftKey=`zcyl:chain-draft:${userId}:${vm.sessionId}:${stage?.id}`;
  const initial=()=>{try{return JSON.parse(localStorage.getItem(draftKey)??'{}');}catch{return {};}};
  const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState(null),[opened,setOpened]=useState(stage?.type!=='lab'),[knowledge,setKnowledge]=useState(null);
  const request=useRef(null),pending=useRef(false);
  const [assistantBusy,setAssistantBusy]=useState(false);
  const requiresText=['ai','reflection'].includes(stage?.type)||(['custom','demo'].includes(stage?.type)&&stage.submissionMode==='text');
  function patch(updates){setDraft(previous=>{const next={...previous,...updates};try{localStorage.setItem(draftKey,JSON.stringify(next));}catch{}return next;});}
  useEffect(()=>{
    if(stage?.type!=='ai')return;
    const changed=event=>{const data=event.detail;if(data?.studentId!==userId||data.sessionId!==vm.sessionId||data.stageId!==stage.id)return;setAssistantBusy(data.status==='pending');patch({conversationId:data.status==='answered'?data.conversationId:null});};
    window.addEventListener('task-assistant-status',changed);
    return()=>window.removeEventListener('task-assistant-status',changed);
  },[userId,vm.sessionId,stage?.id,stage?.type,draftKey]);
  async function finish(){
    if(pending.current||vm.paused||vm.ended||(stage.type==='ai'&&(assistantBusy||!draft.conversationId)))return;
    const evidence=stage.type==='practice'?{answers:draft.answers??{}}:requiresText?{...(draft.text?.trim()?{text:draft.text}:{skipped:true}),...(stage.type==='ai'?{conversationId:draft.conversationId}:{})}:{completed:true};
    const signature=JSON.stringify(evidence);
    if(request.current?.signature!==signature)request.current={signature,id:createRandomId('chain')};
    pending.current=true;setBusy(true);setError('');
    try{
      const saved=await submit({stageId:stage.id,evidence,clientSubmissionId:request.current.id});
      if(saved.result?.passed){try{localStorage.removeItem(draftKey);}catch{}onFinished(saved.result);}
      else{setFeedback(saved.result);setError(`本次 ${saved.result.score} 分，未达到课堂及格分。对照解析订正后再提交。`);}
    }catch(cause){setError(`提交失败：${cause.message}。输入已保留，可以重试。`);}finally{setBusy(false);pending.current=false;}
  }
  if(!stage)return null;
  const label=stage.type==='practice'?'提交本环节并判分':stage.type==='assignment'?'确认作业提交并继续':requiresText?(draft.text?.trim()?'提交学习说明并继续':'跳过说明并继续'):'确认完成并继续';
  const controls=<div className="chain-activity-controls">{error&&<p role="alert">{error}</p>}<button type="button" className="primary-button" disabled={busy||vm.paused||vm.ended||!opened||(stage.type==='ai'&&(assistantBusy||!draft.conversationId))} onClick={finish}>{busy?'正在同步…':assistantBusy?'等待小芯回答…':label}<ArrowRight size={17}/></button>{['demo','courseware'].includes(stage.type)&&<small>这是本人确认的参与记录。</small>}</div>;
  return <div className="chain-activity-content">
    {stage.type==='lab'?<div className="chain-launch-card"><p>在现有实验工作台中完成检测，通过后任务链将进入下一环节。</p><button type="button" className="primary-button" disabled={vm.paused} onClick={()=>onOpenStage(stage)}><Play size={17}/>开始本步实验</button></div>:null}
    {stage.type==='demo'&&<><div className="chain-demo-toolbar"><strong>{hostedDemoOf(stage.demoId)?.title}</strong>{!requiresText&&controls}</div><iframe className="chain-demo-frame" title={`${stage.title} · 互动演示`} src={taskDemoPath(stage)} allow="fullscreen"/></>}
    {stage.type==='courseware'&&<><div className="chain-demo-toolbar">{controls}</div><CoursewareView initialChapterId={stage.chapterId}/></>}
    {stage.type==='practice'&&<><div className="practice-question-list">{stage.questionIds.map((id,index)=><PracticeQuestion key={id} question={questionOf(id)} index={index} value={draft.answers?.[id]??''} result={feedback?.results?.[id]??null} onAnswer={(id,value)=>{patch({answers:{...draft.answers,[id]:value}});setFeedback(null);}} onFocusKp={setKnowledge} assistantEnabled/>)}</div>{knowledge&&<KnowledgeGraph initialChapterId={stage.chapterId} focusId={knowledge}/>}<footer className="practice-submit-footer"><span>本环节 {stage.questionIds.length} 题 · 判分与错题同步到账户</span>{controls}</footer></>}
    {stage.type==='assignment'&&<><TeacherAssignments userId={userId} destination={{source:'assignment',assignmentId:stage.assignmentId}} onOpenMistakes={onOpenMistakes} onlyAssignmentId={stage.assignmentId}/>{controls}</>}
    {requiresText&&<div className="chain-reflection-content">{stage.type==='ai'&&<div className="chain-ai-guide"><img src="/ai/study-mascot.webp" alt="小芯助教" width={100} height={100}/><div><h3>向小芯提问，等待课程讲解</h3><p>点击小芯，主动输入课程问题。收到回答后即可继续，学习说明可以跳过。</p><StudyMascot context={{chapterId:stage.chapterId}} classroom={{sessionId:vm.sessionId,stageId:stage.id}} userId={userId}/><p role="status">{assistantBusy?'小芯正在回答，请等待…':draft.conversationId?'已收到小芯回答，可以继续。':'请先向小芯提问并等待课程回答。'}</p></div></div>}<label>我的学习说明（选填）<textarea aria-label="我的学习说明" rows={4} maxLength={2000} value={draft.text??''} onChange={event=>patch({text:event.target.value})} placeholder="可以记录理解，也可以留空跳过。"/></label><small>选填，最多2000字；留空不影响继续，填写内容供教师查看。</small>{controls}</div>}
    {stage.type==='custom'&&!requiresText&&<div className="chain-reflection-content"><p>按上方任务要求完成课堂活动后，确认本环节完成。</p><small>这是本人确认的参与记录，不计知识成绩。</small>{controls}</div>}
  </div>;
}
