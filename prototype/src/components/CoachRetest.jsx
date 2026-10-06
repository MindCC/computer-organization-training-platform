export function CoachRetest({run,answers,setAnswers,busy,onSubmit}){
  const test=run.retest;
  const setAnswer=(id,index,value)=>setAnswers(current=>{const length=test.questions.find(q=>q.id===id).outputs?.length??2;const row=[...(current[id]??Array(length).fill(''))];row[index]=value===''?'':Number(value);return {...current,[id]:row};});
  return <section className="coach-retest" aria-label={`${run.challengeTitle??'全加器'}变式复测`}>
    <div className="coach-subheading"><h3>变式复测 · 第 {test.attempt} 次</h3><span>{test.usedHint?'复测期间请求过提示':'复测期间尚未请求新提示'}</span></div>
    {test.coverage&&<p className="coach-note">{test.coverage.note}</p>}
    {test.result&&<p className={test.result.passed?'coach-pass':'coach-fail'} role="status">服务器判分：{test.result.correct} / {test.result.total} 题通过。{test.result.passed?`已保存复测结果${run.taskId?'；关联的教师补练已完成':''}。`:'请对照错题原因，再换一组题复测。'}</p>}
    <details open={!test.result}><summary>{test.result?'查看本次作答与解析':`完成下面${test.questions.length===4?'四':test.questions.length}道复测题`}</summary><p>独立预测给定输入的输出，用十进制填写；正式实验成绩保持原记录。</p>
      <form onSubmit={e=>{e.preventDefault();onSubmit(answers);}}>{test.questions.map((q,i)=>{
        const generic=q.kind==='circuit_prediction';
        const outputs=generic?q.outputs:[{label:`结果低 ${q.width} 位`,min:0,max:(1<<q.width)-1},{label:'输出进位',min:0,max:1}];
        return <fieldset key={q.id}><legend>{i+1}. {generic?Object.entries(q.inputs).map(([label,value])=>`${label}=${value}`).join('，'):`${q.width===1?'一位全加器':'两位加法迁移'}：A=${q.a}，B=${q.b}，Cin=${q.cin}`}</legend>
          <div className="coach-answer-fields">{outputs.map((output,j)=>{
            const value=test.result?.rows[i].answer[j]??answers[q.id]?.[j]??'';
            const name=generic?`第${i+1}题输出${j+1}`:`第${i+1}题${j===0?'结果':'进位'}`;
            return <label key={j}>{output.label}{output.max-output.min<=16?<select aria-label={name} required value={value} disabled={busy||Boolean(test.result)} onChange={e=>setAnswer(q.id,j,e.target.value)}><option value="">请选择</option>{Array.from({length:output.max-output.min+1},(_,v)=>v+output.min).map(v=><option key={v} value={v}>{v}</option>)}</select>:<input aria-label={name} type="number" min={output.min} max={output.max} step={1} required value={value} disabled={busy||Boolean(test.result)} onChange={e=>setAnswer(q.id,j,e.target.value)}/>}</label>;
          })}</div>
          {test.result&&<p className={test.result.rows[i].passed?'coach-pass':'coach-fail'}>原作答 {test.result.rows[i].answer.join(' / ')} · {test.result.rows[i].passed?'通过':`未通过，参考 ${test.result.rows[i].expected.join(' / ')}`}</p>}
        </fieldset>;
      })}{!test.result&&<button type="submit" className="primary-button" disabled={busy}>提交复测并判分</button>}</form>
    </details>
  </section>;
}
