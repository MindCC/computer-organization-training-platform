import './studyEngagement.css';
export function StudyEngagement({data,error,refresh,compact=false}) {
  if(!data)return error?<p role="alert">默契值暂未同步。<button type="button" className="ghost-button" onClick={refresh}>重试</button></p>:null;
  return <section className={`study-engagement ${compact?'compact':''}`} aria-label="小芯默契值" data-testid="study-engagement">
    <div className="engagement-heading"><strong>小芯 · {data.level}</strong><b>{data.score}<small> / 100 默契值</small></b></div>
    <p>个人近30天 · {data.policy.startDate} 至 {data.policy.endDate} · 有任务提交 {data.activeDays} 天</p>
    {!compact&&<div className="engagement-dimensions">{data.dimensions.map(d=><div key={d.label}><span>{d.label}</span><strong>{d.points} / {d.maximum}</strong><small>{d.count} / {d.target} 项</small></div>)}</div>}
    <details><summary>查看默契值依据</summary><p>{data.rules}</p><p>登录 {data.loginDays} 天 · 访问 {data.visits} 天 · 已答 {data.questions} 道不同题（最新正确 {data.correctQuestions} 道） · 实验提交 {data.labs} 项（完成 {data.completedLabs} 项）</p><p>{data.observationNote}</p><p>平时分由老师设置班级上限并审核确认。</p></details>
    {data.memory.length>0&&<details className="engagement-memory"><summary>小芯记得你的课程问题</summary>{data.memory.map(m=><article key={m.id}><small>{m.createdAt} · {m.topic}</small><p>你问过：{m.question}</p></article>)}<p>历史保存在平台内；本次答疑选取后才会发送给助教服务。</p></details>}
    {data.confirmedBonuses.length>0&&<details><summary>老师已确认的平时加分</summary>{data.confirmedBonuses.map(b=><p key={b.id}>{b.className}：+{b.bonus} 分 · {b.startDate} 至 {b.endDate} · {b.reason||'按学习参与依据确认'} · {b.createdAt}{b.needsReview?' · 班级规则已变化，等待教师按新规则复核':''}</p>)}</details>}
  </section>;
}
