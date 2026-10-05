import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../apiClient.js';
import { CoachReferences } from './LearningCoachPanel.jsx';
import './learningCoach.css';

const STATUS = { none: '暂无诊断', diagnosed: '待修正', repaired: '检测通过 · 待复测', retesting: '正在复测', retest_passed: '复测通过', retest_failed: '复测未通过' };
const FOCUS = { carry: '进位路径', sum: '求和路径', wiring: '结构与传播', transfer: '迁移验证' };
const FOLLOW_UP = [
  { key: 'diagnosed', label: '待修正', next: '回看失败输入，安排分级提示与连线补练' },
  { key: 'repaired', label: '待复测', next: '提醒学生完成变式复测，确认迁移结果' },
  { key: 'retesting', label: '正在复测', next: '查看进度；停留与中断需进一步了解' },
  { key: 'retest_failed', label: '复测未通过', next: '对照错题安排一次针对性讲解与补练' },
];
export function TeacherCoachReview({ classId, refreshVersion = 0 }) {
  const base = `/api/teacher/classes/${classId}/learning-coach`;
  const [data, setData] = useState(null), [selected, setSelected] = useState([]), [title, setTitle] = useState('全加器进位诊断与变式补练');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [version, setVersion] = useState(0);
  const [documents, setDocuments] = useState([]), [document, setDocument] = useState(null), [documentId, setDocumentId] = useState(''), [chunkId, setChunkId] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [evidence, setEvidence] = useState(null), [evidenceLoading, setEvidenceLoading] = useState(false);
  const evidenceSequence = useRef(0);
  const sequence = useRef(0), documentSequence = useRef(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; documentSequence.current++; evidenceSequence.current++; }; }, []);
  useEffect(() => {
    const seq = ++sequence.current; setLoading(true); setError(''); setData(null); setSelected([]); setNotice(''); setEvidence(null); evidenceSequence.current++; setEvidenceLoading(false);
    apiRequest(base).then(result => { if (mounted.current && seq === sequence.current) setData(result); }).catch(failure => { if (mounted.current && seq === sequence.current) setError(failure.message); }).finally(() => { if (mounted.current && seq === sequence.current) setLoading(false); });
  }, [base, version, refreshVersion]);
  async function mutate(path, body) {
    const seq = ++sequence.current; setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiRequest(base + path, { method: 'POST', body: JSON.stringify(body) });
      const latest = await apiRequest(base);
      if (mounted.current && seq === sequence.current) { setData(latest); setNotice(path === '/tasks' ? `已发布 ${result.created} 个补练任务；${result.existing} 名学生已有待完成任务。` : '课程依据已审核发布到本班。'); setConfirmed(false); }
    } catch (failure) { if (mounted.current && seq === sequence.current) setError(failure.message); }
    finally { if (mounted.current && seq === sequence.current) setBusy(false); }
  }
  async function loadDocuments() {
    const seq = ++documentSequence.current; setError('');
    try { const result = await apiRequest('/api/teacher/knowledge/documents'); if (mounted.current && seq === documentSequence.current) setDocuments(result.documents); }
    catch (failure) { if (mounted.current && seq === documentSequence.current) setError(failure.message); }
  }
  async function chooseDocument(id) {
    const seq = ++documentSequence.current; setDocumentId(id); setDocument(null); setChunkId(''); setConfirmed(false); setError('');
    if (!id) return;
    try { const result = await apiRequest('/api/teacher/knowledge/documents/' + id); if (mounted.current && seq === documentSequence.current) { setDocument(result.document); setChunkId(String(result.document.chunks[0]?.id ?? '')); } }
    catch (failure) { if (mounted.current && seq === documentSequence.current) setError(failure.message); }
  }
  const chunk = document?.chunks.find(c => String(c.id) === chunkId);
  async function readEvidence(studentId) {
    const seq = ++evidenceSequence.current; setEvidence(null); setEvidenceLoading(true); setError('');
    try { const result = await apiRequest(base + '/students/' + studentId); if (mounted.current && seq === evidenceSequence.current) setEvidence(result); }
    catch (failure) { if (mounted.current && seq === evidenceSequence.current) setError(failure.message); }
    finally { if (mounted.current && seq === evidenceSequence.current) setEvidenceLoading(false); }
  }
  return <section className="teacher-coach" data-testid="teacher-coach-review" aria-label="实验诊断与补练回看">
    <header className="coach-heading"><div><span className="eyebrow">师生机协同 · 全加器首期</span><h2>实验诊断与补练回看</h2><p>确认课程依据、安排补练，查看学生是否完成修正和变式复测。</p></div><button type="button" className="ghost-button" disabled={loading || busy} onClick={() => setVersion(v => v + 1)}>刷新补练记录</button></header>
    {loading ? <p role="status">正在读取本班诊断记录…</p> : data && <>
      <div className="teacher-coach-metrics"><div><small>已诊断学生</small><strong>{data.diagnosedStudents} / {data.totalStudents}</strong></div><div><small>有初次检测失败记录</small><strong>{data.initialFailureStudents}</strong></div><div><small>有复测通过记录 / 已复测</small><strong>{data.passedStudents} / {data.testedStudents}</strong></div><div><small>待完成教师补练</small><strong>{data.pendingTasks}</strong></div></div>
      <p className="coach-note">{data.disclaimer}</p>
      <section className="coach-follow-up" aria-label="基于检测证据的待跟进学生"><h3>待跟进学生与下一步</h3><p className="coach-note">按每名学生最近一次本班全加器诊断统计。点击人数选择补练对象，核对后确认发布。</p><div className="coach-follow-up-grid">{FOLLOW_UP.map(group => { const students = data.students.filter(s => s.status === group.key); return <div key={group.key}><button type="button" className="ghost-button" disabled={busy || students.length === 0} onClick={() => setSelected(students.map(s => s.id))}>{group.label} · {students.length} 人</button><small>{group.next}</small></div>; })}</div></section>
      <details open><summary>共性问题与确认发布补练</summary><p>{data.students.some(s => s.initialFailures) ? Object.entries(FOCUS).filter(([focus]) => focus !== 'transfer').map(([focus, label]) => `${label}：${data.students.filter(s => s.initialFocus === focus).length} 人`).join(' · ') : '暂无初次检测失败记录，可先安排一次全加器补练。'}</p><div className="teacher-coach-controls"><button type="button" className="ghost-button" disabled={busy} onClick={() => setSelected(data.students.filter(s => s.initialFailures && s.status !== 'retest_passed').map(s => s.id))}>选择待巩固学生</button><button type="button" className="ghost-button" disabled={busy} onClick={() => setSelected(data.students.map(s => s.id))}>选择全班</button><button type="button" className="ghost-button" disabled={busy} onClick={() => setSelected([])}>清空选择</button></div>
        <div className="teacher-coach-roster"><table><thead><tr><th>选择</th><th>学生</th><th>最近诊断</th><th>最高提示</th><th>复测通过 / 提交</th><th>补练完成 / 待完成</th></tr></thead><tbody>{data.students.map(s => <tr key={s.id}><td><input type="checkbox" aria-label={`选择补练学生 ${s.displayName}`} disabled={busy} checked={selected.includes(s.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id))}/></td><td>{s.displayName}<br/><small>{s.username}</small></td><td>{STATUS[s.status]}<br/><small>{FOCUS[s.focus] ?? '暂无依据'}</small></td><td>{s.hintLevel} / 4 层</td><td>{s.retestPasses} / {s.retests}</td><td>{s.completedTasks} / {s.activeTasks}</td></tr>)}</tbody></table></div>
        <div className="teacher-coach-controls"><label>补练标题<input type="text" aria-label="补练任务标题" maxLength={120} value={title} disabled={busy} onChange={e => setTitle(e.target.value)}/></label><button type="button" className="primary-button" disabled={busy || !selected.length || !title.trim()} onClick={() => mutate('/tasks', { studentIds: selected, title })}>确认发布补练（{selected.length}人）</button><a className="ghost-button" href={base + '/export.csv'} download>导出试用记录 CSV</a></div>
      </details>
      <details><summary>回看学生过程证据</summary><div className="teacher-coach-controls">{data.students.filter(s => s.runs).map(s => <button type="button" className="ghost-button" key={s.id} disabled={evidenceLoading} onClick={() => readEvidence(s.id)}>{s.displayName} · 过程证据</button>)}</div>{!data.students.some(s => s.runs) && <p>学生完成诊断后，这里会显示可回看的过程。</p>}{evidenceLoading && <p role="status">正在读取过程证据…</p>}{evidence && <div><h3>{evidence.student.displayName} · 最近 {evidence.runs.length} 次本班诊断</h3>{evidence.runs.map((run,index) => <details key={run.id} open={index === 0}><summary>诊断 #{run.id} · {STATUS[run.status]} · 提示 {run.hintLevel} 层</summary><p>首次检测：{run.initialPassed ? '通过' : '未通过'} · 当前检测：{run.diagnosis.summary}</p><p>当前建议：{run.plan.explanation}</p><div className="coach-table-scroll"><table><thead><tr><th>首次输入</th><th>首次实际</th><th>预期</th></tr></thead><tbody>{(run.initialDiagnosis ?? run.diagnosis).cases.map((row,i) => <tr key={i}><td>{Object.values(row.inputs).join(' / ')}</td><td>{Object.values(row.actual).map(v=>v==='unknown'?'未知':v).join(' / ')}</td><td>{Object.values(row.expected).join(' / ')}</td></tr>)}</tbody></table></div>{run.hints.map(hint => <article key={hint.level}><h3>{hint.level}. {hint.title}</h3><p>{hint.detail}</p></article>)}<p>修正验证 {run.events.filter(e=>e.kind==='verified').length} 次 · 复测提交 {run.events.filter(e=>e.kind==='retest_submitted').length} 次{run.retest?.result ? ` · 最近复测 ${run.retest.result.correct} / ${run.retest.result.total}` : ''}</p><CoachReferences references={run.plan.references}/></details>)}</div>}</details>
      <details><summary>审核课程依据与发布知识库段落</summary><p>确认自编材料适合本班教学，或从你自己的知识库选取一个段落。发布的是该段落的副本，请确认内容及使用范围。</p>{data.sources.map(source => <div className="teacher-coach-source-actions" key={source.id}><CoachReferences references={[source]}/>{source.review !== 'teacher' && <button type="button" className="ghost-button" disabled={busy} onClick={() => mutate('/sources', { sourceId: source.id, confirmed: true })}>确认审核并发布</button>}</div>)}
        <div className="teacher-coach-publication"><button type="button" className="ghost-button" onClick={loadDocuments}>读取我的知识库文档</button><label>知识库文档<select aria-label="发布依据的知识库文档" value={documentId} onChange={e => chooseDocument(e.target.value)}><option value="">选择文档</option>{documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>{document && <label>课程段落<select aria-label="发布课程段落" value={chunkId} onChange={e => { setChunkId(e.target.value); setConfirmed(false); }}>{document.chunks.map(c => <option key={c.id} value={c.id}>{c.pageNo ? `第${c.pageNo}页` : `第${c.chunkIndex + 1}段`} · {c.content.slice(0, 36)}</option>)}</select></label>}{chunk && <><p>{chunk.content}</p><label className="coach-consent"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>我已核对该段与全加器教学有关，且可用于本班讲解。</label><button type="button" className="primary-button" disabled={busy || !confirmed || chunk.content.length > 1800} onClick={() => mutate('/sources', { documentId: Number(documentId), chunkId: Number(chunkId), confirmed })}>发布此段为课程依据</button></>}</div>
      </details>
    </>}
    {notice && <p className="coach-pass" role="status">{notice}</p>}{error && <div className="coach-error" role="alert"><p>{error}</p><button type="button" className="ghost-button" onClick={() => setVersion(v => v + 1)}>重试读取</button></div>}
  </section>;
}
