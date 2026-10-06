import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../apiClient.js';
import { CoachRetest } from './CoachRetest.jsx';
import './learningCoach.css';

const BASE = '/api/student/learning-coach';
const TOOL_LABELS = { inspect_circuit: '检测电路', lookup_course_sources: '检索课程依据', propose_remediation: '安排补救学习', model_planner: '模型规划校验' };
const SOURCE_LABELS = { local: '本地证据诊断', ai: 'AI 工具助教' };
const STATE_LABELS = { diagnosed: '待修正', repaired: '电路检测通过 · 待复测', retesting: '正在复测', retest_passed: '本次复测通过', retest_failed: '复测仍需巩固' };
const evidenceOf = draft => draft ? { mode: draft.mode, circuitEdges: draft.edges, ...(draft.mode === 'freeform' ? { circuitNodes: draft.model.nodes } : {}) } : null;
const fingerprint = evidence => JSON.stringify(evidence ? { mode: evidence.mode, edges: evidence.circuitEdges.map(e => `${e.from.nodeId}.${e.from.portId}->${e.to.nodeId}.${e.to.portId}`).sort(), nodes: evidence.circuitNodes?.map(n => [n.id, n.type, n.ioIndex]).sort() } : null);
const values = object => Object.entries(object).map(([key, value]) => `${key}=${value === 'unknown' ? '未知' : value}`).join(' · ');

export function CoachReferences({ references }) {
  return <div className="coach-references">{references.map(ref => <details key={ref.id}><summary>{ref.title}<small>{ref.review === 'teacher' ? '教师已审核发布' : '平台自编 · 待教师审核'}</small></summary><p>{ref.content}</p><small>出处：{ref.origin} · 版本 {ref.version ?? 1}{ref.reviewedAt ? ` · 发布 ${ref.reviewedAt}` : ''}</small></details>)}</div>;
}

export function LearningCoachPanel({ draft,challenge }) {
  const challengeId=challenge?.id??draft?.challengeId??'full-adder';
  const recordPath=BASE+'?challengeId='+encodeURIComponent(challengeId);
  const [run, setRun] = useState(null), [classes, setClasses] = useState([]), [classId, setClassId] = useState(''), [tasks, setTasks] = useState([]), [taskId, setTaskId] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false), [consent, setConsent] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [answers, setAnswers] = useState({});
  const sequence = useRef(0), mounted = useRef(true), currentDraft = useRef(draft);
  currentDraft.current = draft;
  async function reload() {
    const seq = ++sequence.current; setLoading(true); setError('');
    try {
      const result = await apiRequest(recordPath);
      if (!mounted.current || seq !== sequence.current) return;
      const tasks=result.tasks.filter(t=>t.challengeId===challengeId);
      setRun(result.latest); setClasses(result.classes); setTasks(tasks); setAiEnabled(result.aiEnabled);
      const selectedTask = tasks.find(t => String(t.id) === taskId && !t.completedRunId) ?? tasks.find(t => !t.completedRunId);
      setClassId(current => selectedTask ? String(selectedTask.classId) : result.classes.some(c => String(c.id) === current) ? current : result.classes.length === 1 ? String(result.classes[0].id) : '');
      setTaskId(String(selectedTask?.id ?? ''));
      setAnswers({});
    } catch (failure) { if (mounted.current && seq === sequence.current) setError(failure.message); }
    finally { if (mounted.current && seq === sequence.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; reload(); return () => { mounted.current = false; sequence.current++; }; }, []);
  const evidence = evidenceOf(draft), signature = fingerprint(evidence);
  const changed = run && signature !== fingerprint(run.diagnosis.evidence);
  const testing = run?.retest && !run.retest.result;
  async function act(suffix, body) {
    const seq = ++sequence.current; setBusy(true); setError('');
    try {
      const result = await apiRequest(BASE + suffix, { method: 'POST', body: JSON.stringify(body), timeoutMs: 24000 });
      if (!mounted.current || seq !== sequence.current) return;
      setRun(result.run);
      if (suffix.endsWith('/retest') || suffix === '/diagnose') setAnswers({});
      if (result.run.status === 'retest_passed') {
        const data = await apiRequest(recordPath);
        if (mounted.current && seq === sequence.current) { setTasks(data.tasks.filter(t=>t.challengeId===challengeId)); setTaskId(''); }
      }
    } catch (failure) { if (mounted.current && seq === sequence.current) setError(failure.message); }
    finally { if (mounted.current && seq === sequence.current) setBusy(false); }
  }
  const runAction = (action, body = {}) => act(`/runs/${run.id}/${action}`, { revision: run.revision, ...body });
  return <section className="learning-coach" aria-label="小芯实验诊断与补练" data-testid="learning-coach">
    <header className="coach-heading"><div><span className="eyebrow">小芯 · 实验诊断与补练</span><h2>找出错因，再验证一次</h2><p>{challenge?.title??'全加器'} · 依据本实验的实际连线检测，复测记录独立保存。</p></div><button type="button" className="ghost-button" disabled={loading || busy} onClick={reload}>刷新已保存诊断</button></header>
    {loading ? <p role="status">正在读取诊断记录…</p> : <>
      <div className="coach-start-controls">
        {classes.length > 0 && <label>记录到班级<select aria-label="诊断所属班级" value={classId} disabled={busy} onChange={e => { setClassId(e.target.value); setTaskId(''); }}><option value="">仅个人记录</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {tasks.some(t => !t.completedRunId) && <label>教师补练<select aria-label="选择教师补练" value={taskId} disabled={busy} onChange={e => { setTaskId(e.target.value); const task = tasks.find(t => String(t.id) === e.target.value); if (task) setClassId(String(task.classId)); }}><option value="">自主练习</option>{tasks.filter(t => !t.completedRunId).map(t => <option key={t.id} value={t.id}>{t.title} · {t.className}</option>)}</select></label>}
        <button type="button" className="primary-button" disabled={busy || !evidence || testing} onClick={() => act('/diagnose', { challengeId, evidence, classId: classId ? Number(classId) : null, taskId: taskId ? Number(taskId) : null, ...(consent ? { consent: 'selected-circuit-evidence' } : {}) })}>{busy ? '处理中…' : run ? '开始新的诊断' : '帮我诊断当前电路'}</button>
      </div>
      <label className="coach-consent"><input type="checkbox" checked={consent} disabled={busy || !aiEnabled} onChange={e => setConsent(e.target.checked)}/>使用 DeepSeek 工具助教：发送本次检测统计、一个失败输入及课程依据，不含身份与历史记录。</label>
      {!aiEnabled && <p className="coach-note">AI 尚未配置，当前使用本地检测与课程提示。</p>}
      {consent && evidence && <details className="coach-payload"><summary>查看本次允许发送的检测内容</summary><p>服务器重新检测后，仅发送通过组数、结构问题数量、错误输出方向、第一组失败输入及实际/预期输出。原始节点标签、坐标、全部连线和其他学习记录均不发送。</p></details>}
      {run && <div className="coach-session">
        <div className="coach-session-meta"><span className={`coach-source ${run.plan.source}`}>{SOURCE_LABELS[run.plan.source]}</span><strong>{STATE_LABELS[run.status]}</strong><small>诊断 #{run.id} · 已保存到账号</small></div>
        {changed && <p className="coach-changed" role="status">{run.status === 'retest_passed' ? '已保存的结果来自上次验证的连线。开始新诊断可检查当前电路。' : '当前连线与这份诊断不同。请验证修改后再开始复测。'}</p>}
        <div className="coach-evidence-grid">
          {run.diagnosis.outputFindings?.some(row=>row.failedCases>0)&&<section><h3>失败输出与未知信号</h3>{run.diagnosis.outputFindings.filter(row=>row.failedCases>0).map(row=><p key={row.label}>{row.label}：{row.failedCases} / {row.testedCases} 组不符合预期，其中 {row.unknownCases} 组输出未知。</p>)}<small>这是检测事实；端口或逻辑原因需结合反例验证。</small></section>}
          <section><h3>检测事实</h3><p>{run.diagnosis.summary}</p>{run.diagnosis.issues.length > 0 && <p>{run.diagnosis.issues[0].message}</p>}<details><summary>查看全部输入检测</summary><div className="coach-table-scroll"><table><thead><tr><th>输入</th><th>实际输出</th><th>预期输出</th><th>检测</th></tr></thead><tbody>{run.diagnosis.cases.map((row, i) => <tr key={i}><td>{values(row.inputs)}</td><td>{values(row.actual)}</td><td>{values(row.expected)}</td><td>{row.passed ? '通过' : '未通过'}</td></tr>)}</tbody></table></div></details></section>
          <section><h3>{run.plan.source === 'ai' ? 'AI 学习建议' : '待验证的原因与下一步'}</h3><p>{run.plan.explanation}</p>{run.plan.reason && !['LOCAL_SELECTED', 'RECHECKED'].includes(run.plan.reason) && <small>AI 未配置或规划未通过校验，已采用本地课程流程。</small>}</section>
        </div>
        <div className="coach-repair-actions"><button type="button" className="ghost-button" disabled={busy || !evidence || testing || run.status === 'retest_passed'} onClick={() => runAction('verify', { challengeId,evidence: evidenceOf(currentDraft.current) })}>验证当前修改</button><button type="button" className="primary-button" disabled={busy || !run.repaired || changed || testing || run.status === 'retest_passed'} onClick={() => runAction('retest')}>{run.status === 'retest_failed' ? '换一组题再复测' : '开始变式复测'}</button><small>验证不会替你提交正式实验成绩。</small></div>
        <section className="coach-hints"><div className="coach-subheading"><h3>按需展开提示</h3><span>{run.hintLevel} / 4 层已使用</span></div>{run.hints.map(hint => <article key={hint.level}><strong>{hint.level}. {hint.title}</strong><p>{hint.detail}</p></article>)}{run.hintLevel < 4 && <button type="button" className="ghost-button" disabled={busy || run.status === 'retest_passed'} onClick={() => runAction('hint', { level: run.hintLevel + 1 })}>{['给我概念提醒', '进一步定位问题', '查看操作建议', '主动查看参考解法'][run.hintLevel]}</button>}{testing && <small>复测期间请求新提示会被记录；复测前使用过的提示也会保留。</small>}</section>
        {run.retest && <CoachRetest run={run} answers={answers} setAnswers={setAnswers} busy={busy} onSubmit={answers=>runAction('retest/submit',{answers})}/>}
        <details className="coach-citations"><summary>讲解依据与材料出处</summary><CoachReferences references={run.plan.references}/></details>
        <details className="coach-trace"><summary>查看工具执行与学习记录</summary><ol>{run.plan.trace.map((step, i) => <li key={i}><strong>{TOOL_LABELS[step.tool] ?? step.tool}</strong><span>{step.summary}</span><small>{step.status === 'fallback' ? '已回退' : step.status === 'local' ? '本地规则' : '已执行'}</small></li>)}</ol><p>提示请求 {run.events.filter(e => e.kind === 'hint').length} 次 · 修正验证 {run.events.filter(e => e.kind === 'verified').length} 次 · 已提交复测 {run.events.filter(e => e.kind === 'retest_submitted').length} 次</p></details>
      </div>}
    </>}
    {error && <div className="coach-error" role="alert"><p>{error}</p><button type="button" className="ghost-button" disabled={busy || loading} onClick={reload}>重新读取记录</button></div>}
  </section>;
}
