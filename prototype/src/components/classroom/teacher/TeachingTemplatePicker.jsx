import { useEffect, useState } from 'react';
import { COURSE_CHAPTERS } from '../../../courseChapters.js';
import { TEACHING_TEMPLATES,buildTeachingTemplate } from '../../../shared/teachingLoop.js';

export function TeachingTemplatePicker({onUse,initialChapterId='ch1'}){
  const [chapter,setChapter]=useState(initialChapterId),[extra,setExtra]=useState('');
  useEffect(()=>{setChapter(initialChapterId);setExtra(current=>current===initialChapterId?'':current);},[initialChapterId]);
  return <section className="teaching-template-picker" aria-label="通用教学模板库"><h3>通用教学模板库</h3><p>预设教学流程，按所选章节填入资源。采用后可修改节点、知识目标和题目。</p>
    <div className="teaching-template-scope"><label>模板应用章节<select aria-label="模板应用章节" value={chapter} onChange={e=>{setChapter(e.target.value);if(extra===e.target.value)setExtra('');}}>{COURSE_CHAPTERS.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label>跨章节组合（可选）<select aria-label="跨章节组合" value={extra} onChange={e=>setExtra(e.target.value)}><option value="">仅当前章节</option>{COURSE_CHAPTERS.filter(c=>c.id!==chapter).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label></div>
    <div className="chain-template-picker">{TEACHING_TEMPLATES.map(t=><button type="button" key={t.id} onClick={()=>onUse(buildTeachingTemplate(t.id,[chapter,...(extra?[extra]:[])]))}><strong>{t.title}</strong><small>{t.description}</small></button>)}</div>
  </section>;
}

export function RecipientPicker({roster,ids,onChange,disabled=false}){
  return <fieldset className="teaching-recipients"><legend>目标学生 · 已选 {ids.length} 人</legend><div className="teaching-recipient-actions"><button type="button" className="ghost-button" disabled={disabled} onClick={()=>onChange(roster.map(s=>s.studentId))}>全选</button><button type="button" className="ghost-button" disabled={disabled} onClick={()=>onChange([])}>清空</button></div><div>{roster.map(s=><label key={s.studentId}><input type="checkbox" disabled={disabled} checked={ids.includes(s.studentId)} onChange={e=>onChange(e.target.checked?[...ids,s.studentId]:ids.filter(id=>id!==s.studentId))}/>{s.displayName}</label>)}</div></fieldset>;
}
