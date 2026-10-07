import { useEffect, useRef, useState } from 'react';
import { TASK_TYPES } from '../../../shared/classroomTaskChain.js';
import { taskDemoPath } from '../../../shared/demoNavigation.js';
import { questionOf, gradeQuestion } from '../../../assignmentQuestions.js';
import { PracticeQuestion } from '../../StudentAssignments.jsx';
import { CoursewareView } from '../../CoursewareView.jsx';
import { api } from '../../../apiClient.js';
import { KnowledgeGraph } from '../../KnowledgeGraph.jsx';
import { TaskStageKnowledge } from '../TaskStageKnowledge.jsx';
import '../taskChain.css';
function optionsOf(question){try{return JSON.parse(question.options_json??'[]');}catch{return [];}}

export function TaskChainPreview(props) {
  const dialog=useRef(null);
  useEffect(()=>{
    const element=dialog.current;
    element.showModal();
    return()=>element.close();
  },[]);
  return <dialog ref={dialog} className="chain-preview-dialog" aria-label="教师任务预览" onCancel={event=>{event.preventDefault();props.onClose();}}><TaskChainPresenter {...props}/></dialog>;
}

export function TaskChainPresenter({mission,initialIndex=0,onClose,onOpenLab}) {
  const [index,setIndex]=useState(initialIndex),[fullscreen,setFullscreen]=useState(false);
  const stage=mission.stages[index];
  useEffect(()=>setIndex(initialIndex),[initialIndex]);
  useEffect(()=>{if(!fullscreen)return;const escape=event=>{if(event.key==='Escape')setFullscreen(false);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[fullscreen]);
  if(!stage)return null;
  return <section className={`chain-presenter${fullscreen?' expanded':''}`} aria-label="教师课堂演示">
    <header className="chain-demo-toolbar"><div><span className="chain-kicker">教师课堂演示 · {index+1} / {mission.stages.length}</span><strong>{mission.title}</strong></div><div className="chain-order-tools"><button type="button" className="ghost-button" onClick={()=>setFullscreen(!fullscreen)}>{fullscreen?'退出大屏':'大屏演示'}</button><button type="button" className="ghost-button" onClick={onClose}>关闭演示</button></div></header>
    <nav className="chain-presenter-nav" aria-label="选择演示环节">{mission.stages.map((item,i)=><button key={item.id} type="button" aria-pressed={i===index} onClick={()=>setIndex(i)}>{i+1}. {item.title}</button>)}</nav>
    <header className="chain-activity-heading"><span className="chain-kicker">{TASK_TYPES[stage.type??'lab']?.label}</span><h2>{stage.title}</h2><p>{stage.instructions}</p><small>教师演示独立于学生完成进度。</small></header>
    <TaskStageKnowledge stage={stage} mission={mission}/>
    <PresentationActivity key={stage.id} stage={stage} mission={mission} onOpenLab={onOpenLab}/>
    <footer className="chain-demo-toolbar"><button type="button" className="ghost-button" disabled={index===0} onClick={()=>setIndex(index-1)}>上一环节</button><span>{index+1} / {mission.stages.length}</span><button type="button" className="primary-button" disabled={index===mission.stages.length-1} onClick={()=>setIndex(index+1)}>下一环节</button></footer>
  </section>;
}

function PresentationActivity({stage,mission,onOpenLab}) {
  const [answers,setAnswers]=useState({}),[results,setResults]=useState(null),[detail,setDetail]=useState(null),[error,setError]=useState(''),[version,setVersion]=useState(0),[knowledge,setKnowledge]=useState(null);
  useEffect(()=>{let alive=true;if(stage.type!=='assignment')return;setError('');api.assignmentDetail(stage.assignmentId).then(data=>{if(alive)setDetail(data);}).catch(cause=>{if(alive)setError(cause.message);});return()=>{alive=false;};},[stage.assignmentId,stage.type,version]);
  if(stage.type==='demo')return <><iframe className="chain-demo-frame" title={`${stage.title} · 教师演示`} src={taskDemoPath(stage)} allow="fullscreen"/>{stage.submissionMode==='text'&&<div className="chain-reflection-content"><label>课堂演示说明<textarea aria-label="教师演示说明" rows={4} placeholder="记录操作数、补码位串、结果及判断依据。"/></label><small>学生可选填运算说明，也可跳过；说明不自动计知识成绩。教师演示不影响学生进度。</small></div>}</>;
  if(stage.type==='courseware')return <CoursewareView initialChapterId={stage.chapterId}/>;
  if(stage.type==='practice')return <><div className="practice-question-list">{stage.questionIds.map((id,i)=><PracticeQuestion key={id} question={questionOf(id)} index={i} value={answers[id]??''} result={results?.[id]} onFocusKp={setKnowledge} onAnswer={(id,value)=>{setAnswers({...answers,[id]:value});setResults(null);}}/>)}</div>{knowledge&&<KnowledgeGraph initialChapterId={stage.chapterId} focusId={knowledge}/>}<div className="chain-activity-controls"><button type="button" className="primary-button" onClick={()=>setResults(Object.fromEntries(stage.questionIds.map(id=>[id,gradeQuestion(questionOf(id),answers[id])])))}>检查演示答案</button><small>本地演示判题，不写入学生成绩。</small></div></>;
  if((stage.type??'lab')==='lab')return <div className="chain-launch-card"><p>打开对应实验工作台，使用教师试做功能演示操作和检测过程。</p><button type="button" className="primary-button" onClick={()=>onOpenLab(stage.challengeId,{stage,mission})}>打开实验演示</button></div>;
  if(stage.type==='custom')return <div className="chain-reflection-content"><h3>自定义课堂任务</h3><p>{stage.submissionMode==='text'?'学生按任务要求完成活动，可选填文字说明或跳过。':'学生完成活动后，确认本环节完成。'}</p><small>参与记录，不计知识成绩。</small>{stage.submissionMode==='text'&&<label>课堂演示说明<textarea aria-label="教师演示说明" rows={5} placeholder="示范如何记录观察、讨论结论与判断依据。"/></label>}</div>;
  if(stage.type==='assignment')return <div className="chain-launch-card">{error?<p role="alert">作业读取失败：{error}<button type="button" onClick={()=>setVersion(value=>value+1)}>重试</button></p>:detail?<><h3>{detail.title}</h3><p>{detail.description}</p><ol>{detail.questions?.map(q=><li key={q.id}><strong>{q.stem}</strong>{optionsOf(q).length>0&&<p>{optionsOf(q).join(' / ')}</p>}</li>)}</ol></>:<p>正在读取作业题目…</p>}</div>;
  return <div className="chain-reflection-content"><h3>{stage.type==='ai'?'引导学生提出问题、等待讲解':'引导学生总结学习证据'}</h3><p>{stage.type==='ai'?'学生主动向小芯输入课程问题，等待回答完成后继续。学习说明可选填或跳过。教师可先示范怎样把运算过程和不理解的部分描述清楚。':'学生可选填观察、判断依据和仍有的疑问，也可跳过说明。教师可查看已提交的内容。'}</p><label>课堂演示说明<textarea aria-label="教师演示说明" rows={5} placeholder="例如：5 − 3 应加上 −3 的补码；用同号相加结果异号判断溢出。"/></label><small>演示文字不作为学生提交。</small></div>;
}
