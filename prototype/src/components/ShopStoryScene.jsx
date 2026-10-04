import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Cpu, Sun, SpeakerHigh, SpeakerSlash, ClipboardText, Wrench, ArrowRight, CheckCircle, Desktop, Coins, Archive, X, List, BookOpen, ChatCircleText, Moon } from '@phosphor-icons/react';
import { CHAPTER_LINES, initialChapter, advanceChapter, readChapter, saveChapter } from '../shopChapter.js';
import './shopStory.css';

const questions=[['usage','平时主要开什么软件？',Desktop],['capacity','资料大概有多少？',Archive],['budget','预算准备了多少？',Coins]];
export function ShopStoryScene({story,storyKey,storage,onAsk,onAccept,onOffer,offers,preview,receipt,delivered,soundOn,onSound,workshopOpen,onWorkshop,onReception,onPractice,onCustom,onNextCustomer,nextCustomerName,orders,children,saved}){
  const chapterKey=storyKey?`${storyKey}:chapter-1`:null;
  const [chapter,setChapter]=useState(()=>readChapter(storage,chapterKey,story.accepted));
  const [panel,setPanel]=useState(null),[history,setHistory]=useState([]);
  const panelRef=useRef(null);
  useEffect(()=>{if(!panel)return;const previous=document.activeElement;panelRef.current?.querySelector('button')?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[panel]);
  function panelKeyboard(event){
    if(event.key==='Escape'){setPanel(null);return;}
    if(event.key!=='Tab')return;
    const buttons=[...panelRef.current.querySelectorAll('button:not(:disabled)')].filter(button=>button.getClientRects().length);
    const first=buttons[0],last=buttons.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  useLayoutEffect(()=>{setChapter(readChapter(storage,chapterKey,story.accepted));setHistory([]);setPanel(null);},[chapterKey]);
  useEffect(()=>{if(delivered){setChapter(current=>advanceChapter(current,{type:'DELIVERED'},{delivered:true}));onReception();}else setChapter(current=>advanceChapter(current,{type:'BOOT_INVALIDATED'}));},[delivered]);
  const text=CHAPTER_LINES[chapter.node]??CHAPTER_LINES.questions;
  const mentor=text.speaker==='老赵',evening=['reflection','closing'].includes(chapter.node);
  const portrait=mentor?'laozhao':delivered?'xiaolin-pleased':'xiaolin-neutral';
  const questionStage=['questions','usage','capacity','budget'].includes(chapter.node);
  const allAsked=questions.every(([id])=>story.asked.includes(id));
  function move(event){
    const next=advanceChapter(chapter,event,{asked:story.asked,delivered});
    if(next.node!==chapter.node){setHistory(current=>[...current,{speaker:text.speaker,line:text.line}].slice(-30));setChapter(next);saveChapter(storage,chapterKey,next);}
  }
  function ask(id){onAsk(id);move({type:'ASK',id});}
  function accept(){onAccept();move({type:'ACCEPT'});onWorkshop();}
  function adopt(offer){onOffer(offer);move({type:'QUOTE'});}
  function revisit(){setPanel(null);move({type:story.accepted?'ACCEPT':'INQUIRE'});onReception();}
  return <section className={'shop-game'+(workshopOpen?' at-workbench':'')+(evening?' evening':'')} aria-label="芯邻装机店" data-chapter-node={chapter.node}>
    <img className="shop-backdrop" src={mentor?'/shop-story/shop-empty.webp':'/shop-story/shop-day.webp'} alt="阳光照进街角装机店，右侧是装机工作台和元件架" fetchPriority="high"/>
    <header className="shop-topbar"><div className="shop-brand"><Cpu size={29} weight="duotone"/><h1>芯邻装机</h1><span>{evening?<Moon size={18}/>:<Sun size={18}/>}第1天 · {evening?'傍晚':'上午'}</span></div>
      <div className="shop-tools">{onCustom && <button type="button" className="shop-custom-entry" onClick={onCustom}><ChatCircleText size={19}/><span>自定义客户 · AI</span></button>}<button type="button" aria-label={soundOn?'声音已开启':'声音已关闭'} aria-pressed={soundOn} onClick={onSound}>{soundOn?<SpeakerHigh size={22}/>:<SpeakerSlash size={22}/>}</button><button type="button" aria-expanded={panel==='menu'} aria-label="订单与练习" onClick={()=>setPanel(panel==='menu'?null:'menu')}><List size={22}/></button></div>
    </header>
    <div className="shop-workbench-wrap" hidden={!workshopOpen}><div className="shop-workbench-top"><button type="button" onClick={onReception}><ArrowRight size={17} className="shop-return-arrow"/>返回店铺柜台</button><span>小林的工单 · 办公电脑 · 元件预算 ¥2200</span><button type="button" onClick={()=>setPanel('note')}><ClipboardText size={18}/>需求工单</button></div>{children}</div>
    {!workshopOpen&&<>
      {chapter.node!=='opening'&&<img className={'shop-character '+(mentor?'mentor':'')} src={`/shop-story/${portrait}.webp`} alt={mentor?'老赵，灰发眼镜、藏蓝工装，手持工单夹板':'小林，米白衬衣、薄荷绿背心，手提帆布资料袋'}/>}
      <div className="shop-dialogue" aria-label="客户接待"><button className="shop-hotspot" type="button" onClick={()=>story.accepted?onWorkshop():setPanel('note')}><Wrench size={20}/>装机工作台<ArrowRight size={16}/></button><div className="shop-dialogue-heading"><strong>{text.speaker}</strong><span>{text.caption}</span><button type="button" aria-label="对话记录" onClick={()=>setPanel('history')}><BookOpen size={18}/></button><button type="button" aria-label="查看需求工单" onClick={()=>setPanel('note')}><ClipboardText size={19}/></button>{!mentor&&chapter.node!=='opening'&&<img className="shop-dialogue-portrait" src={`/shop-story/${portrait}.webp`} alt=""/>}</div>
        <p className="shop-dialogue-line" aria-live="polite">{text.line}</p>
        <div className={'shop-choices'+(questionStage?' questions':'')}>
          {chapter.node==='opening'&&<button className="primary" type="button" onClick={()=>move({type:'OPEN'})}>打开营业门牌<ArrowRight size={19}/></button>}
          {chapter.node==='mentor'&&<><button className="primary" type="button" onClick={()=>move({type:'WELCOME'})}>我来试试，接待第一位客户<ArrowRight size={18}/></button><button type="button" onClick={()=>move({type:'HINT'})}>客人说要快，我该怎么问？</button></>}
          {chapter.node==='hint'&&<button className="primary" type="button" onClick={()=>move({type:'WELCOME'})}>知道了，先听清楚再给方案<ArrowRight size={18}/></button>}
          {chapter.node==='arrival'&&<><button className="primary" type="button" onClick={()=>move({type:'INQUIRE'})}>先聊聊具体用法<ChatCircleText size={18}/></button><button type="button" onClick={()=>move({type:'PITCH'})}>直接上高配，肯定快吧？</button></>}
          {chapter.node==='redirect'&&<button className="primary" type="button" onClick={()=>move({type:'INQUIRE'})}>你说得对，先了解具体需求<ArrowRight size={18}/></button>}
          {questionStage&&questions.map(([id,label,Icon],index)=><button className={index===0?'primary':''} key={id} type="button" aria-pressed={story.asked.includes(id)} onClick={()=>ask(id)}>{story.asked.includes(id)?<CheckCircle size={22}/>:<Icon size={22}/>}<span>{label}</span><ArrowRight size={16}/></button>)}
          {questionStage&&allAsked&&<button className="shop-propose" type="button" onClick={()=>move({type:'OFFERS'})}>整理需求，给出方案<ArrowRight size={18}/></button>}
          {chapter.node==='offers'&&<div className="shop-offers" aria-label="配置推荐">{offers.map(offer=><article key={offer.id}><header><strong>{offer.title}</strong><b>¥{offer.price}<small>元件</small></b></header><p>{offer.summary}</p><small>{offer.advice}</small><button className={offer.id==='economy'?'primary':''} type="button" onClick={()=>adopt(offer)}>采用{offer.title}<ArrowRight size={18}/></button></article>)}</div>}
          {chapter.node==='quote'&&<><div className="shop-quote"><span>元件成本 <b>¥{preview.metrics.totalPrice}</b></span><span>服务与加价 <b>¥{preview.quotePrice-preview.metrics.totalPrice}</b></span><span>交付总报价 <b>¥{preview.quotePrice}</b></span></div><button className="primary" type="button" onClick={accept}>接下工单 · 开始装机<ArrowRight size={18}/></button><button type="button" onClick={()=>move({type:'OFFERS'})}>再比较一下方案</button></>}
          {chapter.node==='workshop'&&<><button className="primary" type="button" onClick={onWorkshop}>进入装机工作台<Wrench size={19}/></button><button type="button" onClick={()=>move({type:'INQUIRE'})}>重看客户对话<ChatCircleText size={19}/></button></>}
          {chapter.node==='thanks'&&<><button className="primary" type="button" onClick={onNextCustomer} disabled={!delivered}>接待下一位客户 · {nextCustomerName}<ArrowRight size={18}/></button><button type="button" onClick={()=>move({type:'AFTERCARE',choice:'support'})}>遇到问题随时回来，我们按工单查<ArrowRight size={18}/></button><button type="button" onClick={()=>move({type:'AFTERCARE',choice:'explanation'})}>配置取舍我写进说明里了</button></>}
          {chapter.node==='reflection'&&['先听用途','控制预算','平衡性能与成本'].map((choice,index)=><button className={index===0?'primary':''} type="button" key={choice} onClick={()=>move({type:'END',choice})}>{choice}<ArrowRight size={17}/></button>)}
          {chapter.node==='closing'&&<div className="shop-closing"><div><strong>小林的感谢便签</strong><p>“谢谢你认真听我的用途，明天的汇报有底气了。”</p><span>本单交付 ¥{receipt?.result.quotePrice} · 本单利润 ¥{receipt?.result.profit}</span></div><button className="primary" type="button" onClick={onNextCustomer} disabled={!delivered}>接待下一位客户 · {nextCustomerName}<ArrowRight size={18}/></button><button type="button" onClick={()=>setPanel('menu')}>查看后续客户<ArrowRight size={18}/></button><button type="button" onClick={onWorkshop}>回工作台看看<Wrench size={18}/></button></div>}
        </div>
        {saved===false&&<small className="shop-storage-status" role="status">当前浏览器无法保存对话，进度在本次页面保留。</small>}
      </div>
    </>}
    {panel&&<div className="shop-panel-shade" onClick={()=>setPanel(null)}><section className="shop-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={panel==='menu'?'订单与练习':panel==='history'?'对话记录':'需求工单'} onClick={event=>{event.stopPropagation();if(event.target.closest('.hardware-case'))setPanel(null);}} onKeyDown={panelKeyboard}><header><h2>{panel==='menu'?'订单与练习':panel==='history'?'对话记录':'小林的需求工单'}</h2><button type="button" aria-label="关闭面板" onClick={()=>setPanel(null)}><X size={22}/></button></header>
      {panel==='menu'?<><p>第一章 · 第一声门铃</p><button type="button" onClick={revisit}>回到客户柜台</button><button type="button" onClick={onPractice}>进入装机教学练习</button><h3>课堂订单</h3>{orders}</>:panel==='history'?<div className="shop-history">{history.length?history.map((entry,index)=><p key={index}><strong>{entry.speaker}</strong>{entry.line}</p>):<p>从打开营业门牌开始，已读对话会留在这里。</p>}</div>:<><p className="shop-note-customer">小林 · 办公电脑</p>{questions.map(([id,label])=><div className="shop-note-row" key={id}><CheckCircle size={20} weight={story.asked.includes(id)?'fill':'regular'}/><span>{story.asked.includes(id)?CHAPTER_LINES[id].line:`待了解 · ${label}`}</span></div>)}<p className="shop-note-budget">元件预算 ¥2200 · 装机服务另报</p><p>CPU ≥ 45 · 内存 ≥ 8GB · 容量 ≥ 256GB · 存储速度 ≥ 70 · 图形 ≥ 30</p><button className="primary" type="button" onClick={()=>{setPanel(null);story.accepted?onWorkshop():move({type:'INQUIRE'});}}>{story.accepted?'进入装机工作台':'继续询问客户'}<ArrowRight size={18}/></button></>}
    </section></div>}
  </section>;
}
