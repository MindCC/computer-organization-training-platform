import { useRef, useState } from 'react';
import { api } from '../../apiClient.js';
import { downloadCredentialsCsv } from '../../importCredentials.js';
import './classManagement.css';

export const STUDENT_TEMPLATE = 'data:text/csv;charset=utf-8,%EF%BB%BF%E5%AD%A6%E5%8F%B7%2C%E5%A7%93%E5%90%8D%2C%E5%88%9D%E5%A7%8B%E5%AF%86%E7%A0%81%0A2026001%2C%E6%9D%8E%E5%90%8C%E5%AD%A6%2C';

export function StudentImportPanel({ classId, className, onImported, isDemoTeacher = false }) {
  const [csv, setCsv] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [report, setReport] = useState(null), [fileName, setFileName] = useState('');
  const pending = useRef(false);
  async function readFile(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setError('');
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('请选择CSV文件；Excel工作簿请先另存为CSV。'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('CSV文件不能超过2MB，请拆分后导入。'); return; }
    pending.current = true; setBusy(true);
    try {
      const bytes = await file.arrayBuffer(); let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = new TextDecoder('gb18030', { fatal: true }).decode(bytes); }
      setCsv(text.replace(/^\uFEFF/, '')); setFileName(file.name);
    } catch { setError('无法读取CSV文件，请检查编码或粘贴文本。'); }
    finally {pending.current = false; setBusy(false);}
  }
  async function importStudents(event) {
    event.preventDefault(); if (pending.current || !classId || !csv.trim()) return;
    const targetClassId = classId; pending.current = true; setBusy(true); setError('');
    try {
      const result = await api.importStudents(targetClassId, csv); setReport(result);
      try { await onImported(targetClassId); } catch { setError('导入结果已保存，名单刷新失败。请刷新班级名单核对。'); }
    } catch (failure) { setError(failure.message); }
    finally {pending.current = false; setBusy(false);}
  }
  if (isDemoTeacher) return <section className="class-import-panel" data-testid="student-import"><h3>学生名单</h3><p>演示教师使用已有演示学生。导入正式学生请使用正式教师账号。</p></section>;
  return <section className="class-import-panel" data-testid="student-import" aria-label="导入班级学生">
    <header><span className="eyebrow">第二步 · 导入学生</span><h3>{className ?? '请先创建或选择班级'}</h3><p>列顺序：学号、姓名、初始密码。初始密码可留空，系统生成后可下载发放；重复导入不会重置已有账号密码。</p></header>
    <form onSubmit={importStudents}>
      <fieldset disabled={busy || !classId}><legend className="sr-only">导入学生名单</legend>
        <div className="class-import-tools"><a className="ghost-button" download="student-import-template.csv" href={STUDENT_TEMPLATE}>下载学生导入模板</a><label className="class-file-input">选择CSV文件<input aria-label="选择学生CSV文件" type="file" accept=".csv,text/csv" onChange={readFile}/></label></div>
        {fileName && <p className="class-form-note">已读取：{fileName}，请核对下面的文本。</p>}
        <label className="class-csv-label">学生名单文本<textarea aria-label="学生导入 CSV" value={csv} onChange={e=>{setCsv(e.target.value);setFileName('');setError('');}} placeholder={'学号,姓名,初始密码\n2026001,李同学,'}/></label>
        <button className="primary-button" type="submit" disabled={busy || !classId || !csv.trim()}>{busy ? '正在导入…' : '导入学生'}</button>
      </fieldset>
    </form>
    {error && <p className="note-error" role="alert">{error}</p>}
    {report && <div className="class-import-result"><p className="note-success" role="status">导入完成：新增 {report.imported}，已有账号加入或更新 {report.updated}，跳过 {report.skipped}。</p>{report.errors?.length > 0 && <div><strong>请修改以下行后重新导入</strong><ul>{report.errors.map((item,index)=><li key={index}>第{item.line}行：{item.message}</li>)}</ul></div>}
      {report.credentials?.length > 0 && <div className="teacher-import-credentials"><strong>新账号初始口令</strong><p>关闭本页后不会再次显示，请先下载并发放给学生。</p><div className="teacher-credential-list">{report.credentials.map(item=><div className="teacher-credential-row" key={item.username}><span>{item.username}</span><span>{item.displayName}</span><code>{item.password}</code></div>)}</div><button className="ghost-button" type="button" onClick={()=>downloadCredentialsCsv(report.credentials)}>下载初始口令 CSV</button></div>}
    </div>}
  </section>;
}
