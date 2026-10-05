import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle, Link, Play, Plus, Trash } from '@phosphor-icons/react';
import { TASK_TYPES, newTaskStage, taskChainTemplate, validateTaskChain } from '../../../shared/classroomTaskChain.js';
import { validateClassroomSessionConfig } from '../../../shared/classroomMissionDefinitions.js';
import { HOSTED_DEMOS } from '../../../shared/demoNavigation.js';
import { CHALLENGES } from '../../../platformLogic.js';
import { COURSEWARE } from '../../../courseware.js';
import { questionsForChapter } from '../../../assignmentQuestions.js';
import { api } from '../../../apiClient.js';
import { TaskChainPreview } from './TaskChainPresenter.jsx';
import { TaskWorkflowCanvas } from './TaskWorkflowCanvas.jsx';
import { arrangeStages, positionOf } from '../../../shared/taskWorkflow.js';
import '../taskChain.css';

function startingConfig(session) {try{return JSON.parse(session?.config_json??'{}');}catch{return {};}}
function generationNote(candidate){
  if(!candidate||candidate.source==='deepseek')return '';
  if(candidate.reason==='AI_DISABLED')return '尚未配置 DeepSeek，已提供本地课程模板建议。';
  if(candidate.reason==='AI_INVALID_DRAFT')return 'AI 草稿未通过课程资源校验，已提供本地模板，供你手动编排。';
  return 'AI 生成暂未完成，已提供本地模板建议；你可以重试生成。';
}
export function TaskChainBuilder({ onCreateSession, initialPlan=null, initialSession=null, initialConfig=null, libraryMode=false, classId, onCancel, onOpenLab }) {
  const initial=initialConfig??startingConfig(initialSession),fallback=taskChainTemplate(initialSession?'data-flow':'twos');
  const [chain,setChain]=useState(initial.taskChain??fallback);
  const [selected,setSelected]=useState((initial.taskChain??fallback).stages[0]?.id??null);
  const [durationMinutes,setDurationMinutes]=useState(initial.durationMinutes??45);
  const [passScore,setPassScore]=useState(initial.passScore??80);
  const [plan,setPlan]=useState(initial.lessonPlan??initialPlan??null);
  const [submitting,setSubmitting]=useState(false),[error,setError]=useState('');
  const [preview,setPreview]=useState(null);
  function present(index=0){
    try { setPreview({mission:validateTaskChain(chain),index});setError(''); }
    catch(cause){setError(`请先完善任务内容：${cause.message}`);}
  }
  const [creationMode,setCreationMode]=useState('manual'),[aiPrompt,setAiPrompt]=useState(''),[candidate,setCandidate]=useState(null),[generating,setGenerating]=useState(false);
  async function generate(){
    if(generating)return;setError('');if(!aiPrompt.trim()){setError('请先描述这节课的主题、目标和希望安排的环节。');return;}
    setGenerating(true);setCandidate(null);
    try {setCandidate(await api.generateTaskChain(classId,{prompt:aiPrompt.trim(),consent:'deepseek-task-chain'}));}
    catch(cause){setError(cause.message);}finally{setGenerating(false);}
  }
  const [assignments,setAssignments]=useState([]),[assignmentError,setAssignmentError]=useState(''),[resourceVersion,setResourceVersion]=useState(0);
  useEffect(()=>{if(initialPlan)setPlan(initialPlan);},[initialPlan]);
  useEffect(()=>{
    let alive=true;if(!classId)return;setAssignmentError('');
    api.teacherAssignments(classId).then(data=>{if(alive)setAssignments((data.assignments??[]).filter(item=>item.status==='published'));})
      .catch(cause=>{if(alive)setAssignmentError(`班级作业读取失败：${cause.message}`);});
    return()=>{alive=false;};
  },[classId,resourceVersion]);
  const active=chain.stages.find(stage=>stage.id===selected),index=chain.stages.indexOf(active);
  const patch=updates=>setChain(current=>({...current,stages:current.stages.map(stage=>stage.id===selected?{...stage,...updates}:stage)}));
  function useTemplate(key){const next=taskChainTemplate(key);setChain(next);setSelected(next.stages[0]?.id??null);setError('');}
  function add(type){if(chain.stages.length>=16)return;const stage={...newTaskStage(type),position:{x:chain.stages.length?Math.max(...chain.stages.map((item,i)=>positionOf(item,i).x))+280:40,y:90}};setChain(current=>({...current,stages:[...current.stages,stage]}));setSelected(stage.id);}
  function move(offset){setChain(current=>{const stages=[...current.stages];[stages[index],stages[index+offset]]=[stages[index+offset],stages[index]];return {...current,stages:arrangeStages(stages)};});}
  function remove(){const stages=chain.stages.filter(stage=>stage.id!==selected);setChain({...chain,stages});setSelected(stages[Math.min(index,stages.length-1)]?.id??null);}
  async function create(){
    if(submitting)return;setError('');setSubmitting(true);
    try{
      const config=validateClassroomSessionConfig({templateKey:'task-chain',taskChain:chain,durationMinutes,passScore,allowMakeup:initial.allowMakeup??false,...(plan?{lessonPlan:{...plan,steps:plan.steps.map(step=>step.trim()).filter(Boolean)}}:{})});
      await onCreateSession(config);
    }catch(cause){setError(cause.message??'任务链保存失败，请重试');}finally{setSubmitting(false);}
  }
  return <section className="session-setup-panel task-chain-builder" aria-label="创建课堂任务链">
    <header className="chain-builder-heading">{libraryMode&&<button type="button" className="ghost-button" onClick={onCancel}>返回任务库</button>}<span className="chain-kicker"><Link size={18}/>{initialConfig?'修改任务':'创建课堂任务'}</span><h2>任务工作流编排</h2><p>拖动节点、连接任务顺序，选择节点设置内容与完成条件。</p></header>
    <div className="chain-creation-tabs" role="tablist" aria-label="任务链创建方式"><button type="button" role="tab" aria-selected={creationMode==='ai'} onClick={()=>setCreationMode('ai')}>AI 创建</button><button type="button" role="tab" aria-selected={creationMode==='manual'} onClick={()=>setCreationMode('manual')}>手动编排</button></div>
    {creationMode==='ai'&&<section className="chain-ai-create" aria-label="AI创建任务链"><h3>描述你希望开展的课堂</h3><p>写明教学主题、课时、学生基础，以及需要串联的功能。生成后可继续手动修改。</p><label>教学要求<textarea aria-label="AI教学要求" rows={4} maxLength={2000} value={aiPrompt} onChange={event=>setAiPrompt(event.target.value)} placeholder="例如：一节45分钟的补码运算课，安排课前诊断、互动演示、编码实验、AI答疑、随堂检验与反思。"/></label><small>点击生成时，将本次教学要求与公开课程资源目录发送至 DeepSeek。</small><button type="button" className="primary-button" disabled={generating||!classId} onClick={generate}>{generating?'正在生成…':'生成任务链草稿'}</button>{candidate&&<div className="chain-generated-draft" aria-live="polite"><span className="chain-kicker">{candidate.source==='deepseek'?'DeepSeek 生成草稿':'本地模板建议 · 非模型生成'}</span>{generationNote(candidate)&&<p role="status">{generationNote(candidate)}</p>}<h3>{candidate.taskChain.title}</h3><ol>{candidate.taskChain.stages.map(stage=><li key={stage.id}>{stage.title} · {stage.minutes}分钟</li>)}</ol><button type="button" className="primary-button" onClick={()=>{setChain(candidate.taskChain);setDurationMinutes(Math.min(180,Math.max(10,candidate.taskChain.stages.reduce((sum,stage)=>sum+stage.minutes,0))));setSelected(candidate.taskChain.stages[0]?.id??null);setCreationMode('manual');setCandidate(null);}}>采用草稿并继续编排</button></div>}</section>}
    <div hidden={creationMode!=='manual'}>
    <div className="chain-template-picker" aria-label="任务链模板">
      <button type="button" onClick={()=>useTemplate('twos')}><strong>补码运算课</strong><small>诊断 → 演示 → 实验 → AI 答疑 → 检验 → 反思</small></button>
      <button type="button" onClick={()=>useTemplate('data-flow')}><strong>五大部件与数据流</strong><small>复用原有四阶段实验路线</small></button>
      <button type="button" onClick={()=>useTemplate('empty')}><strong>自定义任务链</strong><small>从空白开始组合你的课堂</small></button>
    </div>
    <label className="chain-title-field">任务链名称<input aria-label="任务链名称" maxLength={100} value={chain.title} onChange={event=>setChain({...chain,title:event.target.value})}/></label>
    <div className="chain-builder-layout">
      <div className="chain-sequence-pane"><header><strong>课堂流程</strong><small>{chain.stages.length} 个环节 · 预计 {chain.stages.reduce((sum,stage)=>sum+Number(stage.minutes||0),0)} 分钟</small></header>
        <button type="button" className="secondary-button chain-preview-entry" disabled={!chain.stages.length} onClick={()=>present(0)}><Play size={16}/>预览课堂任务</button>
        <TaskWorkflowCanvas stages={chain.stages} selected={selected} onSelect={setSelected} onChange={stages=>setChain(current=>({...current,stages}))}/>
        {!chain.stages.length&&<p className="chain-empty">从下方选择一个功能，添加第一个课堂环节。</p>}
        <div className="chain-add-palette" aria-label="添加课堂环节">{Object.entries(TASK_TYPES).map(([type,meta])=><button type="button" key={type} title={meta.hint} disabled={chain.stages.length>=16} onClick={()=>add(type)}><Plus size={14}/>{meta.label}</button>)}</div>
      </div>
      <section className="chain-stage-editor" aria-label="编辑任务环节">{active?<>
        <header><div><span className="chain-kicker">环节 {index+1} · {TASK_TYPES[active.type].label}</span><h3>{active.title||'编辑环节'}</h3></div><div className="chain-order-tools">
          <button type="button" className="ghost-button" aria-label="上移环节" disabled={index===0} onClick={()=>move(-1)}><ArrowUp size={16}/></button>
          <button type="button" className="ghost-button" aria-label="下移环节" disabled={index===chain.stages.length-1} onClick={()=>move(1)}><ArrowDown size={16}/></button>
          <button type="button" className="ghost-button" aria-label="删除环节" onClick={remove}><Trash size={16}/></button>
        </div></header>
        <button type="button" className="secondary-button" onClick={()=>present(index)}><Play size={16}/>演示本环节</button>
        <label>环节名称<input aria-label="环节名称" maxLength={100} value={active.title} onChange={event=>patch({title:event.target.value})}/></label>
        <label>学习目标与操作要求<textarea aria-label="学习目标与操作要求" maxLength={1000} rows={3} value={active.instructions} onChange={event=>patch({instructions:event.target.value})} placeholder="告诉学生进入这个环节后具体做什么"/></label>
        <StageResource stage={active} patch={patch} assignments={assignments}/>
        {active.type==='assignment'&&assignmentError&&<p role="alert">{assignmentError}<button type="button" onClick={()=>setResourceVersion(value=>value+1)}>重试</button></p>}
        <div className="chain-stage-options"><label>预计用时（分钟）<input aria-label="环节预计用时" type="number" min={1} max={90} value={active.minutes} onChange={event=>patch({minutes:Number(event.target.value)})}/></label>
          {active.type==='custom'?<label>完成条件<select aria-label="自定义完成条件" value={active.submissionMode??'text'} onChange={event=>patch({submissionMode:event.target.value})}><option value="text">提交文字说明</option><option value="confirm">本人确认完成</option></select><small>参与记录，不计知识成绩。</small></label>:active.type==='practice'?<label>完成条件<select aria-label="完成条件" value={active.completion} onChange={event=>patch({completion:event.target.value})}><option value="submitted">提交全部题目即可继续</option><option value="passed">达到课堂及格分才继续</option></select></label>:<div className="chain-completion-rule"><CheckCircle size={18}/><span>{TASK_TYPES[active.type].completion}<small>{['ai','reflection','demo','courseware'].includes(active.type)?'记录参与完成，不计入知识成绩':'以系统真实提交为依据'}</small></span></div>}
        </div>
      </>:<div className="chain-empty"><Link size={32}/><p>选择一个环节，设置它的内容与完成条件。</p></div>}</section>
    </div>
    <details className="chain-teacher-plan" open={Boolean(initialPlan)}><summary>教学安排与讲解提示{plan?' · 已附加':''}</summary><div>
      {initialPlan&&<p>已采纳学情建议，可结合任务链修改本节安排。</p>}
      <label>本节教学重点<input value={plan?.focus??''} maxLength={500} onChange={event=>setPlan({...plan,focus:event.target.value,steps:plan?.steps??[]})}/></label>
      <label>课堂步骤（每行一条，最多8条）<textarea rows={3} value={(plan?.steps??[]).join('\n')} onChange={event=>setPlan({...plan,focus:plan?.focus??'',steps:event.target.value.split('\n')})}/></label>
      <label>教师讲解提示<textarea rows={2} maxLength={1000} value={plan?.teacherScript??''} onChange={event=>setPlan({...plan,focus:plan?.focus??'',steps:plan?.steps??[],teacherScript:event.target.value})}/></label>
      <button type="button" className="ghost-button" onClick={()=>setPlan(null)}>移除教学安排</button>
    </div></details>
    <footer className="chain-publish-settings"><label>课堂限时（分钟）<input aria-label="课堂限时" type="number" min={10} max={180} value={durationMinutes} onChange={event=>setDurationMinutes(Number(event.target.value))}/></label><label>课堂及格分<input aria-label="课堂及格分" type="number" min={60} max={100} value={passScore} onChange={event=>setPassScore(Number(event.target.value))}/></label>
      <div className="chain-save-note">{libraryMode?'保存到任务库后，可查看、修改或发布到班级。':'保存为草稿后可继续修改，开始课堂后学生收到任务。'}</div>
      {onCancel&&<button type="button" className="ghost-button" onClick={onCancel}>取消编辑</button>}
      <button type="button" className="primary-button" disabled={submitting||(!libraryMode&&!classId)||!chain.stages.length} onClick={create}><Play size={16}/>{submitting?'正在保存…':libraryMode?'保存任务':initialSession?'保存任务链':'创建草稿'}</button>
    </footer></div>{!classId&&<p>{libraryMode?'可以先手动创建任务。使用 AI 创建或关联班级作业前，请选择班级。':'请先选择或创建班级。'}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
    {preview&&<TaskChainPreview mission={preview.mission} initialIndex={preview.index} onClose={()=>setPreview(null)} onOpenLab={onOpenLab}/>}
  </section>;
}

function StageResource({stage,patch,assignments}) {
  if(stage.type==='demo')return <label>互动演示<select aria-label="互动演示内容" value={stage.demoId} onChange={event=>patch({demoId:event.target.value})}>{HOSTED_DEMOS.map(demo=><option key={demo.id} value={demo.id}>{demo.title}</option>)}</select></label>;
  if(stage.type==='lab')return <label>实验任务<select aria-label="实验任务内容" value={stage.challengeId} onChange={event=>patch({challengeId:event.target.value})}>{CHALLENGES.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>;
  if(stage.type==='assignment')return <label>关联班级作业<select aria-label="关联班级作业" value={stage.assignmentId??''} onChange={event=>patch({assignmentId:Number(event.target.value)})}><option value="">选择已发布的作业</option>{assignments.map(item=><option key={item.id} value={item.id}>{item.title} · {item.question_count}题</option>)}</select>{!assignments.length&&<small>先在下方“课后作业管理”发布作业，再添加到任务链。</small>}</label>;
  if(!['practice','ai','courseware'].includes(stage.type))return null;
  const chapters=COURSEWARE.chapters.filter(chapter=>stage.type!=='courseware'||chapter.embeds?.length);
  return <><label>课程章节<select aria-label="环节课程章节" value={stage.chapterId} onChange={event=>patch({chapterId:event.target.value,...(stage.type==='practice'?{questionIds:questionsForChapter(event.target.value).slice(0,3).map(q=>q.id)}:{})})}>{chapters.map(chapter=><option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
    {stage.type==='practice'&&<fieldset className="chain-question-picker"><legend>选择本环节题目 · 已选 {stage.questionIds.length}题</legend>{questionsForChapter(stage.chapterId).map(q=><label key={q.id}><input type="checkbox" checked={stage.questionIds.includes(q.id)} onChange={event=>patch({questionIds:event.target.checked?[...stage.questionIds,q.id]:stage.questionIds.filter(id=>id!==q.id)})}/><span>{q.stem}</span></label>)}</fieldset>}
  </>;
}
