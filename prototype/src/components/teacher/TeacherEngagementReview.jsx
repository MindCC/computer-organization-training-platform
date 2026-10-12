import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../apiClient.js';
import '../learning/studyEngagement.css';
const fields=[['dayTarget','任务天数目标'],['questionTarget','不同题目目标'],['labTarget','不同实验目标'],['followThroughTarget','后续行动目标']];
export function TeacherEngagementReview({classId,studentId,refreshVersion}) {
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const seq=useRef(0);const base=`/api/teacher/classes/${classId}/study-engagement`;
  async function refresh(){const current=++seq.current;try{const result=await apiRequest(base);if(current===seq.current){setData(result);setDraft(result.policy);setDirty(false);setError('');}}catch(e){if(current===seq.current)setError(e.message);}}
  useEffect(()=>{setData(null);setDraft(null);setNotice('');refresh();return()=>{seq.current++;};},[classId,refreshVersion]);
  function change(key,value){setDraft(d=>({...d,[key]:value}));setDirty(true);setNotice('');}
  async function save(event){event.preventDefault();setBusy(true);setError('');try{await apiRequest(base+'/policy',{method:'POST',body:JSON.stringify(draft)});await refresh();setNotice('班级规则已保存，请按新规则审核学生加分。');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function confirm(student,bonus,reason,requestId){setBusy(true);setError('');try{await apiRequest(base+'/confirm',{method:'POST',body:JSON.stringify({studentId:student.id,reviewToken:student.reviewToken,bonus,reason,clientSubmissionId:requestId})});await refresh();setNotice('已确认平时加分，审核依据已保存。');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function exportCsv(){setBusy(true);setError('');try{const csv=await apiRequest(base+'/export.csv');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='小芯默契值与平时加分.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <section className="section-panel teacher-review-analysis" aria-label="默契值与平时加分审核" data-testid="teacher-engagement-review">
    <div className="section-heading"><div><h2>小芯默契值 · 平时加分审核</h2><p>按班级设置上限、核对参与依据，再确认加分。每人采用当前规则下最近一次确认，可导出登记。</p></div><button type="button" className="ghost-button" onClick={exportCsv} disabled={!data||busy}>导出加分明细</button></div>
    {error&&<p role="alert">{error}<button type="button" className="ghost-button" onClick={refresh}>刷新依据</button></p>}{notice&&<p role="status">{notice}</p>}
    {!data&&!error&&<p role="status">正在整理学习参与记录…</p>}
    {draft&&<><form onSubmit={save}><fieldset disabled={!data.canManage||busy}><legend>班级加分规则 · 版本 {data.policy.version}</legend><div className="engagement-review-controls">
      <label>统计开始日期<input type="date" value={draft.startDate} onChange={e=>change('startDate',e.target.value)} required/></label><label>统计结束日期<input type="date" value={draft.endDate} onChange={e=>change('endDate',e.target.value)} required/></label>
      <label>平时加分上限<input type="number" min="0" max="100" step="0.01" value={draft.bonusCap} onChange={e=>change('bonusCap',Number(e.target.value))} required/></label>
      {fields.map(([key,label])=><label key={key}>{label}<input type="number" min="1" max={key==='dayTarget'?366:key==='questionTarget'?1000:100} step="1" value={draft[key]} onChange={e=>change(key,Number(e.target.value))} required/></label>)}
    </div><p>持续任务20 + 不同题目30 + 不同实验30 + 后续行动20，各项达到目标即封顶；建议加分 = 班级上限 × 默契值 / 100。</p><button className="primary-button" type="submit" disabled={!dirty||busy}>保存班级加分规则</button></fieldset></form>
    {!data.canManage&&<p>当前班级为只读查看，班级属主教师可设置规则与审核。</p>}
    {data.policy.bonusCap===0&&<p>尚未启用平时加分，请先设置班级上限。</p>}{dirty&&<p role="status">规则有未保存的修改，请先保存，再审核。</p>}
    <div className="engagement-review-table"><table><thead><tr><th>学生</th><th>默契值</th><th>参与与正确情况</th><th>依据明细</th><th>平时加分</th></tr></thead><tbody>{data.students.filter(s=>!studentId||studentId==='all'||String(s.id)===String(studentId)).map(s=><tr key={s.id} data-engagement-student={s.id}>
      <td><strong>{s.displayName}</strong><small>{s.username}</small></td><td><b>{s.score} / 100</b>{s.dimensions.map(d=><small key={d.label}>{d.label} {d.points}/{d.maximum} · {d.count}/{d.target}</small>)}</td>
      <td>任务提交 {s.activeDays} 天<small>登录 {s.loginDays} 天 · 访问 {s.visits} 天</small><small>不同题 {s.questions} 道，最新正确 {s.correctQuestions} 道</small><small>实验 {s.labs} 项，完成 {s.completedLabs} 项</small><small>后续行动 {s.followThrough} 项 · 课程提问 {s.questionHistoryCount} 次</small></td>
      <td><details><summary>查看实验与答题时间</summary><div className="engagement-review-evidence"><p>{s.observationNote}</p>{s.labDetails.length>0&&<ul>{s.labDetails.map(l=><li key={l.challengeId}>{l.title}：{l.completed?'已完成':'已参与'} · {l.submissions} 次提交 · 观测用时 {l.elapsedMinutes.toFixed(2)} 分钟</li>)}</ul>}<p>已采集 {s.timingCount} 条题目时间，显示最近100条。其余历史题目未采集时间。</p>{s.timings.map((t,index)=><details key={`${t.questionId}:${t.createdAt}:${index}`}><summary>{t.createdAt} · {t.correct?'正确':'待订正'}</summary><p>{t.stem}</p><p>首次作答前可见停留：{t.firstAnswerMs===null?'未采集首次作答':(t.firstAnswerMs/1000).toFixed(1)+' 秒'}；首次作答后活动：{t.answerActiveMs===null?'未采集':(t.answerActiveMs/1000).toFixed(1)+' 秒'}；可见活动合计 {(t.visibleActiveMs/1000).toFixed(1)} 秒。</p></details>)}</div></details></td>
      <td><small>建议 +{s.suggestedBonus} 分 · 上限 {data.policy.bonusCap}</small>{s.confirmation&&<details><summary>已确认 +{s.confirmation.bonus} 分</summary><p>{s.confirmation.createdAt} · {s.confirmation.reason||'按建议确认'}</p><p>确认时默契值 {s.confirmation.snapshot.score}；规则版本 {s.confirmation.snapshot.policy.version}；建议 +{s.confirmation.snapshot.suggestedBonus}。</p></details>}
      {!s.confirmation&&s.previousConfirmation&&<details><summary>旧规则曾确认 +{s.previousConfirmation.bonus} 分 · 待复核</summary><p>{s.previousConfirmation.createdAt} · 规则版本 {s.previousConfirmation.snapshot.policy.version} · 默契值 {s.previousConfirmation.snapshot.score}</p><p>{s.previousConfirmation.reason||'按旧规则建议确认'}</p></details>}
      {data.canManage&&<BonusEditor key={`${s.id}:${s.reviewToken}:${s.confirmation?.id??''}`} student={s} cap={data.policy.bonusCap} disabled={busy||dirty||data.policy.bonusCap<=0} onConfirm={confirm}/>}</td>
    </tr>)}</tbody></table></div></>}
  </section>;
}
function BonusEditor({student,cap,disabled,onConfirm}) {
  const [bonus,setBonus]=useState(student.suggestedBonus),[reason,setReason]=useState(''),submission=useRef(null);
  function changed(fn,value){submission.current=null;fn(value);}
  return <form className="engagement-bonus-editor" onSubmit={e=>{e.preventDefault();submission.current??=crypto.randomUUID();onConfirm(student,Number(bonus),reason,submission.current);}}>
    <label>审核加分<input aria-label={`审核加分 ${student.username}`} type="number" min="0" max={cap} step="0.01" value={bonus} onChange={e=>changed(setBonus,e.target.value)} disabled={disabled} required/></label>
    <label>审核理由<textarea aria-label={`审核理由 ${student.username}`} value={reason} maxLength={500} rows={2} onChange={e=>changed(setReason,e.target.value)} disabled={disabled} required={Number(bonus)!==student.suggestedBonus} placeholder="调整加分需说明理由"/></label>
    <button className="primary-button" type="submit" disabled={disabled}>{student.confirmation?'重新审核确认':'审核并确认加分'}</button>
  </form>;
}
