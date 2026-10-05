import { useState } from 'react';
import { CHALLENGES } from '../../platformLogic.js';
import { COURSE_CHAPTERS } from '../../courseChapters.js';
import { useStudyWorkspace } from '../../hooks/useStudyWorkspace.js';
import { TimerControls, WorkspaceMessage } from './FocusTimer.jsx';
import './studyPlanning.css';

const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; };
const targetValue = target => target.kind === 'custom' ? 'custom' : `${target.kind}:${target.id}`;
export function StudyPlanningPanel({ onOpenChallenge, onOpenStudyTarget }) {
  const controller = useStudyWorkspace(), { data, busy, loading, mutate, start } = controller;
  const [editor, setEditor] = useState(null), [showCompleted, setShowCompleted] = useState(false);
  const pending = data?.plans.filter(p => p.status === 'pending') ?? [], completed = data?.plans.filter(p => p.status === 'completed') ?? [];
  const newPlan = suggestion => setEditor({ title: suggestion?.title ?? '', date: today(), minutes: suggestion?.minutes ?? 25, target: suggestion?.target ?? { kind: 'custom' } });
  function openTarget(target) {
    if (target.kind === 'lab') onOpenChallenge(target.id);
    else if (target.kind === 'coach') onOpenChallenge('full-adder');
    else if (target.kind === 'chapter') onOpenStudyTarget({ source: 'practice', chapterId: target.id });
    else if (target.kind === 'assignment') onOpenStudyTarget({ source: 'assignment', assignmentId: target.id });
  }
  async function save(e) { e.preventDefault(); const ok = await mutate(editor.id ? `/plans/${editor.id}` : '/plans', editor, editor.id ? 'PATCH' : 'POST'); if (ok) setEditor(null); }
  const setField = (field, value) => setEditor(current => ({ ...current, [field]: value }));
  return <section className="study-planning" data-testid="study-planning" aria-label="我的学习计划与番茄钟">
    <header className="study-planning-header"><div><span className="eyebrow">计划 · 实践 · 回顾</span><h2>我的学习计划</h2><p>把这次要学的内容安排好，做完后留下成果和下一步。</p></div><button type="button" className="ghost-button" disabled={busy || loading} onClick={controller.refresh}>刷新学习计划</button></header>
    {loading && !data ? <p role="status">正在读取个人学习安排…</p> : <div className="study-plan-layout">
      <div className="study-plan-main"><div className="study-plan-toolbar"><span>{pending.length} 项待完成</span><button type="button" className="primary-button" disabled={busy || !data} onClick={() => newPlan()}>新建学习计划</button></div>
        {editor && <form className="study-plan-form" onSubmit={save}><h3>{editor.id ? '调整计划' : '安排一项学习'}</h3><label>学习目标<input aria-label="学习计划目标" maxLength={120} required value={editor.title} onChange={e => setField('title',e.target.value)} placeholder="例如：弄清输入进位怎样影响全加器"/></label>
          <div className="study-plan-fields"><label>计划日期<input aria-label="学习计划日期" type="date" required value={editor.date} onChange={e => setField('date',e.target.value)}/></label><label>预计分钟<input aria-label="学习计划预计分钟" type="number" min="1" max="180" required value={editor.minutes} onChange={e => setField('minutes',e.target.value === '' ? '' : Number(e.target.value))}/></label></div>
          <label>关联学习内容{editor.id || ['coach','assignment'].includes(editor.target.kind) ? <span className="study-target-label">{editor.target.label}</span> : <select aria-label="学习计划关联内容" value={targetValue(editor.target)} onChange={e => { const [kind,id] = e.target.value.split(':'); setField('target',kind === 'custom' ? {kind} : {kind,id}); }}><option value="custom">自定义学习目标</option><optgroup label="课程实验">{CHALLENGES.map(c => <option value={`lab:${c.id}`} key={c.id}>{c.title}</option>)}</optgroup><optgroup label="章节练习">{COURSE_CHAPTERS.map(c => <option value={`chapter:${c.id}`} key={c.id}>{c.title}</option>)}</optgroup></select>}</label>
          <div className="study-actions"><button type="submit" className="primary-button" disabled={busy}>保存学习计划</button><button type="button" className="ghost-button" disabled={busy} onClick={() => setEditor(null)}>取消编辑</button></div>
        </form>}
        {!pending.length && !editor && <p className="study-empty">还没有待完成计划。可选择下面的建议，或安排自己的学习目标。</p>}
        <div className="study-plan-list">{pending.map(p => <article className="study-plan-item" key={p.id}><div><strong>{p.title}</strong><small>{p.date} · 预计 {p.minutes} 分钟 · {p.target.label}{p.date < today() ? ' · 待重新安排' : ''}</small></div><div className="study-actions">{p.target.kind !== 'custom' && <button type="button" className="ghost-button" onClick={() => openTarget(p.target)}>前往学习</button>}<button type="button" className="ghost-button" disabled={busy || Boolean(controller.active)} onClick={() => start({ planId:p.id,minutes:Math.min(p.minutes,90) })}>开始计时</button><button type="button" className="study-text-button" disabled={busy} onClick={() => setEditor({...p})}>调整</button><button type="button" className="study-text-button" disabled={busy} onClick={() => mutate(`/plans/${p.id}/complete`,{revision:p.revision})}>我已完成</button><button type="button" className="study-text-button" disabled={busy} onClick={() => mutate(`/plans/${p.id}/archive`,{revision:p.revision})}>归档</button></div></article>)}</div>
        <p className="study-note">实验的新检测通过、教师补练的复测通过和作业提交会自动更新对应计划。“我已完成”标记为个人确认；计划和计时保存到本人账号。</p>
        {data?.suggestions.length > 0 && <details className="study-suggestions" open={!pending.length}><summary>根据当前任务选择学习内容 · {data.suggestions.length} 项</summary>{data.suggestions.map((s,i) => <div className="study-suggestion" key={i}><div><strong>{s.title}</strong><small>{s.reason}</small></div><button type="button" className="ghost-button" disabled={busy} onClick={() => newPlan(s)}>加入计划</button></div>)}</details>}
        <button type="button" className="study-text-button" aria-expanded={showCompleted} onClick={() => setShowCompleted(v => !v)}>已完成计划（{completed.length}）{showCompleted ? ' · 收起' : ' · 展开'}</button>{showCompleted && completed.map(p => <article className="study-plan-item completed" key={p.id}><div><strong>{p.title}</strong><small>{p.completionNote} · {p.date}</small></div><button type="button" className="study-text-button" disabled={busy} onClick={() => mutate(`/plans/${p.id}/archive`,{revision:p.revision})}>归档</button></article>)}
      </div>
      <aside className="study-timer-card"><TimerControls controller={controller}/></aside>
    </div>}
    <WorkspaceMessage controller={controller}/>
    {data && <details className="study-week-review">
      <summary>本周学习回顾 · {Math.round(data.week.focusMs / 60000)} 分钟计时 · {data.week.sessions} 轮 · {data.week.completedPlans} 项计划完成</summary>
      <p className="study-note">本周按北京时间周一开始计算，统计本周结束并保存的学习计时。排除休息和暂停；包含未暂停时离开页面的时间。成绩与掌握情况请结合实验检测和复测查看。</p>
      <h3>最近计时记录（最多30轮，含历史）</h3>
      {data.history.length ? data.history.map(t => <article key={t.id}><strong>{t.title} · {t.kind === 'break' ? '休息' : '学习'} · {t.status === 'cancelled' ? '已放弃' : '已记录'}</strong><small>{new Date(t.completedAt).toLocaleString('zh-CN')} · {Math.round(t.elapsedMs/60000)} 分钟</small>{t.outcome && <p>成果：{t.outcome}</p>}{t.question && <p>待研究：{t.question}</p>}</article>) : <p>结束一轮计时后，可在这里回看成果与疑问。</p>}
    </details>}
  </section>;
}
