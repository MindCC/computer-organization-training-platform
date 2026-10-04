import { useEffect,useState } from 'react';
import { apiRequest } from '../../apiClient.js';
import './shopServiceRecords.css';

export function ShopServiceRecords({openStudyTarget,suppliedRecords}){
  const [records,setRecords]=useState(null),[error,setError]=useState(''),[version,setVersion]=useState(0),[limit,setLimit]=useState(12);
  useEffect(()=>{let cancelled=false;setError('');if(suppliedRecords!==undefined){setRecords(suppliedRecords);return;}apiRequest('/api/student/shop-service').then(data=>{if(!cancelled)setRecords(data.records);}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[version,suppliedRecords]);
  return <section className="section-panel service-records" aria-label="维修与升级记录">
    <div className="section-heading"><div><h2>维修与升级记录</h2><p>回顾诊断、升级费用与复测结果。</p></div></div>
    {error?<><p role="alert">{error}</p><button className="ghost-button" type="button" onClick={()=>setVersion(v=>v+1)}>重试维修记录</button></>:!records?<p role="status">正在加载维修记录…</p>:!records.length?<p>还没有维修记录。进入装机店的“维修与升级工单”，开始排查一台旧电脑。</p>:<>
      <div className="service-record-list">{records.slice(0,limit).map(run=>{
        const result=run.state.result;
        return <article key={run.id}>
          <strong>{run.customer} · {run.title}</strong>
          <p>{result?`${result.passed?'验收通过':'方案待调整'} · ${result.score} / 100 · 新购元件 ¥${result.cost} · 客户任务 ${result.before}s → ${result.after}s`:`进行中 · 基线 ${Object.keys(run.state.before).length}/3 · ${run.state.diagnosis?'已确定瓶颈':'等待诊断'}`}</p>
          <small>最后更新 {new Date(run.updated_at).toLocaleString('zh-CN')}</small>
          <div><button className="ghost-button" type="button" onClick={()=>openStudyTarget({source:'service',orderId:run.order_id})}>{result?.passed?'再接同类工单':'继续维修'}</button></div>
        </article>;
      })}</div>
      {records.length>limit&&<button className="ghost-button" type="button" onClick={()=>setLimit(n=>n+12)}>查看更多维修记录（{records.length-limit}）</button>}
    </>}
  </section>;
}
