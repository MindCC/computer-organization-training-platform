import { useEffect, useState } from 'react';
import { useStudyWorkspace } from '../../hooks/useStudyWorkspace.js';
import './studyPlanning.css';

const timeLabel = ms => { const seconds = Math.ceil(Math.max(0, ms) / 1000); return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`; };
const STATE = { running: '计时中', paused: '已暂停', review: '时间到 · 记录这轮学习' };
export function WorkspaceMessage({ controller }) {
  return <>{controller.notice && <p className="study-saved" role="status">{controller.notice}</p>}{controller.error && <div className="study-error" role="alert"><p>{controller.error}</p><button type="button" className="ghost-button" disabled={controller.busy} onClick={controller.refresh}>刷新学习计划与计时</button></div>}</>;
}
export function TimerControls({ controller, target, title }) {
  const { active, data, busy, loading, remainingMs, timerAction, start } = controller;
  const [minutes, setMinutes] = useState(25), [planId, setPlanId] = useState(''), [review, setReview] = useState(false), [outcome, setOutcome] = useState(''), [question, setQuestion] = useState('');
  useEffect(() => { setReview(false); setOutcome(''); setQuestion(''); }, [active?.id]);
  const pending = data?.plans.filter(p => p.status === 'pending') ?? [];
  async function endLearning() { if (active.kind === 'break') return timerAction('finish'); if (active.status !== 'running' || await timerAction('pause')) setReview(true); }
  return <div className="focus-timer" data-testid="focus-timer">
    <header><div><span className="eyebrow">番茄钟</span><h3>{active?.kind === 'break' ? '留一点休息时间' : '专心完成一件事'}</h3></div><button type="button" className="ghost-button" disabled={busy || loading} onClick={controller.refresh}>同步计时</button></header>
    {loading && !data ? <p role="status">正在读取计时…</p> : active ? <>
      <p>{active.title} · {active.kind === 'break' ? '休息' : '学习'}<small>{active.planId ? ' · 已关联学习计划' : ''}</small></p>
      <div className="focus-clock" role="timer" aria-label="番茄钟剩余时间">{timeLabel(remainingMs)}</div>
      <p className="focus-state" role="status">{remainingMs === 0 && active.status === 'running' ? '时间到，请结束并记录或同步状态。' : STATE[active.status]}</p>
      <div className="study-actions">{active.status === 'running' && remainingMs > 0 && <button type="button" className="ghost-button" disabled={busy} onClick={() => timerAction('pause')}>暂停计时</button>}{active.status === 'paused' && <button type="button" className="primary-button" disabled={busy || review} onClick={() => timerAction('resume')}>继续计时</button>}
        <button type="button" className="primary-button" disabled={busy} onClick={endLearning}>{active.kind === 'break' ? '结束休息' : '结束并记录'}</button>
        {!review && <button type="button" className="study-text-button" disabled={busy} onClick={() => timerAction('cancel')}>放弃本轮</button>}{review && active.status === 'paused' && <button type="button" className="study-text-button" disabled={busy} onClick={() => setReview(false)}>返回暂停状态</button>}
      </div>
      {active.kind === 'focus' && (review || active.status === 'review') && <form className="focus-review" onSubmit={async e => { e.preventDefault(); if (await timerAction('finish', { outcome, question })) setReview(false); }}><label>这轮完成了什么<textarea aria-label="本轮学习成果" value={outcome} maxLength={500} onChange={e => setOutcome(e.target.value)} placeholder="例如：找到了输入进位的断线，并通过检测"/></label><label>还有什么疑问<textarea aria-label="本轮学习疑问" value={question} maxLength={500} onChange={e => setQuestion(e.target.value)} placeholder="可选，下次继续研究的问题"/></label><button type="submit" className="primary-button" disabled={busy}>保存本轮学习记录</button></form>}
    </> : <>
      <div className="focus-clock idle">{timeLabel(minutes * 60000)}</div>
      <div className="focus-settings"><label>本轮时长（分钟）<input aria-label="番茄钟学习分钟" type="number" min="1" max="90" value={minutes} disabled={busy} onChange={e => setMinutes(e.target.value === '' ? '' : Number(e.target.value))}/></label>{pending.length > 0 && <label>关联计划<select aria-label="番茄钟关联计划" value={planId} disabled={busy} onChange={e => setPlanId(e.target.value)}><option value="">{title ?? '自主学习'}</option>{pending.map(p => <option value={p.id} key={p.id}>{p.title}</option>)}</select></label>}</div>
      <button type="button" className="primary-button" disabled={busy || !data || !Number.isInteger(minutes) || minutes < 1 || minutes > 90} onClick={() => start({ minutes, ...(planId && pending.some(p => String(p.id) === planId) ? { planId: Number(planId) } : { target: target ?? { kind: 'custom' }, title: title ?? '自主学习' }) })}>开始学习计时</button>
      <div className="focus-break-actions"><button type="button" className="study-text-button" disabled={busy || !data} onClick={() => start({ kind: 'break', minutes: 5 })}>休息5分钟</button><button type="button" className="study-text-button" disabled={busy || !data} onClick={() => start({ kind: 'break', minutes: 15 })}>休息15分钟</button></div>
    </>}
    <p className="study-note">切页、刷新和未暂停时离开页面会继续计时。结束后保存到本人账号；休息单独记录，计时不计入实验成绩。</p>
  </div>;
}
export function FocusTimer({ target, title }) {
  const controller = useStudyWorkspace();
  return <details className="lab-focus-disclosure" open={Boolean(controller.active)}><summary>番茄钟与本轮学习记录{controller.active ? ` · ${timeLabel(controller.remainingMs)} · ${controller.active.kind === 'break' ? '休息' : '学习'}` : ''}</summary><TimerControls controller={controller} target={target} title={title}/><WorkspaceMessage controller={controller}/></details>;
}
