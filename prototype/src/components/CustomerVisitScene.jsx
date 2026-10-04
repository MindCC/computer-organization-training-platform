import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChatCircleText, CheckCircle, ClipboardText, Cpu, List, SpeakerHigh, SpeakerSlash, Wrench, X } from '@phosphor-icons/react';
import './shopStory.css';

export function CustomerVisitScene({ profile, order, story, onAsk, onAccept, onOffer, offers, preview, delivered, receipt, workshopOpen, onWorkshop, onReception, onNextCustomer, nextCustomerName, onReturn, onCustom, onPractice, soundOn, onSound, orders, children, saved }) {
  const [view, setView] = useState(story.accepted ? 'workshop' : 'questions');
  const [panel, setPanel] = useState(null), [portraitFailed, setPortraitFailed] = useState(false);
  const panelRef = useRef(null);
  const latest = profile.questions.find(question => question.id === story.asked.at(-1));
  useEffect(() => { if (delivered) { setView('thanks'); onReception(); } else setView(current => current === 'thanks' ? 'workshop' : current); }, [delivered]);
  useEffect(() => {
    if (!panel) return;
    const previous = document.activeElement;
    panelRef.current?.querySelector('button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [panel]);
  function panelKeyboard(event) {
    if (event.key === 'Escape') { setPanel(null); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...panelRef.current.querySelectorAll('button:not(:disabled)')].filter(button => button.getClientRects().length);
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  const line = view === 'thanks' ? profile.thanks : view === 'workshop' ? '我在柜台等你。装好以后，我们一起看看验机结果。' : view === 'quote' ? profile.quoteLine : view === 'offers' ? profile.offersLine : latest?.answer ?? profile.intro;
  return <section className={'shop-game customer-visit-game' + (workshopOpen ? ' at-workbench' : '')} aria-label="芯邻装机店" data-customer={profile.name}>
    <img className="shop-backdrop" src="/shop-story/shop-empty.webp" alt="阳光照进街角装机店，右侧是装机工作台和元件架" fetchPriority="high" />
    <header className="shop-topbar"><div className="shop-brand"><Cpu size={29} weight="duotone" /><h1>芯邻装机</h1><span>客户来访 · {profile.role}</span></div><div className="shop-tools">
      <button type="button" className="shop-custom-entry" onClick={onCustom}><ChatCircleText size={19} /><span>自定义客户 · AI</span></button>
      <button type="button" aria-label={soundOn ? '声音已开启' : '声音已关闭'} aria-pressed={soundOn} onClick={onSound}>{soundOn ? <SpeakerHigh size={22} /> : <SpeakerSlash size={22} />}</button>
      <button type="button" aria-label="订单与练习" aria-expanded={panel === 'menu'} onClick={() => setPanel(panel === 'menu' ? null : 'menu')}><List size={22} /></button>
    </div></header>
    <div className="shop-workbench-wrap" hidden={!workshopOpen}><div className="shop-workbench-top"><button type="button" onClick={onReception}><ArrowRight size={17} className="shop-return-arrow" />返回店铺柜台</button><span>{profile.name}的工单 · {order.title} · 元件预算 ¥{order.targets.budget}</span><button type="button" onClick={() => setPanel('note')}><ClipboardText size={18} />需求工单</button></div>{children}</div>
    {!workshopOpen && <>
      {!portraitFailed && <img className="shop-character" src={profile.portrait} alt={profile.portraitAlt} onError={() => setPortraitFailed(true)} />}
      <section className="shop-dialogue" aria-label="客户接待"><button className="shop-hotspot" type="button" onClick={() => story.accepted ? onWorkshop() : setPanel('note')}><Wrench size={20} />装机工作台<ArrowRight size={16} /></button>
        <div className="shop-dialogue-heading"><strong>{profile.name}</strong><span>客户来访 · {profile.role}{story.accepted ? ' · 已接单' : ''}</span><button type="button" aria-label="查看需求工单" onClick={() => setPanel('note')}><ClipboardText size={19} /></button></div>
        <p className="shop-dialogue-line" aria-live="polite">{line}</p>
        {portraitFailed && <p className="shop-storage-status" role="status">人物图片未能加载，请刷新重试；客户对话仍可继续。</p>}
        <div className={'shop-choices' + (view === 'questions' ? ' questions' : '')}>
          {view === 'questions' && <>{profile.questions.map(question => <button key={question.id} type="button" aria-pressed={story.asked.includes(question.id)} onClick={() => onAsk(question.id)}>{story.asked.includes(question.id) ? <CheckCircle size={22} /> : <ChatCircleText size={22} />}<span>{question.label}</span><ArrowRight size={16} /></button>)}<button className="shop-propose" type="button" onClick={() => setView('offers')}>整理需求，给出方案<ArrowRight size={18} /></button></>}
          {view === 'offers' && <div className="shop-offers" aria-label="配置推荐">{offers.map(offer => <article key={offer.id}><header><strong>{offer.title}</strong><b>¥{offer.price}<small>元件</small></b></header><p>{offer.summary}</p><small>{offer.advice}</small><button className={offer.id === 'economy' ? 'primary' : ''} type="button" onClick={() => { onOffer(offer); setView('quote'); }}>采用{offer.title}<ArrowRight size={18} /></button></article>)}</div>}
          {view === 'quote' && <><div className="shop-quote"><span>元件成本 <b>¥{preview.metrics.totalPrice}</b></span><span>交付总报价 <b>¥{preview.quotePrice}</b></span></div><button className="primary" type="button" onClick={() => { onAccept(); setView('workshop'); onWorkshop(); }}>接下工单 · 开始装机<ArrowRight size={18} /></button><button type="button" onClick={() => setView('offers')}>再比较一下方案</button></>}
          {view === 'workshop' && <><button className="primary" type="button" onClick={onWorkshop}>进入装机工作台<Wrench size={19} /></button><button type="button" onClick={() => setView('questions')}>重看客户对话<ChatCircleText size={19} /></button></>}
          {view === 'thanks' && <><div className="shop-quote"><span>本单交付 <b>¥{receipt?.result.quotePrice}</b></span><span>本单利润 <b>¥{receipt?.result.profit}</b></span></div><button className="primary" type="button" disabled={!delivered} onClick={onNextCustomer}>接待下一位客户 · {nextCustomerName}<ArrowRight size={18} /></button></>}
        </div>{saved === false && <small className="shop-storage-status" role="status">当前浏览器无法保存对话，进度在本次页面保留。</small>}
      </section>
    </>}
    {panel && <div className="shop-panel-shade" onClick={() => setPanel(null)}><section className="shop-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={panel === 'menu' ? '订单与练习' : '需求工单'} onClick={event => {event.stopPropagation();if(event.target.closest('.hardware-case'))setPanel(null);}} onKeyDown={panelKeyboard}><header><h2>{panel === 'menu' ? '订单与练习' : `${profile.name}的需求工单`}</h2><button type="button" aria-label="关闭面板" onClick={() => setPanel(null)}><X size={22} /></button></header>
      {panel === 'menu' ? <><button type="button" onClick={() => setPanel(null)}>回到客户柜台</button><button type="button" onClick={onReturn}>返回街角装机店</button><button type="button" onClick={onPractice}>进入装机教学练习</button><h3>课堂订单</h3>{orders}</> : <><p className="shop-note-customer">{profile.name} · {order.title}</p>{profile.questions.map(question => <div className="shop-note-row" key={question.id}><CheckCircle size={20} weight={story.asked.includes(question.id) ? 'fill' : 'regular'} /><span>{story.asked.includes(question.id) ? question.answer : `待了解 · ${question.label}`}</span></div>)}<p className="shop-note-budget">元件预算 ¥{order.targets.budget} · 装机服务另报</p><button className="primary" type="button" onClick={() => { setPanel(null); if (story.accepted) onWorkshop(); else setView('questions'); }}>{story.accepted ? '进入装机工作台' : '继续询问客户'}<ArrowRight size={18} /></button></>}
    </section></div>}
  </section>;
}
