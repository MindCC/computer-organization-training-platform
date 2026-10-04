import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, ChartBar, Wrench } from '@phosphor-icons/react';
import { apiRequest } from '../apiClient.js';
import { HARDWARE_PARTS } from '../hardwareGame.js';
import { SERVICE_ORDERS, SERVICE_TESTS, serviceOrder, serviceAssemblySeed, serviceCost } from '../shopServiceGame.js';
import { assemblyDraftKey, readAssemblyDraftSelection } from '../assemblyDraft.js';
import { HardwareAssemblyWorkbench } from './HardwareAssemblyWorkbench.jsx';
import './shopService.css';

const LABELS={cpu:'处理器',memory:'内存',storage:'存储',gpu:'显卡'};
const STEPS=[['reception','接待'],['diagnosis','基线与诊断'],['upgrade','定向升级'],['retest','复测交付']];
export function ShopServiceScene({userId,initialOrderId,onExit}){
  const orderKey=`zcyl:shop-service-order:${userId}`;
  const [orderId,setOrderId]=useState(()=>{try{return serviceOrder(initialOrderId)?.id??serviceOrder(window.localStorage.getItem(orderKey))?.id??SERVICE_ORDERS[0].id;}catch{return serviceOrder(initialOrderId)?.id??SERVICE_ORDERS[0].id;}});
  useEffect(()=>{try{window.localStorage.setItem(orderKey,orderId);}catch{}},[orderId,orderKey]);
  const [run,setRun]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
  useEffect(()=>{
    let cancelled=false;setLoading(true);setError('');setRun(null);
    apiRequest('/api/student/shop-service',{method:'POST',headers:{'x-service-student':String(userId)},body:JSON.stringify({orderId})}).then(data=>{if(!cancelled)setRun(data.run);}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[orderId,userId,reload]);
  return <main className="service-game" aria-label="维修与升级工单">
    <header className="service-toolbar"><button type="button" onClick={onExit}><ArrowLeft size={18}/>返回装机店</button><div><small>芯邻装机 · 维修委托</small><h1>先找到原因，再动手升级</h1></div><span>03 张工单 · 教学模拟</span></header>
    {loading?<section className="service-surface" role="status">正在载入你的工单…</section>:error?<section className="service-surface"><p role="alert">{error}</p><button type="button" onClick={()=>setReload(n=>n+1)}>重试载入</button></section>:run&&<ServicePlay key={`${userId}:${run.id}:${reload}`} userId={userId} initialRun={run} order={serviceOrder(orderId)} onNext={()=>setOrderId(SERVICE_ORDERS[(SERVICE_ORDERS.findIndex(o=>o.id===orderId)+1)%SERVICE_ORDERS.length].id)} onReload={()=>setReload(n=>n+1)} onSelect={setOrderId}/>}
  </main>;
}

function ServicePlay({userId,initialRun,order,onNext,onReload,onSelect}){
  const storage=useMemo(()=>{try{return window.localStorage;}catch{return null;}},[]);
  const draftKey=assemblyDraftKey(userId,initialRun.id);
  const [run,setRun]=useState(initialRun),[view,setView]=useState(Object.keys(initialRun.state.before).length?'diagnosis':'reception');
  const [parts,setParts]=useState(()=>readAssemblyDraftSelection(storage,draftKey,order.baseline)),[category,setCategory]=useState(order.bottleneck);
  const [evidence,setEvidence]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const [asked,setAsked]=useState(false);
  const alive=useRef(true),pending=useRef(null),currentEvidence=useRef(null);
  currentEvidence.current=evidence;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const state=run.state,done=Boolean(state.result?.passed),baselineComplete=SERVICE_TESTS.every(t=>state.before[t.id]);
  const afterMatches=JSON.stringify(state.after.selection)===JSON.stringify(parts),retestComplete=afterMatches&&SERVICE_TESTS.every(t=>state.after[t.id]);
  const cost=serviceCost(order,parts),seed=useMemo(()=>serviceAssemblySeed(order.baseline),[order.id]);
  async function act(action,retry=false){
    if(busy||done)return;
    if(pending.current&&!retry){setError('上次操作尚未确认，请重试上次操作或重新载入工单。');return;}
    const payload=retry?pending.current:{version:run.version,operationId:crypto.randomUUID(),action};
    if(!payload)return;pending.current=payload;setBusy(true);setError('');setFeedback('');
    try{
      const response=await apiRequest(`/api/student/shop-service/${run.id}/actions`,{method:'POST',headers:{'x-service-student':String(userId)},body:JSON.stringify(payload)});
      if(!alive.current)return;setRun(response.run);pending.current=null;
      if(payload.action.type==='diagnose')setFeedback(response.run.state.diagnosis?'诊断有证据支持。去工作台拆换必要元件。':'这个判断还不能解释检测结果。看看换页量、运算和加载耗时，再试一次。');
      else if(payload.action.type==='test')setFeedback('检测已完成并同步，数据在下方更新。');
      else setFeedback(response.run.state.result.passed?'客户验收通过，维修记录已同步。':'验收未通过，可回工作台调整后重新复测。');
    }catch(e){if(alive.current){setError(e.message);if(e.status&&e.status<500)pending.current=null;}}finally{if(alive.current)setBusy(false);}
  }
  function retest(testId){if(currentEvidence.current)act({type:'test',phase:'after',testId,evidence:currentEvidence.current});}
  const result=state.result;
  return <>
    <nav className="service-steps" aria-label="维修阶段">{STEPS.map(([id,label],index)=><button type="button" key={id} aria-current={view===id?'step':undefined} disabled={busy||index>1&&!state.diagnosis} onClick={()=>setView(id)}><span>{index+1}</span>{label}</button>)}</nav>
    <div className="service-order-strip"><span>{order.name} · {order.title}</span><b>升级预算 ¥{order.budget}</b><span>客户任务 ≤ {order.maxSeconds} 秒</span></div>
    {error&&<section className="service-error" role="alert"><p>{error}</p>{pending.current&&<button type="button" disabled={busy} onClick={()=>act(null,true)}>重试上次操作</button>}<button type="button" disabled={busy} onClick={onReload}>重新载入工单</button></section>}
    {feedback&&<p className="service-feedback" role="status">{feedback}</p>}
    {view==='reception'&&<section className="service-reception"><div className="service-shop-image"><img className="service-shop-background" src="/shop-story/shop-empty.webp" alt="阳光照进芯邻装机店"/><img className="service-person" src={`/shop-story/${order.portrait}.webp`} alt={`${order.name}来店咨询电脑升级`}/><span>维修来访 · {order.role}</span></div><div className="service-reception-copy"><small>客户带来一台旧电脑</small><h2>{order.name}：{order.title}</h2><p className="service-quote">“{order.symptom}”</p><button type="button" disabled={busy} aria-expanded={asked} onClick={()=>setAsked(v=>!v)}>聊聊当时开了哪些软件</button>{asked&&<p className="service-clue">{order.clue}</p>}<dl className="service-baseline">{Object.entries(order.baseline).map(([key,id])=><div key={key}><dt>{LABELS[key]}</dt><dd>{HARDWARE_PARTS[key].find(p=>p.id===id).name}</dd></div>)}</dl><p className="service-note">资料已备份。本单保留旧机，只购买必要的新元件；不计算旧元件折价。</p><button className="service-primary" type="button" onClick={()=>setView('diagnosis')}>接下维修工单 · 开始检测<ArrowRight size={18}/></button></div></section>}
    {view==='diagnosis'&&<section className="service-surface"><div className="service-section-heading"><div><small>01 / 测量，再判断</small><h2>旧电脑的检查台</h2><p>{order.symptom}</p></div><ChartBar size={36}/></div><TestGrid results={state.before} busy={busy} done={done} onTest={testId=>act({type:'test',phase:'before',testId})}/><p className="service-note">教学模拟：固定任务参数，耗时由处理器、内存工作集和存储响应模型计算。CPU / 磁盘为耗时份额，内存为工作集占比；不能作为真实硬件跑分。</p><div className="service-diagnosis"><h3>你认为主要瓶颈在哪里？</h3><p>{baselineComplete?'比较三项检测，选出最能解释客户症状的元件。':'完成三项检测后再判断。显卡不会参与本单固定的 CPU / I/O 工作负载。'}</p><div>{Object.entries(LABELS).map(([id,label])=><button type="button" key={id} disabled={!baselineComplete||busy||done} aria-pressed={state.diagnosis===id} onClick={()=>act({type:'diagnose',category:id})}>{state.diagnosis===id&&<CheckCircle size={18}/>} {label}</button>)}</div>{state.diagnosis&&<button type="button" className="service-primary" disabled={busy} onClick={()=>setView('upgrade')}>进入 3D 升级工作台<Wrench size={18}/></button>}</div></section>}
    {state.diagnosis&&<div hidden={view!=='upgrade'}><section className="service-upgrade-note"><div><h2>保留旧机，只拆换需要的部件</h2><p>打开侧板 → 拆下旧件 → 选择新型号 → 安装与接线 → 开机自检。换 CPU 时先拆散热器；换硬盘后重接 SATA 数据与供电。</p></div><strong className={cost>order.budget?'over-budget':''}>新购元件 ¥{cost} / ¥{order.budget}</strong></section><div inert={busy||done?true:undefined}><HardwareAssemblyWorkbench key={run.id} initialAssembly={seed} requireRemoval draftStorage={storage} draftKey={draftKey} parts={parts} onPartChange={setParts} activeCategory={category} onCategoryChange={setCategory} onAssemblyEvidence={setEvidence} score={{passed:false,metrics:{totalPrice:cost},targets:{budget:order.budget}}}/></div><section className="service-workbench-next"><p>{evidence?'主机已开机，去复测相同任务，看升级有没有用。':'恢复草稿后需要重新开机。安装或型号变化后，旧自检会失效。'}</p><button type="button" className="service-primary" disabled={!evidence||busy} onClick={()=>setView('retest')}>保持开机 · 进入复测<ArrowRight size={18}/></button></section></div>}
    {view==='retest'&&<section className="service-surface"><div className="service-section-heading"><div><small>03 / 相同任务，相同参数</small><h2>升级到底有没有用？</h2><p>再做三项检测，比较旧机与当前配置。容量至少 {order.minCapacity}GB，升级费用不能超过 ¥{order.budget}。</p></div><CheckCircle size={34}/></div>{!evidence&&!done&&<p className="service-note">当前主机未开机，不能复测或交付。<button type="button" onClick={()=>setView('upgrade')}>返回工作台开机</button></p>}<TestGrid results={afterMatches?state.after:{}} before={state.before} busy={busy} done={done} disabled={!evidence} onTest={retest}/><section className="service-acceptance"><div><h3>{done?'维修完成 · 已同步回执':'客户验收'}</h3><p>{done?order.thanks:result?result.explanation:'三项复测完成后提交验收。服务器根据当前配置、任务耗时、容量与预算计算结果。'}</p>{result&&<><dl className="service-result"><div><dt>教学得分</dt><dd>{result.score} / 100</dd></div><div><dt>任务耗时</dt><dd>{result.before}s → {result.after}s</dd></div><div><dt>购件费用</dt><dd>¥{result.cost}</dd></div></dl><p>{result.explanation}{result.unnecessary.length>0?' 额外更换非瓶颈元件，每项扣 10 分。':''}{state.mistakes.length>0?` 诊断错误 ${state.mistakes.length} 次，每次扣 5 分。`:''}</p></>}</div>{done?<button className="service-primary" type="button" onClick={onNext}>下一位维修客户<ArrowRight size={18}/></button>:<button className="service-primary" type="button" disabled={!evidence||!retestComplete||busy} onClick={()=>act({type:'deliver',evidence:currentEvidence.current})}>{busy?'正在同步…':'交付升级方案'}</button>}</section></section>}
    <section className="service-order-picker" aria-label="维修工单选择"><strong>维修委托板</strong>{SERVICE_ORDERS.map(item=><button type="button" key={item.id} disabled={busy||item.id===order.id} aria-pressed={item.id===order.id} onClick={()=>onSelect(item.id)}><img src={`/shop-story/${item.portrait}.webp`} alt=""/><span><b>{item.name}</b>{item.title}</span><ArrowRight size={16}/></button>)}</section>
  </>;
}

function TestGrid({results,before,busy,disabled,done,onTest}){
  return <div className="service-test-grid">{SERVICE_TESTS.map((test,index)=>{
    const result=results[test.id];
    return <article key={test.id} className={'service-test'+(result?' measured':'')}>
      <header><span>0{index+1}</span><h3>{test.label}</h3></header>
      <p>{test.description}</p>
      <div className="service-test-reading">
        {result?<>
          <strong>{result.seconds}<small>秒</small></strong>
          {before?.[test.id]&&<span>旧机 {before[test.id].seconds}s → 当前 {result.seconds}s</span>}
          <div className="service-resource-bars">
            {[['cpu','CPU 耗时'],['memory','内存占比'],['disk','磁盘等待']].map(([key,label])=><div key={key}><span>{label}</span><div><i style={{width:`${result[key]}%`}}/></div><b>{result[key]}%</b></div>)}
          </div>
          <small>{result.swapGb?`工作集超过内存 ${result.swapGb}GB，触发换页等待`:'工作集未超过物理内存'}</small>
        </>:<span>等待检测 · 运行后显示结果</span>}
      </div>
      <button type="button" disabled={busy||disabled||done} onClick={()=>onTest(test.id)}>{busy?'正在同步检测…':result?'重新检测':'运行检测'}</button>
    </article>;
  })}</div>;
}
