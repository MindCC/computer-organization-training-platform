const fields={focus:'教学重点',steps:'课堂步骤',teacherScript:'讲解提示',removed:'教学安排已移除'};
export function AssistantDecisionPanel({report,review,plan,open=false}) {
  if(!report)return null;
  const original=report.report;
  const differences=plan?Object.keys(fields).filter(key=>key!=='removed'&&JSON.stringify(plan[key])!==JSON.stringify(({focus:original.lessonFocus,steps:original.nextClassPlan,teacherScript:original.teacherScript})[key])):['removed'];
  return <details className="assistant-decision-panel" open={open}>
    <summary>建议来源与教师调整记录 · 报告 #{report.reportId}</summary>
    <p>{report.source==='ai'?'DeepSeek 建议':'本地规则建议'} · 来源班级 #{report.sourceClassId??'已删除'} · {report.generatedAt?new Date(report.generatedAt).toLocaleString():'生成时间未记录'}</p>
    <p>原始报告由服务器保存。依据和修改记录仅教师可见；学生收到已发布的教学任务。</p>
    <h4>原始教学重点</h4><p>{original.lessonFocus}</p>
    <details><summary>原始讲解提示</summary><p>{original.teacherScript}</p></details>
    <h4>原始安排及依据</h4>
    {(original.planItems??original.nextClassPlan.map((text,index)=>({id:`P${index+1}`,text,evidence:[]}))).map(item=><article key={item.id}><p><b>{item.id}</b> · {item.text}</p>{item.evidence?.length?item.evidence.map(e=><small key={e.id}>依据 {e.id} · {e.label} · {e.count} {e.type==='class_summary'?'人':'条关联记录'}</small>):<small>旧报告未记录逐条依据。</small>}</article>)}
    <p aria-live="polite">本次相对原建议的调整：{differences.length?differences.map(key=>fields[key]).join('、'):'教学安排文字保持原建议'}。任务节点以教师最终保存内容为准。</p>
    {review?.decisions?.length>0&&<section aria-label="已保存的教师调整"><h4>最近保存记录</h4>{review.decisions.map(d=><details key={d.revision}><summary>版本 {d.revision} · {d.changedFields.length?d.changedFields.map(key=>fields[key]).join('、'):'采用原教学安排'} · {d.savedAt} UTC</summary><p>{d.note||'未填写调整说明'}</p><p>任务：{d.taskTitle}</p><p>节点：{d.stageTitles.join(' → ')}</p>{d.lessonPlan&&<><p>重点：{d.lessonPlan.focus}</p><ol>{d.lessonPlan.steps.map((s,i)=><li key={i}>{s}</li>)}</ol><p>讲解：{d.lessonPlan.teacherScript}</p></>}</details>)}</section>}
    {review?.publications?.length>0&&<section aria-label="建议关联的发布记录"><h4>发布记录</h4>{review.publications.map(p=><p key={p.sessionId}>版本 {p.revision} → 课堂 #{p.sessionId} · 班级 #{p.classId} · {p.publishedAt} UTC</p>)}</section>}
  </details>;
}
