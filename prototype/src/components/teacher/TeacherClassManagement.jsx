import { useEffect, useRef, useState } from 'react';
import { api } from '../../apiClient.js';
import { StudentImportPanel } from './StudentImportPanel.jsx';
import './classManagement.css';

export function TeacherClassManagement({ selectedClass, overview, onClassesChanged, onBack, createRequest, isDemoTeacher }) {
  const [creating,setCreating] = useState(Boolean(createRequest) || !selectedClass), [name,setName] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const pending = useRef(false), createTitle = useRef(null);
  useEffect(()=>{if(createRequest){setCreating(true);setError('');setNotice('');}},[createRequest]);
  useEffect(()=>{if(creating) createTitle.current?.focus();},[creating]);
  useEffect(()=>{setError('');},[selectedClass?.id]);
  async function create(event) {
    event.preventDefault(); if(pending.current || !name.trim()) return;
    pending.current=true;setBusy(true);setError('');setNotice('');
    try {
      const {class:created}=await api.createClass({name:name.trim()});
      setCreating(false);setName('');setNotice(`班级已创建：${created.name}。接下来导入学生名单。`);
      try {await onClassesChanged(created.id);} catch {setError('班级已创建，列表刷新失败。请刷新班级名单后选择新班级。');}
    }catch(failure){setError(failure.message);}
    finally{pending.current=false;setBusy(false);}
  }
  const ready=Boolean(selectedClass) && overview?.classId === selectedClass.id;
  const students=ready ? overview.students??[] : [];
  return <section className="class-management" data-testid="class-management" aria-labelledby="class-management-heading">
    <header className="class-management-heading"><div><span className="eyebrow">班级与学生</span><h2 id="class-management-heading">班级管理</h2><p>创建班级、导入学生，再核对名单并开始教学。</p></div><div className="class-management-actions"><button className="ghost-button" type="button" disabled={busy} onClick={onBack}>返回教学活动</button>{!creating&&<button className="primary-button" type="button" onClick={()=>{setCreating(true);setNotice('');}}>新建班级</button>}</div></header>
    {creating && <form className="class-create-form" onSubmit={create}><h3>第一步 · 创建班级</h3><label>新班级名称<input ref={createTitle} aria-label="新班级名称" required maxLength={80} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="例如：2026级计算机组成原理一班"/></label><div className="class-management-actions"><button className="primary-button" type="submit" disabled={busy || !name.trim()}>{busy?'正在创建…':'确认创建班级'}</button><button className="ghost-button" type="button" disabled={busy} onClick={()=>{setCreating(false);setName('');setError('');}}>取消创建</button></div></form>}
    {notice&&<p className="note-success" role="status">{notice}</p>}{error&&<p className="note-error" role="alert">{error}</p>}
    {selectedClass ? <div className="class-management-grid"><StudentImportPanel key={selectedClass.id} classId={selectedClass.id} className={selectedClass.name} onImported={onClassesChanged} isDemoTeacher={isDemoTeacher}/><section className="class-roster" aria-label="当前班级学生名单"><header><div><span className="eyebrow">第三步 · 核对名单</span><h3>{selectedClass.name} · {selectedClass.studentCount??students.length} 名学生</h3></div><button className="ghost-button" type="button" onClick={async()=>{try{await onClassesChanged(selectedClass.id);setError('');}catch(failure){setError(failure.message);}}}>刷新班级名单</button></header>{!ready?<p role="status">正在读取学生名单…</p>:students.length?<div className="class-roster-table"><table><thead><tr><th>学号</th><th>姓名</th></tr></thead><tbody>{students.map(student=><tr key={student.id}><td>{student.username}</td><td>{student.displayName}</td></tr>)}</tbody></table></div>:<p className="class-form-note">班级已就绪，暂无学生。导入后会在这里显示名单。</p>}</section></div>:!creating&&<p>还没有班级，点击“新建班级”开始。</p>}
  </section>;
}
