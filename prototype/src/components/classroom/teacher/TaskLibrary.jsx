import { useEffect, useRef, useState } from 'react';
import { Books, Eye, PencilSimple, Plus, MagnifyingGlass, PaperPlaneTilt, Trash, ArrowClockwise, ChartDonut } from '@phosphor-icons/react';
import { api } from '../../../apiClient.js';
import { createRandomId } from '../../../shared/randomId.js';
import { TaskLearningPanel } from './TaskLearningPanel.jsx';
import { useVisibilityInterval } from '../../../hooks/useVisibilityInterval.js';
import { TaskChainBuilder } from './TaskChainBuilder.jsx';
import { TaskChainPreview } from './TaskChainPresenter.jsx';
import { TeachingTemplatePicker,RecipientPicker } from './TeachingTemplatePicker.jsx';
import { buildTeachingTemplate } from '../../../shared/teachingLoop.js';
import '../taskChain.css';

function LibraryDialog({title,onClose,busy,children}){
  const dialog=useRef(null);
  useEffect(()=>{const element=dialog.current;element.showModal();return()=>element.close();},[]);
  return <dialog ref={dialog} className="task-library-dialog" aria-label={title} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}><h2>{title}</h2>{children}<button type="button" disabled={busy} className="ghost-button" onClick={onClose}>取消</button></dialog>;
}

/** 任务链学情：跨发布场次汇总完成度，并逐个环节展示与「学情统计」同源的学习数据。 */
function TaskLearningDialog({task,onClose,onOpenStatistics,onCreateFollowUp}){
  const dialog=useRef(null);
  useEffect(()=>{const element=dialog.current;element.showModal();return()=>element.close();},[]);
  return <dialog ref={dialog} className="task-library-dialog task-learning-dialog" aria-label={`${task.title} 学情`} onCancel={event=>{event.preventDefault();onClose();}}>
    <h2>{task.title} · 完成度与学情</h2>
    <TaskLearningPanel task={task} onOpenStatistics={onOpenStatistics} onCreateFollowUp={onCreateFollowUp}/>
    <button type="button" className="ghost-button" onClick={onClose}>关闭</button>
  </dialog>;
}
export function TaskLibrary({classes,classId,onPublished,onOpenClassroom,onOpenLab,activeSession,initialPlan,onPlanCreated,onOpenStatistics}){
  const [tasks,setTasks]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
  const [editor,setEditor]=useState(null),[detail,setDetail]=useState(null),[removing,setRemoving]=useState(null),[publishing,setPublishing]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [learningTask,setLearningTask]=useState(null);
  const [templatesOpen,setTemplatesOpen]=useState(false);
  function useTeachingTemplate(taskChain){setEditor({task:null,config:{templateKey:'task-chain',durationMinutes:45,passScore:80,taskChain}});setTemplatesOpen(false);}
  function createFollowUp({recommendation,publication,sourceTaskId}){
    const chain=buildTeachingTemplate(recommendation.kind,[recommendation.chapterId],[recommendation.knowledgePointId]);
    chain.followUp={sourceTaskId,sourceSessionId:publication.sessionId,studentIds:recommendation.studentIds};
    setLearningTask(null);setEditor({task:null,classId:publication.classId,config:{templateKey:'task-chain',durationMinutes:45,passScore:80,taskChain:chain}});
  }
  async function openPublishing(task){
    if(pending.current)return;pending.current=true;setBusy(true);setError('');
    try{
      const {task:latest}=await api.taskLibraryDetail(task.id),source=latest.config.taskChain.followUp;
      if(source){
        const {learning}=await api.taskLibraryLearning(source.sourceTaskId,source.sourceSessionId);
        const roster=learning.knowledge?.roster??[];
        setPublishing({task:latest,classId:learning.publications[0].classId,roster,targetStudentIds:(source.studentIds??[]).filter(id=>roster.some(s=>s.studentId===id)),key:createRandomId('publish')});
      }else setPublishing({task:latest,classId:classId??classes[0]?.id,key:createRandomId('publish')});
    }catch(cause){setError(cause.message);}finally{setBusy(false);pending.current=false;}
  }
  const pending=useRef(false);
  async function load(silent=false){if(!silent)setLoading(true);try{const data=await api.taskLibrary();setTasks(data.tasks);setError('');}catch(cause){setError(`任务库读取失败：${cause.message}`);}finally{setLoading(false);}}
  useVisibilityInterval(()=>load(true),15000,!editor&&!busy&&!removing&&!publishing);
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(initialPlan)setEditor({task:null});},[initialPlan]);
  async function open(task,edit){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{const data=await api.taskLibraryDetail(task.id);if(edit)setEditor({task:data.task});else setDetail(data.task);}catch(cause){setError(cause.message);}finally{setBusy(false);pending.current=false;}}
  async function save(config,decision={}){
    const task=editor?.task;
    const data=task?await api.updateLibraryTask(task.id,{revision:task.revision,config,...decision}):await api.createLibraryTask({...config,...decision});
    setEditor(null);setMessage(`已保存「${data.task.title}」，可以从任务库发布。`);onPlanCreated?.();await load();
  }
  async function remove(){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await api.deleteLibraryTask(removing.id,removing.revision);setMessage(`已删除「${removing.title}」。`);setRemoving(null);await load();}catch(cause){setError(cause.message);}finally{setBusy(false);pending.current=false;}}
  async function publish(){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{
    const data=await api.publishLibraryTask(publishing.task.id,{classId:publishing.classId,revision:publishing.task.revision,clientSubmissionId:publishing.key,...(publishing.targetStudentIds?{targetStudentIds:publishing.targetStudentIds}:{})});
    setPublishing(null);await load();onPublished(data.session);
  }catch(cause){setError(`发布失败：${cause.message}`);}finally{setBusy(false);pending.current=false;}}
  if(editor)return <TaskChainBuilder key={editor.task?.id??'new'} initialConfig={editor.task?.config??editor.config} assistantReview={editor.task?.assistantReview} editing={Boolean(editor.task)} libraryMode initialPlan={initialPlan} classId={editor.classId??classId} onCancel={()=>{setEditor(null);onPlanCreated?.();}} onOpenLab={onOpenLab} onCreateSession={save}/>;
  const visible=tasks.filter(task=>task.title.toLowerCase().includes(query.trim().toLowerCase())&&(filter==='all'||(filter==='published'?task.publishedCount>0:task.publishedCount===0)));
  return <section className="task-library" aria-label="教师任务库">
    <header className="task-library-heading"><div><span className="chain-kicker"><Books size={18}/>任务库</span><h2>我的教学任务</h2><p>创建与管理任务，准备好后发布到班级。完成度每 15 秒同步。</p></div>{activeSession?.active&&!activeSession.ended&&<button type="button" className="secondary-button" onClick={onOpenClassroom}>查看当前课堂</button>}</header>
    <div className="task-library-toolbar"><button type="button" className="primary-button" disabled={busy} onClick={()=>{setEditor({task:null});setMessage('');}}><Plus size={18}/>创建任务</button><button type="button" className="secondary-button" aria-expanded={templatesOpen} onClick={()=>setTemplatesOpen(v=>!v)}>模板库</button><select aria-label="任务发布状态" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">全部任务</option><option value="unpublished">未发布</option><option value="published">已发布</option></select><label className="task-library-search"><MagnifyingGlass size={18}/><input aria-label="搜索任务" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索任务名称"/></label><button type="button" className="ghost-button" disabled={loading||busy} onClick={load}><ArrowClockwise size={16}/>刷新任务库</button></div>
    {templatesOpen&&<TeachingTemplatePicker onUse={useTeachingTemplate}/>}
    {message&&<p className="task-library-message" role="status">{message}</p>}{error&&!removing&&!publishing&&<p className="form-error" role="alert">{error}<button type="button" onClick={load}>重试</button></p>}
    {loading?<p role="status">正在读取任务库…</p>:visible.length?<div className="task-library-grid">{visible.map(task=><article className="task-library-card" key={task.id} data-task-id={task.id}>
      <header><span className="task-library-icon"><Books size={22}/></span><span className="task-library-badge">{task.publishedCount?`已发布 ${task.publishedCount} 次`:'待发布'}</span></header>
      <h3>{task.title}</h3><p>{task.config.taskChain.stages.length} 个节点 · {task.config.durationMinutes} 分钟 · 版本 {task.revision}</p><small>{task.imported?'由已有课堂任务导入':'教师创建'} · 更新于 {task.updatedAt}</small>
      {task.learning?<button type="button" className="task-library-learning" onClick={()=>setLearningTask(task)} aria-label={`${task.title} 完成度与学情`}>
        <span className="task-library-learning-top"><strong>{task.learning.completed} / {task.learning.totalStudents} 人次完成</strong><em>{task.learning.averageScore===null?'暂无计分成绩':`计分平均 ${task.learning.averageScore} 分`}</em></span>
        <progress value={task.learning.completed} max={task.learning.totalStudents||1} aria-label="完成人数进度"/>
      </button>:null}
      <footer><button type="button" className="ghost-button" disabled={busy} onClick={()=>open(task,false)}><Eye size={15}/>查看</button><button type="button" className="ghost-button" disabled={busy} onClick={()=>setLearningTask(task)}><ChartDonut size={15}/>学情</button><button type="button" className="ghost-button" disabled={busy} onClick={()=>open(task,true)}><PencilSimple size={15}/>修改</button><button type="button" className="ghost-button" disabled={busy} onClick={()=>{setRemoving(task);setError('');}}><Trash size={15}/>删除</button><button type="button" className="primary-button" disabled={busy||!classes.length} onClick={()=>openPublishing(task)}><PaperPlaneTilt size={15}/>发布</button></footer>
    </article>)}</div>:<div className="task-library-empty"><Books size={54} weight="duotone"/><h3>{tasks.length?'没有匹配的任务':'暂无教学任务'}</h3><p>{tasks.length?'调整搜索名称或发布状态。':'点击“创建任务”，用 AI 或手动编排你的课堂。'}</p></div>}
    {detail&&<TaskChainPreview mission={detail.config.taskChain} onClose={()=>setDetail(null)} onOpenLab={onOpenLab}/>}
    {learningTask&&<TaskLearningDialog task={learningTask} onCreateFollowUp={createFollowUp} onClose={()=>setLearningTask(null)} onOpenStatistics={publication=>{setLearningTask(null);onOpenStatistics?.(publication);}}/>}
    {removing&&<LibraryDialog title="删除任务" busy={busy} onClose={()=>setRemoving(null)}><p>删除「{removing.title}」？</p><p>已发布课堂及学生学习记录会保留。</p>{error&&<p role="alert" className="form-error">{error}</p>}<button type="button" disabled={busy} className="danger-button" onClick={remove}>{busy?'正在删除…':'确认删除'}</button></LibraryDialog>}
    {publishing&&<LibraryDialog title="发布任务到班级" busy={busy} onClose={()=>setPublishing(null)}><strong>{publishing.task.title}</strong><label>选择班级<select aria-label="发布班级" disabled={busy||Boolean(publishing.roster)} value={publishing.classId} onChange={event=>setPublishing({...publishing,classId:Number(event.target.value),key:createRandomId('publish')})}>{classes.map(cls=><option key={cls.id} value={cls.id}>{cls.name}</option>)}</select></label><p>{publishing.roster?"确认后，仅选中的学生会收到后续任务；其余学生保持原学习路线。":"确认后开始课堂，班级学生可以在首页直接查看并接受任务。"}</p>{publishing.roster&&<RecipientPicker disabled={busy} roster={publishing.roster} ids={publishing.targetStudentIds} onChange={targetStudentIds=>setPublishing({...publishing,targetStudentIds,key:createRandomId("publish")})}/>}{error&&<p role="alert" className="form-error">{error}</p>}<button type="button" className="primary-button" disabled={busy||!publishing.classId||(publishing.roster&&!publishing.targetStudentIds.length)} onClick={publish}>{busy?'正在发布…':'确认发布'}</button></LibraryDialog>}
  </section>;
}
