import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChatCircleText, Cpu, PencilSimple, Sparkle, Wrench, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { apiRequest } from '../apiClient.js';
import { gradeHardwareOrder } from '../hardwareGame.js';
import { buildOrderOffers } from '../hardwareStory.js';
import { assemblyDraftKey, readAssemblyDraftSelection } from '../assemblyDraft.js';
import { customCustomerKey, readCustomCustomer, saveCustomCustomer } from '../customCustomerState.js';
import { HardwareAssemblyWorkbench } from './HardwareAssemblyWorkbench.jsx';
import './shopStory.css';
import './customCustomer.css';

const initialParts={cpu:'cpu-i3',memory:'mem-8',storage:'ssd-512',gpu:'gpu-integrated'};
export function CustomCustomerScene({userId,onExit}){
  const storage=useMemo(()=>{try{return window.localStorage;}catch{return null;}},[]),key=customCustomerKey(userId);
  const [saved]=useState(()=>readCustomCustomer(storage,key));
  const [form,setForm]=useState(saved.form),[portrait,setPortrait]=useState(saved.portrait),[order,setOrder]=useState(null);
  const [mode,setMode]=useState('create'),[nodeId,setNodeId]=useState(null),[accepted,setAccepted]=useState(false);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(Boolean(saved.orderId)),[error,setError]=useState(''),[saveFailed,setSaveFailed]=useState(false),[enabled,setEnabled]=useState(null);
  const [parts,setParts]=useState(initialParts),[category,setCategory]=useState('cpu'),[ready,setReady]=useState(null),[receipt,setReceipt]=useState(null),[submitting,setSubmitting]=useState(false);
  const alive=useRef(true),current=useRef(null),operation=useRef(null);
  const signature=JSON.stringify(parts),draftKey=order?assemblyDraftKey(userId,`custom-${order.id}`):null;
  current.current={id:order?.id,signature,powered:ready===signature};
  const canDeliver=ready===signature;
  const preview=order?.targets?gradeHardwareOrder(order,parts):null;
  const offers=useMemo(()=>order?.targets?buildOrderOffers(order):[],[order]);
  const node=order?.nodes.find(n=>n.id===nodeId),complete=Boolean(canDeliver&&receipt?.result.passed&&receipt.synced);
  const request=(path,options={})=>apiRequest(`/api/student/custom-customers${path}`,{...options,headers:{'x-custom-student':String(userId),...options.headers}});
  function persist(next={}){
    const value={form,portrait,orderId:order?.id??null,accepted,nodeId,...next};
    setSaveFailed(!saveCustomCustomer(storage,key,value));
  }
  useEffect(()=>{
    alive.current=true;
    request('/status').then(data=>{if(alive.current)setEnabled(data.enabled);}).catch(()=>{});
    if(saved.orderId)request(`/${saved.orderId}`).then(({order:restored})=>{
      if(!alive.current)return;setOrder(restored);setAccepted(Boolean(saved.accepted&&restored.targets));
      setNodeId(restored.nodes.some(n=>n.id===saved.nodeId)?saved.nodeId:restored.nodes[0].id);
      setParts(readAssemblyDraftSelection(storage,assemblyDraftKey(userId,`custom-${restored.id}`),initialParts));
      setMode(saved.accepted&&restored.targets?'workshop':'dialogue');
    }).catch(e=>{if(alive.current)setError('原工单未恢复：'+e.message+'。输入仍保留，可以重新生成。');}).finally(()=>{if(alive.current)setLoading(false);});
    return()=>{alive.current=false;};
  },[userId]);
  useEffect(()=>{setReceipt(null);operation.current=null;},[signature,order?.id]);
  useEffect(()=>{if(!canDeliver)setReceipt(null);},[canDeliver]);
  function changeProfile(name,value){const next={...form,profile:{...form.profile,[name]:value}};setForm(next);persist({form:next});}
  function changeForm(name,value){const next={...form,[name]:value};setForm(next);persist({form:next});}
  async function uploadPortrait(event){
    const file=event.target.files?.[0];if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2000000){setError('头像请选 2MB 以内的 PNG、JPG 或 WebP 图片。');return;}
    try{const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});if(!alive.current)return;setPortrait(url);persist({portrait:url});setError('');}catch{setError('头像读取失败，请重新选择。');}
  }
  async function generate(event){
    event.preventDefault();if(busy||loading)return;setBusy(true);setError('');
    try{
      const {order:created}=await request('',{method:'POST',body:JSON.stringify(form),timeoutMs:70000});
      if(!alive.current)return;
      setOrder(created);setAccepted(false);setReady(null);setReceipt(null);setNodeId(created.nodes[0].id);setMode('dialogue');setParts(initialParts);
      persist({orderId:created.id,accepted:false,nodeId:created.nodes[0].id});setEnabled(true);
    }catch(e){if(alive.current)setError(e.name==='AbortError'?'AI 分析超时，输入已保留，可以重试。':e.message);}finally{if(alive.current)setBusy(false);}
  }
  function choose(choice){setNodeId(choice.next);persist({nodeId:choice.next});if(choice.next===null)setMode('offers');}
  function adopt(offer){if(JSON.stringify(offer.selection)!==signature)setReady(null);setParts({...offer.selection});setReceipt(null);setMode('quote');}
  function accept(){setAccepted(true);setMode('workshop');persist({accepted:true,nodeId:null});}
  async function deliver(bootSignature){
    if((!canDeliver&&bootSignature!==signature)||!accepted||submitting)return;
    if(!canDeliver)setReady(signature);
    const submitted={...current.current};operation.current??=crypto.randomUUID();setSubmitting(true);setError('');
    try{const response=await request(`/${order.id}/receipts`,{method:'POST',body:JSON.stringify({selection:parts,operationId:operation.current})});
      if(alive.current&&current.current.id===submitted.id&&current.current.signature===submitted.signature&&current.current.powered){setReceipt(response);if(response.result.passed)setMode('receipt');}
    }catch(e){if(alive.current)setError('交付未完成：'+e.message);}finally{if(alive.current)setSubmitting(false);}
  }
  const image=portrait??'/shop-story/custom-customer.webp';
  return <div className="hardware-game-page hardware-shop-page custom-customer-page"><section className={'shop-game custom-shop'+(mode==='workshop'?' at-workbench':'')+(mode==='create'?' custom-creating':'')} aria-label="自定义客户工坊" data-custom-mode={mode}>
    <img className="shop-backdrop" src="/shop-story/shop-empty.webp" alt="阳光下的街角装机店，木质柜台与深蓝装机工作台"/>
    <header className="shop-topbar"><div className="shop-brand"><Cpu size={28}/><h1>芯邻装机</h1><span>自由客户工坊</span></div><div className="shop-tools"><button type="button" disabled={busy||submitting} onClick={()=>{setReady(null);onExit();}}><ArrowLeft size={18}/><span>返回剧情店铺</span></button>{order&&mode!=='create'&&<button type="button" disabled={submitting} onClick={()=>{setMode('create');setError('');}}><PencilSimple size={18}/><span>修改人物与需求</span></button>}</div></header>
    {mode!=='workshop'&&<img className={'shop-character custom-character'+(portrait?' uploaded':'')} src={image} alt={`${form.profile.name||'自定义客户'}的形象`}/>}
    {mode==='create'?<form className="custom-customer-form" onSubmit={generate} aria-label="人物与装机需求" aria-busy={busy||loading}><div className="custom-form-heading"><span>CREATE A CUSTOMER</span><h2>这个客人，由你定义。</h2><p>先设定人物，再说说想装怎样的电脑。故事从需求开始。</p></div>
      <fieldset disabled={busy||loading}><legend>人物设定</legend><div className="custom-field-row"><label>名字<input required maxLength={24} value={form.profile.name} onChange={e=>changeProfile('name',e.target.value)}/></label><label>职业<input required maxLength={40} placeholder="如设计师、学生、程序员" value={form.profile.occupation} onChange={e=>changeProfile('occupation',e.target.value)}/></label></div><label>性格<input required maxLength={80} value={form.profile.personality} onChange={e=>changeProfile('personality',e.target.value)}/></label>
      <div className="custom-avatar-row"><label>自选形象（可选）<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadPortrait}/></label>{portrait&&<button type="button" onClick={()=>{setPortrait(null);persist({portrait:null});}}>用原创形象</button>}</div>
      <div className="custom-field-row custom-budget"><label>元件预算（元）<input type="number" min={100} max={100000} step={1} required value={form.budget} onChange={e=>changeForm('budget',Number(e.target.value))}/></label><p>按本店教学目录计算<br/>装机服务另行报价</p></div>
      <label>装机需求<textarea required maxLength={2000} rows={4} placeholder="例如：做文档、表格和网课，资料约 300GB，至少 16GB 内存，要 SSD，不玩大型游戏。也可以提出难题，让客户和你一起讨论取舍。" value={form.requirements} onChange={e=>changeForm('requirements',e.target.value)}/></label></fieldset>
      {enabled===false&&<p className="custom-error" role="status">服务器尚未配置 DeepSeek。人物和需求可以先保存，配置后生成剧情。</p>}
      {error&&<p className="custom-error" role="alert">{error}</p>}
      <button className="custom-generate" type="submit" disabled={busy||loading||enabled===false}><Sparkle size={21}/>{loading?'正在恢复工单…':busy?'AI 正在分析需求与编写剧情…':'分析需求 · 生成客户剧情'}<ArrowRight size={18}/></button>
      <small role={busy?'status':undefined}>{busy?'正在生成，请稍候，输入已保留。':'仅发送你输入的人物、需求和公开元件目录；自选图片留在本机。'}</small>{order&&<button className="custom-resume" type="button" disabled={busy||loading} onClick={()=>setMode(accepted?'workshop':'dialogue')}>继续原工单</button>}
    </form>:mode!=='workshop'&&order&&<div className="shop-dialogue custom-dialogue" aria-label="AI 客户对话"><div className="shop-dialogue-heading"><strong>{order.profile.name}</strong><span>{order.profile.occupation} · AI 生成剧情</span>{accepted&&<button type="button" onClick={()=>setMode('workshop')}><Wrench size={18}/>回工作台</button>}</div>
      {mode==='dialogue'&&node?<><p className="shop-dialogue-line" aria-live="polite">{node.text}</p><div className="shop-choices">{node.choices.map((choice,index)=><button className={index===0?'primary':''} type="button" key={index} onClick={()=>choose(choice)}><ChatCircleText size={19}/>{choice.label}<ArrowRight size={17}/></button>)}</div></>:mode==='receipt'&&complete?<><p className="shop-dialogue-line">这台电脑已满足我们确认的需求。自由工单验收通过！</p><div className="custom-receipt"><CheckCircle size={24}/><span>服务器已记录 · 验收 {receipt.result.score} 分 · 报价 ¥{receipt.result.quotePrice} · 预计利润 ¥{receipt.result.profit}</span></div><div className="shop-choices"><button className="primary" type="button" onClick={()=>setMode('create')}>再定义一位客户<ArrowRight size={18}/></button><button type="button" onClick={()=>setMode('workshop')}>回工作台看看<Wrench size={18}/></button></div></>:<>
        <p className="shop-dialogue-line">{order.summary}</p><details className="custom-analysis"><summary>查看 AI 需求分析与配置目标</summary><p>{order.reasoning}</p>{order.targets&&<p>元件预算 ¥{order.targets.budget} · CPU ≥ {order.targets.cpu} · 内存 ≥ {order.targets.memory}GB · 容量 ≥ {order.targets.storageCapacity}GB · 存储速度 ≥ {order.targets.storageSpeed} · 图形 ≥ {order.targets.gpu}</p>}</details>
        {!order.targets?<div className="custom-questions"><strong>还需要确认这些信息</strong>{order.questions.map(q=><p key={q}>{q}</p>)}<button type="button" className="primary" onClick={()=>setMode('create')}>补充需求 · 重新分析<PencilSimple size={18}/></button></div>:mode==='quote'?<><div className="shop-quote"><span>元件 <b>¥{preview.metrics.totalPrice}</b></span><span>服务与加价 <b>¥{preview.quotePrice-preview.metrics.totalPrice}</b></span><span>交付总报价 <b>¥{preview.quotePrice}</b></span></div><div className="shop-choices"><button className="primary" type="button" onClick={accept}>接下自由工单 · 开始装机<Wrench size={19}/></button><button type="button" onClick={()=>setMode('offers')}>再比较方案</button></div></>:<><div className="shop-offers" aria-label="自由工单配置推荐">{offers.map(offer=><article key={offer.id}><header><strong>{offer.title}</strong><b>¥{offer.price}<small>元件</small></b></header><p>{offer.summary}</p><small>{offer.advice}</small><button className={offer.id==='economy'?'primary':''} type="button" disabled={!offer.passed} onClick={()=>adopt(offer)}>采用{offer.title}<ArrowRight size={18}/></button></article>)}</div>{!offers.some(o=>o.passed)&&<p className="custom-shortfall"><WarningCircle size={19}/>现有元件或预算不能完整满足需求。请和客户确认取舍，补充需求重新分析。</p>}<button className="custom-edit-link" type="button" onClick={()=>setMode('create')}>补充或修改需求<PencilSimple size={16}/></button></>}
      </>}
      {error&&<p className="custom-error" role="alert">{error}</p>}
    </div>}
    {accepted&&order?.targets&&<div className="shop-workbench-wrap" hidden={mode!=='workshop'}><div className="shop-workbench-top"><button type="button" disabled={submitting} onClick={()=>setMode('offers')}><ArrowLeft size={17}/>返回客户柜台</button><span>{order.profile.name}的自由工单 · 元件预算 ¥{order.targets.budget}</span></div>
      <HardwareAssemblyWorkbench key={draftKey} draftKey={draftKey} draftStorage={storage} parts={parts} onPartChange={setParts} score={preview} activeCategory={category} onCategoryChange={setCategory} onAssemblyReady={setReady} onDeliver={deliver} deliveryPending={submitting}/>
      <section className="hardware-delivery" aria-label="自由工单验收"><div><h2>{receipt?receipt.result.passed?'客户需求已满足':'还有需求未满足':canDeliver?'主机已启动，准备交付':'完成装机与开机自检'}</h2><p>{receipt?.result.explanation??preview.explanation}</p><small>元件成本 ¥{preview.metrics.totalPrice} · 交付报价 ¥{preview.quotePrice} · 预计利润 ¥{preview.profit}</small>{error&&<p className="custom-error" role="alert">{error}</p>}</div><button className="primary-button" type="button" disabled={!accepted||!canDeliver||submitting} onClick={deliver}>{submitting?'正在验收…':'交付自定义工单'}</button></section>
    </div>}
    {saveFailed&&<p className="custom-save-warning" role="status">浏览器保存失败，进度仍在本次页面保留。</p>}
  </section></div>;
}
