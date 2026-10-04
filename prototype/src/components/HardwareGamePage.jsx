import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { assemblyDraftKey, readAssemblyDraftSelection } from '../assemblyDraft.js';
import { CheckCircle, ArrowRight } from "@phosphor-icons/react";
import { HARDWARE_GAME_CASES, gradeHardwareBuild } from "../hardwareGame.js";
import { HardwareAssemblyWorkbench } from "./HardwareAssemblyWorkbench.jsx";
import { AssemblyPractice } from './AssemblyPractice.jsx';

import { ShopStoryScene } from './ShopStoryScene.jsx';
import { CustomerVisitScene } from './CustomerVisitScene.jsx';
import { CustomCustomerScene } from './CustomCustomerScene.jsx';
import { buildStoryOffers, storyProfile, storyStorageKey, readStory, saveStory, storyStage } from '../hardwareStory.js';
import { createWorkshopSound } from './workshopSound.js';
import './hardwareStory.css';
const ShopServiceScene=lazy(()=>import('./ShopServiceScene.jsx').then(module=>({default:module.ShopServiceScene})));

const caseGroups = [
  { id: "ch1", title: "\u7b2c\u4e00\u7ae0\u00b7\u8ba1\u7b97\u673a\u6982\u8ff0" },
  { id: "ch4", title: "\u5b58\u50a8\u7cfb\u7edf" },
];

export function HardwareGamePage({
  userId,
  hardwareSelection,
  setHardwareSelection,
  hardwareFeedback,
  setHardwareFeedback,
  selectedHardwareCaseId,
  setSelectedHardwareCaseId,
  progress,
  submitHardwareBuild,
  serviceTarget,
  onServiceExit,
  allowCustom = true,
}) {
  const [activeCategory, setActiveCategory] = useState("cpu");
  const [practiceOpen,setPracticeOpen]=useState(false);
  const [customOpen,setCustomOpen]=useState(false);
  const serviceKey=`zcyl:shop-service-mode:${userId}`;
  const [serviceOpen,setServiceOpen]=useState(()=>{if(serviceTarget?.source==='assembly')return false;try{return Boolean(serviceTarget?.source==='service'||window.localStorage.getItem(serviceKey));}catch{return serviceTarget?.source==='service';}});
  useEffect(()=>{if(serviceTarget?.source==='service')openService();else if(serviceTarget?.source==='assembly')closeService();},[serviceTarget,serviceKey]);
  function openService(){setReadyConfiguration(null);setServiceOpen(true);try{window.localStorage.setItem(serviceKey,'open');}catch{}}
  function closeService(){setServiceOpen(false);try{window.localStorage.removeItem(serviceKey);}catch{}}
  const [workshopOpen,setWorkshopOpen]=useState(false);
  const [readyConfiguration, setReadyConfiguration] = useState(null);
  const canDeliver = readyConfiguration === JSON.stringify(hardwareSelection);
  const selectedCase = HARDWARE_GAME_CASES.find((item) => item.id === selectedHardwareCaseId) ?? HARDWARE_GAME_CASES[0];
  const draftStorage = useMemo(() => { try { return window.localStorage; } catch { return null; } }, []);
  const draftKey = assemblyDraftKey(userId, selectedCase.id);
  const storyKey=storyStorageKey(userId,selectedCase.id);
  const [story,setStory]=useState(()=>readStory(draftStorage,storyKey));
  const [storySaved,setStorySaved]=useState(null),[dialogueOpen,setDialogueOpen]=useState(false);
  const [receipt,setReceipt]=useState(null),[submitting,setSubmitting]=useState(false),[deliveryError,setDeliveryError]=useState('');
  const [soundOn,setSoundOn]=useState(false),[soundMessage,setSoundMessage]=useState('');
  const sound=useRef(null),currentOrder=useRef(null);
  const selectionSignature=JSON.stringify(hardwareSelection);
  currentOrder.current={caseId:selectedCase.id,signature:selectionSignature,powered:canDeliver};
  const profile=storyProfile(selectedCase.id);
  const offers=useMemo(()=>buildStoryOffers(selectedCase.id),[selectedCase.id]);
  const stage=storyStage({accepted:story.accepted,ready:canDeliver,receipt,caseId:selectedCase.id,selectionSignature});
  const activeReceipt=stage===3?receipt:null;
  const deliveryComplete=Boolean(activeReceipt?.synced&&activeReceipt.result.passed);
  useEffect(()=>()=>sound.current?.dispose(),[]);
  useEffect(()=>{setReceipt(null);setDeliveryError('');},[selectionSignature,draftKey]);
  useEffect(()=>{if(!canDeliver)setReceipt(null);},[canDeliver]);
  const [restoredKey, setRestoredKey] = useState(undefined);
  useLayoutEffect(() => {
    setHardwareSelection(current => readAssemblyDraftSelection(draftStorage, draftKey, current));
    setReadyConfiguration(null);
    setStory(readStory(draftStorage,storyKey));setStorySaved(null);setDialogueOpen(false);setReceipt(null);
    setWorkshopOpen(false);
    setRestoredKey(draftKey);
  }, [draftKey, draftStorage, setHardwareSelection]);
  const preview = gradeHardwareBuild(selectedCase.id, hardwareSelection);


  function updateStory(next){setStory(next);setStorySaved(saveStory(draftStorage,storyKey,next));}
  function ask(id){updateStory({...story,asked:[...story.asked.filter(item=>item!==id),id]});}
  function accept(){updateStory({...story,accepted:true});setDialogueOpen(false);}
  function adopt(offer){if(JSON.stringify(offer.selection)!==selectionSignature){setReadyConfiguration(null);setReceipt(null);}setHardwareSelection({...offer.selection});setHardwareFeedback(null);}
  async function toggleSound(){
    if(soundOn){setSoundOn(false);sound.current?.dispose();sound.current=null;return;}
    sound.current??=createWorkshopSound();const enabled=await sound.current.enable();setSoundOn(enabled);
    setSoundMessage(enabled?'':'当前浏览器无法播放声音，装机操作仍可继续。');if(enabled)sound.current.play('action');
  }
  function actionSound(event){if(soundOn)sound.current?.play(event.type??(event.ok?'action':'error'));}
  async function deliver(bootSignature){
    if((!canDeliver&&bootSignature!==selectionSignature)||!story.accepted||submitting)return;
    if(!canDeliver)setReadyConfiguration(selectionSignature);
    const submitted={caseId:selectedCase.id,signature:selectionSignature};setSubmitting(true);setDeliveryError('');
    try {
      const response=await submitHardwareBuild();
      if(currentOrder.current.caseId===submitted.caseId&&currentOrder.current.signature===submitted.signature&&currentOrder.current.powered){
        if(response?.result){setReceipt({...submitted,...response});if(soundOn&&response.result.passed)sound.current?.play('ready');}
        else setDeliveryError('未收到交付回执，请检查提交状态后重试。');
      }
    }catch(error){setDeliveryError('交付失败：'+error.message);}finally{setSubmitting(false);}
  }

  function selectCase(caseId) {
    if (caseId === selectedHardwareCaseId || submitting) return;
    setReadyConfiguration(null);
    setSelectedHardwareCaseId(caseId);
    setHardwareFeedback(null);
  }

  const nextCase=HARDWARE_GAME_CASES[(HARDWARE_GAME_CASES.indexOf(selectedCase)+1)%HARDWARE_GAME_CASES.length];
  function nextCustomer(){if(deliveryComplete&&!submitting)selectCase(nextCase.id);}

  const workbench=restoredKey===draftKey&&<HardwareAssemblyWorkbench key={draftKey??selectedCase.id} draftKey={draftKey} draftStorage={draftStorage} onAssemblyReady={setReadyConfiguration} activeCategory={activeCategory} onCategoryChange={setActiveCategory} onPartChange={setHardwareSelection} parts={hardwareSelection} score={preview} onActionFeedback={actionSound} onDeliver={story.accepted?deliver:undefined} deliveryPending={submitting}/>;
  const deliveryPanel=<section className={'hardware-delivery'+(deliveryComplete?' completed':'')} aria-label="客户验收" aria-live="polite">
    <div><small>{profile.name} · {activeReceipt?'交付回执':'等待验收'}</small><h2>{activeReceipt?(!activeReceipt.synced?'本机已记录，等待同步':deliveryComplete?'这张工单完成了':'方案需要调整'):canDeliver?'主机已启动，检查客户需求':'先把这台电脑装好'}</h2>
      <p>{activeReceipt?(deliveryComplete?profile.thanks:activeReceipt.result.explanation):canDeliver?(preview.passed?'配置符合我的需求，可以交付验收了。':preview.explanation):story.accepted?'安装好部件并接线，按下开机自检后再交付。':'先接下工单，了解需求后开始装配。'}</p>
      {activeReceipt&&<><p className="hardware-receipt-sync">{activeReceipt.synced?'交付已同步到服务器。':'本机已记录本次结果，服务器同步未完成，请重试提交。'}</p><div className="hardware-receipt-metrics"><span>教学得分 <b>{activeReceipt.result.score}</b></span><span>本单报价 <b>¥{activeReceipt.result.quotePrice}</b></span><span>预计利润 <b>¥{activeReceipt.result.profit}</b></span></div></>}
      {deliveryError&&<p role="alert">{deliveryError}</p>}
    </div>
    <div className="hardware-delivery-actions"><button className="primary-button" disabled={!canDeliver||!story.accepted||submitting} onClick={deliver} type="button">{submitting?'正在提交交付…':!story.accepted?'请先接下工单':canDeliver?'交付装机 · 提交方案':'请先完成装配与开机自检'}</button>
      {deliveryComplete&&<button type="button" disabled={submitting} onClick={nextCustomer}>接待下一位客户 · {storyProfile(nextCase.id).name}<ArrowRight size={17}/></button>}
    </div>
  </section>;

  if(practiceOpen)return <div className="hardware-game-page"><div className="hardware-training-entry"><button type="button" onClick={()=>setPracticeOpen(false)}>返回客户订单</button><span>教学练习 · 订单装配进度已保留</span></div><AssemblyPractice key={draftKey??selectedCase.id} initialParts={hardwareSelection} caseId={selectedCase.id} userId={userId}/></div>;

  if(customOpen && allowCustom)return <CustomCustomerScene key={userId} userId={userId} onExit={()=>setCustomOpen(false)}/>;
  if(serviceOpen)return <Suspense fallback={<p role="status">正在载入维修工作台…</p>}><ShopServiceScene key={userId} userId={userId} initialOrderId={serviceTarget?.orderId} onExit={()=>{closeService();onServiceExit?.();}}/></Suspense>;

  // Mount each customer's scene only after that order's saved state is restored.
  if(restoredKey!==draftKey)return null;

  const VisitScene=selectedCase.id==='game-office-pc'?ShopStoryScene:CustomerVisitScene;
  return <div className="hardware-game-page hardware-shop-page hardware-game-layout" data-story-stage={stage}>
    <div className="hardware-training-entry"><span>新玩法 · 客户带着旧电脑来店，先诊断，再升级</span><button type="button" onClick={openService}>进入维修与升级工单 <ArrowRight size={17}/></button></div>
    <VisitScene key={selectedCase.id} profile={profile} order={selectedCase} onReturn={()=>selectCase('game-office-pc')} onNextCustomer={nextCustomer} nextCustomerName={storyProfile(nextCase.id).name} onCustom={allowCustom?()=>{setReadyConfiguration(null);setCustomOpen(true);}:undefined} story={story} storyKey={storyKey} storage={draftStorage} onAsk={ask} onAccept={accept} onOffer={adopt} offers={offers} preview={preview} receipt={activeReceipt} delivered={deliveryComplete} soundOn={soundOn} onSound={toggleSound} workshopOpen={workshopOpen} onWorkshop={()=>setWorkshopOpen(true)} onReception={()=>setWorkshopOpen(false)} onPractice={()=>{setReadyConfiguration(null);setPracticeOpen(true);}} saved={storySaved}
      orders={<section className="hardware-case-rail">{caseGroups.map(group=><div className="hardware-case-group" key={group.id}><strong>{group.title}</strong>{HARDWARE_GAME_CASES.filter(item=>item.chapterId===group.id).map(item=><button className={'hardware-case'+(item.id===selectedCase.id?' active':'')} aria-pressed={item.id===selectedCase.id} type="button" key={item.id} onClick={()=>selectCase(item.id)}><strong>{storyProfile(item.id).name}</strong><span>{item.title}</span></button>)}</div>)}</section>}>
      {story.accepted&&<><div className="hardware-live-workshop">{workbench}</div>{deliveryPanel}</>}
    </VisitScene>{soundMessage&&<p role="status">{soundMessage}</p>}
  </div>;

}
