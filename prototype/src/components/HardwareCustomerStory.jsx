import { ChatCircleText, CheckCircle, UserCircle, ArrowRight, ClipboardText } from '@phosphor-icons/react';

export function HardwareCustomerStory({profile,order,story,onAsk,onAccept,offers,onOffer,expanded,onExpand,saved}) {
  const latest=profile.questions.find(question=>question.id===story.asked.at(-1));
  return <section className={'hardware-customer-story'+(story.accepted?' accepted':'')} aria-label="客户接待">
    <header><UserCircle size={34} weight="duotone"/><div><small>客户来访 · {profile.role}</small><h2>{profile.name}<span>{order.title}</span></h2></div>
      {story.accepted&&<button type="button" aria-expanded={expanded} onClick={onExpand}><ChatCircleText size={17}/>{expanded?'收起对话':'重看客户对话'}</button>}
    </header>
    {(!story.accepted||expanded)&&<div className="hardware-conversation">
      <p className="hardware-customer-line">{profile.intro}</p>
      <div className="hardware-dialogue-choices" aria-label="追问客户需求">{profile.questions.map(question=><button key={question.id} type="button" aria-pressed={story.asked.includes(question.id)} onClick={()=>onAsk(question.id)}>{story.asked.includes(question.id)?<CheckCircle size={17} weight="fill"/>:<ChatCircleText size={17}/>}<span>{question.label}</span></button>)}</div>
      <div className="hardware-dialogue-reply" role="status"><small>{latest?`${profile.name}的回答`:'工程师提示'}</small><p>{latest?.answer??'先了解用途、容量和预算，再提出你的配置建议。也可以直接查看完整工单并接单。'}</p></div>
      <div className="hardware-offers" aria-label="配置推荐">{offers.map(offer=><article key={offer.id}><div><strong>{offer.title}</strong><b>¥{offer.price}</b></div><p>{offer.summary}</p><small>{offer.advice}</small><button type="button" onClick={()=>onOffer(offer)}>采用{offer.title}<ArrowRight size={16}/></button></article>)}</div>
    </div>}
    <div className="hardware-order-note"><ClipboardText size={19}/><div><strong>工单需求 · 元件预算 ¥{order.targets.budget}</strong><p>CPU ≥ {order.targets.cpu} · 内存 ≥ {order.targets.memory}GB · 容量 ≥ {order.targets.storageCapacity}GB · 存储速度 ≥ {order.targets.storageSpeed} · 图形 ≥ {order.targets.gpu}</p></div>
      {!story.accepted?<button className="primary-button" type="button" onClick={onAccept}>接下工单 · 开始装机<ArrowRight size={17}/></button>:<span className="hardware-order-accepted"><CheckCircle size={17}/>已接单</span>}
    </div>
    {saved===false&&<p className="hardware-story-storage" role="status">当前浏览器无法保存对话，进度仅在本次页面保留。</p>}
  </section>;
}
