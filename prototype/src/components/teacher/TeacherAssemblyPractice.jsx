import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../apiClient.js';
import { useVisibilityInterval } from '../../hooks/useVisibilityInterval.js';
import { PRACTICE_FAULTS, practiceErrorAdvice } from '../../assemblyPractice.js';
import './teacherAssemblyPractice.css';

const modeName=r=>r.mode==='guided'?'引导练习':r.mode==='independent'?'独立练习':PRACTICE_FAULTS.find(f=>f.id===r.fault)?.title??'故障练习';
export function TeacherAssemblyPractice({classId}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[updated,setUpdated]=useState(null);
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState(null);
  const sequence=useRef(0);
  const refresh=useCallback(async()=>{
    const request=++sequence.current;setLoading(true);setError('');
    try{const next=await apiRequest(`/api/teacher/classes/${classId}/assembly-practice`);if(request===sequence.current){setData(next);setUpdated(Date.now());}}
    catch(e){if(request===sequence.current)setError(e.message);}
    finally{if(request===sequence.current)setLoading(false);}
  },[classId]);
  useEffect(()=>{void refresh();return()=>{sequence.current++;};},[refresh]);
  useVisibilityInterval(refresh,45000);
  const students=data?.students.filter(s=>(s.displayName+' '+s.username).toLowerCase().includes(query.trim().toLowerCase())
    &&(filter==='all'||filter==='active'&&s.activeCount>0||filter==='completed'&&s.completed>0||filter==='none'&&!s.completed&&!s.activeCount))??[];
  return <section className="teacher-practice" aria-label="班级装机练习">
    <header><h3>装机练习记录</h3><p>展示学生已同步的练习记录，仅供教学复盘，不计入正式成绩。统计范围为每名学生每个订单最近 20 次完成记录；离线未上传内容暂不可见。</p>
      <button className="ghost-button" type="button" onClick={refresh} disabled={loading}>{loading?'正在刷新…':'刷新练习记录'}</button>{updated&&<small> 更新于 {new Date(updated).toLocaleTimeString()} · 每 45 秒刷新</small>}
    </header>
    {error&&<p role="alert">读取失败：{error}。可点击刷新重试。{data&&'下方保留上次读取的数据。'}</p>}
    {!data&&!error&&<p role="status">正在读取练习记录…</p>}
    {data&&<><div className="metric-grid">{[['班级人数',data.summary.students],['已有练习记录',data.summary.practiced],['保留的完成记录',data.summary.completed],['未完成练习',data.summary.active]].map(([label,value])=><article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <div className="teacher-practice-filters"><label>查找学生<input aria-label="查找练习学生" value={query} onChange={e=>setQuery(e.target.value)} placeholder="姓名或学号"/></label><label>练习状态<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部学生</option><option value="active">有未完成练习</option><option value="completed">有完成记录</option><option value="none">暂无记录</option></select></label></div>
      <div className="teacher-practice-table"><table><caption>当前班级装机练习概况</caption><thead><tr>{['学生','完成 / 未完成','平均练习分','完成用时','错误 / 提示','复盘'].map(t=><th key={t} scope="col">{t}</th>)}</tr></thead><tbody>{students.map(s=><tr key={s.studentId}><th scope="row">{s.displayName}<small>{s.username}</small></th><td>{s.completed} / {s.activeCount}</td><td>{s.averageScore??'—'}</td><td>{s.seconds} 秒</td><td>{s.errors} / {s.hints}</td><td><button type="button" className="ghost-button" onClick={()=>setSelected(s.studentId)} aria-label={`查看${s.displayName}的练习复盘`}>查看复盘</button>{s.invalidRecords>0&&<small>部分记录损坏，已跳过</small>}</td></tr>)}</tbody></table></div>
      {!students.length&&<p>没有符合条件的学生记录。</p>}
    </>}
    {selected&&<PracticeDetail key={`${selected}:${updated}`} classId={classId} studentId={selected} onClose={()=>setSelected(null)}/>}
  </section>;
}

function PracticeDetail({classId,studentId,onClose}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let alive=true;setError('');apiRequest(`/api/teacher/classes/${classId}/assembly-practice/${studentId}`).then(value=>{if(alive)setData(value);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[classId,studentId,attempt]);
  return <section className="teacher-practice-detail" aria-label="学生装机练习复盘"><button type="button" className="ghost-button" onClick={onClose}>关闭练习复盘</button>
    {error?<p role="alert">读取失败：{error}<button type="button" onClick={()=>setAttempt(n=>n+1)}>重试读取复盘</button></p>:!data?<p role="status">正在读取复盘…</p>:<><h3>{data.displayName} · 装机练习复盘</h3>
      <h4>常见错误</h4><p>按保留复盘中的错误明细统计，每轮最多 20 条，不等于全部错误次数。</p>{data.commonErrors.length?<ul>{data.commonErrors.map(e=><li key={e.message}>{e.message} · {e.count} 次<p>{practiceErrorAdvice(e.message)}</p></li>)}</ul>:<p>暂无错误明细。</p>}
      <h4>未完成练习</h4>{data.active.length?data.active.map(r=><p key={r.caseId}>{r.caseTitle} · {modeName(r)} · {r.seconds} 秒 · 错误 {r.errors} / 提示 {r.hints}</p>):<p>暂无未完成练习。</p>}
      <h4>单次完成复盘</h4>{data.history.length?data.history.map(r=><details key={r.caseId+':'+r.id}><summary>{r.caseTitle} · {modeName(r)} · {r.score} 分 · {new Date(r.completedAt).toLocaleString('zh-CN')}</summary><p>用时 {r.seconds} 秒 · 错误 {r.errorCount} 次 · 提示 {r.hints} 次</p>{r.errors.length?<ol>{r.errors.map((e,i)=><li key={i}>{e}<p>{practiceErrorAdvice(e)}</p></li>)}</ol>:<p>本次没有错误记录。</p>}</details>):<p>暂无已同步的完成记录。</p>}
    </>}
  </section>;
}
