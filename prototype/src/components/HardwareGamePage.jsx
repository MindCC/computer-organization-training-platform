import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { assemblyDraftKey, readAssemblyDraftSelection } from '../assemblyDraft.js';
import { CheckCircle, CurrencyCny, Gauge, Target, WarningCircle, SpeakerHigh, SpeakerSlash, ArrowRight } from "@phosphor-icons/react";
import { HARDWARE_GAME_CASES, gradeHardwareBuild } from "../hardwareGame.js";
import { HardwareAssemblyWorkbench } from "./HardwareAssemblyWorkbench.jsx";
import { AssemblyPractice } from './AssemblyPractice.jsx';
import { HardwareCustomerStory } from './HardwareCustomerStory.jsx';
import { ShopStoryScene } from './ShopStoryScene.jsx';
import { CustomCustomerScene } from './CustomCustomerScene.jsx';
import { buildStoryOffers, storyProfile, storyStorageKey, readStory, saveStory, storyStage } from '../hardwareStory.js';
import { createWorkshopSound } from './workshopSound.js';
import './hardwareStory.css';

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
}) {
  const [activeCategory, setActiveCategory] = useState("cpu");
  const [practiceOpen,setPracticeOpen]=useState(false);
  const [customOpen,setCustomOpen]=useState(false);
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
  const budgetOk = preview.metrics.totalPrice <= selectedCase.targets.budget;

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

  if(customOpen)return <CustomCustomerScene key={userId} userId={userId} onExit={()=>setCustomOpen(false)}/>;

  // Mount each customer's scene only after that order's saved state is restored.
  if(restoredKey!==draftKey)return null;

  if(selectedCase.id==='game-office-pc')return <div className="hardware-game-page hardware-shop-page hardware-game-layout" data-story-stage={stage}>
    <ShopStoryScene onNextCustomer={nextCustomer} nextCustomerName={storyProfile(nextCase.id).name} onCustom={()=>{setReadyConfiguration(null);setCustomOpen(true);}} story={story} storyKey={storyKey} storage={draftStorage} onAsk={ask} onAccept={accept} onOffer={adopt} offers={offers} preview={preview} receipt={activeReceipt} delivered={deliveryComplete} soundOn={soundOn} onSound={toggleSound} workshopOpen={workshopOpen} onWorkshop={()=>setWorkshopOpen(true)} onReception={()=>setWorkshopOpen(false)} onPractice={()=>{setReadyConfiguration(null);setPracticeOpen(true);}} saved={storySaved}
      orders={<section className="hardware-case-rail">{caseGroups.map(group=><div className="hardware-case-group" key={group.id}><strong>{group.title}</strong>{HARDWARE_GAME_CASES.filter(item=>item.chapterId===group.id).map(item=><button className={'hardware-case'+(item.id===selectedCase.id?' active':'')} aria-pressed={item.id===selectedCase.id} type="button" key={item.id} onClick={()=>selectCase(item.id)}><span>{item.title}</span></button>)}</div>)}</section>}>
      {story.accepted&&<><div className="hardware-live-workshop">{workbench}</div>{deliveryPanel}</>}
    </ShopStoryScene>{soundMessage&&<p role="status">{soundMessage}</p>}
  </div>;

  return (
    <div className="hardware-game-page hardware-story-game">
      <header className="hardware-game-hero">
        <div className="hardware-game-heading">
          <span className="eyebrow">芯游记 · 工程师工作日 / 工单 {String(HARDWARE_GAME_CASES.indexOf(selectedCase)+1).padStart(2,'0')}</span>
          <h1>电脑装机店经营挑战</h1>
          <p>接待客户，亲手完成一台符合需求的电脑。</p>
        </div>
        <div className="hardware-hero-status">
          <button className="hardware-sound-toggle" aria-pressed={soundOn} onClick={toggleSound} type="button">{soundOn?<SpeakerHigh size={20}/>:<SpeakerSlash size={20}/>}声音{soundOn?'已开启':'已关闭'}</button>
        </div>
      </header>
      <button type="button" className="hardware-sound-toggle" onClick={()=>selectCase('game-office-pc')}>返回街角装机店</button>

      {soundMessage&&<p role="status">{soundMessage}</p>}
      <ol className="hardware-stage-bar" aria-label="工单阶段">{['接待客户','选配装机','验机交付','客户回执'].map((label,index)=><li key={label} className={index<stage?'done':index===stage?'current':''} aria-current={index===stage?'step':undefined}><span>{index<stage?<CheckCircle size={17} weight="fill"/>:index+1}</span>{label}</li>)}</ol>

      <div className="hardware-training-entry"><button type="button" onClick={()=>{setReadyConfiguration(null);setPracticeOpen(true);}}>进入装机教学练习</button><span>引导装配、独立操作、故障排查与练习复盘</span></div>
      <div className="hardware-game-layout" data-story-stage={stage}>
        <aside className="hardware-mission-rail">
          <section className="hardware-mission-card customer">
            <span className="eyebrow">{"\u5ba2\u6237\u9700\u6c42"}</span>
            <h2>{selectedCase.title}</h2>
            <p>{selectedCase.customer}</p>
          </section>

          <section className="hardware-mission-card budget">
            <div>
              <span>{"\u9884\u7b97\u4e0a\u9650"}</span>
              <strong>{"\u00a5 " + selectedCase.targets.budget}</strong>
            </div>
            <small className={budgetOk ? "ok" : "warn"}>
              {budgetOk ? "\u5f53\u524d\u914d\u7f6e\u5728\u9884\u7b97\u5185" : "\u5f53\u524d\u914d\u7f6e\u5df2\u8d85\u9884\u7b97"}
            </small>
          </section>

          <section className="hardware-mission-card">
            <div className="hardware-mission-card-title">
              <span>{"\u4efb\u52a1\u8fdb\u5ea6"}</span>
              <strong>{canDeliver ? '已开机' : '装配中'}</strong>
            </div>
            <ol className="hardware-mission-steps">
              <li className="done"><CheckCircle size={17} weight="fill" /><span>{"\u9009\u62e9\u5408\u9002\u7684 CPU"}</span></li>
              <li className={preview.metrics.memory >= selectedCase.targets.memory ? "done" : "active"}><CheckCircle size={17} weight="fill" /><span>{"\u914d\u7f6e\u8db3\u591f\u5185\u5b58"}</span></li>
              <li className={preview.metrics.storageSpeed >= selectedCase.targets.storageSpeed ? "done" : "active"}><CheckCircle size={17} weight="fill" /><span>{"\u5e73\u8861\u5b58\u50a8\u5bb9\u91cf\u4e0e\u901f\u5ea6"}</span></li>
              <li className={canDeliver ? "done" : ""}><Target size={17} /><span>装配与开机自检</span></li>
            </ol>
          </section>

          <section className="hardware-case-rail">
            <span className="eyebrow">{"\u6311\u6218\u4efb\u52a1"}</span>
            {caseGroups.map((group) => (
              <div className="hardware-case-group" key={group.id}>
                <strong>{group.title}</strong>
                {HARDWARE_GAME_CASES.filter((item) => item.chapterId === group.id).map((item) => {
                  const record = progress[item.id] ?? {};
                  return (
                    <button
                      aria-pressed={item.id === selectedHardwareCaseId}
                      className={item.id === selectedHardwareCaseId ? "hardware-case active" : "hardware-case"}
                      key={item.id}
                      onClick={() => selectCase(item.id)}
                      type="button"
                    >
                      <span>{item.title}</span>
                      <small>{(record.bestScore ?? 0) + " \u5206\u00b7" + (record.attempts ?? 0) + " \u6b21"}</small>
                    </button>
                  );
                })}
              </div>
            ))}
          </section>
        </aside>

        <section className="hardware-game-main">
          <HardwareCustomerStory profile={profile} order={selectedCase} story={story} onAsk={ask} onAccept={accept} offers={offers} onOffer={adopt} expanded={dialogueOpen} onExpand={()=>setDialogueOpen(value=>!value)} saved={storySaved}/>
          <div className="hardware-live-workshop" hidden={!story.accepted}>
          {restoredKey === draftKey && <HardwareAssemblyWorkbench
            key={draftKey ?? selectedCase.id}
            draftKey={draftKey}
            draftStorage={draftStorage}
            onAssemblyReady={setReadyConfiguration}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            onPartChange={setHardwareSelection}
            parts={hardwareSelection}
            score={preview}
            onActionFeedback={actionSound}
            onDeliver={story.accepted?deliver:undefined}
            deliveryPending={submitting}
          />}
          </div>

          <section className={'hardware-delivery'+(deliveryComplete?' completed':'')} aria-label="客户验收" aria-live="polite">
            <div><small>{profile.name} · {activeReceipt?'交付回执':'等待验收'}</small><h2>{activeReceipt?(!activeReceipt.synced?'本机已记录，等待同步':deliveryComplete?'这张工单完成了':'方案需要调整'):canDeliver?'主机已启动，检查客户需求':'先把这台电脑装好'}</h2>
              <p>{activeReceipt?(deliveryComplete?profile.thanks:activeReceipt.result.explanation):canDeliver?(preview.passed?'配置符合我的需求，可以交付验收了。':preview.explanation):story.accepted?'安装好部件并接线，按下开机自检后再交付。':'先接下工单，了解需求后开始装配。'}</p>
              {activeReceipt&&<><p className="hardware-receipt-sync">{activeReceipt.synced?'交付已同步到服务器。':'本机已记录本次结果，服务器同步未完成，请重试提交。'}</p><div className="hardware-receipt-metrics"><span>教学得分 <b>{activeReceipt.result.score}</b></span><span>本单报价 <b>¥{activeReceipt.result.quotePrice}</b></span><span>预计利润 <b>¥{activeReceipt.result.profit}</b></span></div></>}
              {deliveryError&&<p role="alert">{deliveryError}</p>}
            </div>
            <div className="hardware-delivery-actions"><button className="primary-button" disabled={!canDeliver||!story.accepted||submitting} onClick={deliver} type="button">{submitting?'正在提交交付…':!story.accepted?'请先接下工单':canDeliver?'交付装机 · 提交方案':'请先完成装配与开机自检'}</button>
              {activeReceipt?.result.passed&&activeReceipt.synced&&<button type="button" onClick={()=>selectCase(HARDWARE_GAME_CASES[(HARDWARE_GAME_CASES.indexOf(selectedCase)+1)%HARDWARE_GAME_CASES.length].id)}>接待下一位客户<ArrowRight size={17}/></button>}
            </div>
          </section>

          <details className="hardware-business-details"><summary>查看配置评估与经营明细 · 当前评估 {preview.score} 分 · 成本 ¥{preview.metrics.totalPrice} / ¥{selectedCase.targets.budget}</summary>
          <section className="hardware-business-panel">
            <header className="section-heading">
              <div>
                <span className="eyebrow">{"\u5ba2\u6237\u53cd\u9988\u4e0e\u7ecf\u8425\u6570\u636e"}</span>
                <h2>{preview.passed ? "\u65b9\u6848\u53ef\u4ee5\u62a5\u4ef7" : "\u8fd8\u6709\u9700\u6c42\u672a\u6ee1\u8db3"}</h2>
              </div>
            </header>

            <div className="hardware-business-strip">
              <article className="hardware-business-card"><Gauge size={22} /><span>{"\u5ba2\u6237\u6ee1\u610f\u5ea6"}</span><strong>{preview.satisfaction}</strong><small>/ 100</small></article>
              <article className="hardware-business-card"><CurrencyCny size={22} /><span>{"\u65b9\u6848\u62a5\u4ef7"}</span><strong>{preview.quotePrice}</strong><small>{"\u5143"}</small></article>
              <article className="hardware-business-card"><Target size={22} /><span>{"\u7ecf\u8425\u5229\u6da6"}</span><strong>{preview.profit}</strong><small>{"\u5143"}</small></article>
            </div>

            <div className="hardware-targets" aria-label={"\u5ba2\u6237\u914d\u7f6e\u76ee\u6807"}>
              <span>{"CPU \u2265 " + selectedCase.targets.cpu}</span>
              <span>{"\u5185\u5b58 \u2265 " + selectedCase.targets.memory + "GB"}</span>
              <span>{"\u5bb9\u91cf \u2265 " + selectedCase.targets.storageCapacity + "GB"}</span>
              <span>{"\u901f\u5ea6 \u2265 " + selectedCase.targets.storageSpeed}</span>
            </div>

            <div className={preview.passed ? "hardware-result-box passed" : "hardware-result-box needs-work"}>
              {preview.passed ? <CheckCircle size={22} weight="fill" /> : <WarningCircle size={22} weight="fill" />}
              <div>
                <strong>{preview.passed ? "\u5df2\u6ee1\u8db3\u5ba2\u6237\u76ee\u6807" : "\u5c1a\u672a\u8fbe\u6210\u76ee\u6807"}</strong>
                <p>{preview.explanation}</p>
                <small>{preview.recommendation}</small>
              </div>
              {(hardwareFeedback ?? preview).errors.length > 0 ? (
                <div className="hardware-error-list">
                  {(hardwareFeedback ?? preview).errors.map((error) => <span key={error.type}>{error.type}</span>)}
                </div>
              ) : null}
            </div>
          </section>
          </details>
        </section>
      </div>
    </div>
  );
}
