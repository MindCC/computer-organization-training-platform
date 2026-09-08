import { CABLES, reconcileStructure, structureAction, structureCheck, connectCable, readStructure, saveStructure } from '../completeAssembly.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowCounterClockwise, CheckCircle, Cube, Hand, Power, Wrench } from '@phosphor-icons/react';
import { NativeComputerScene } from './NativeComputerScene.jsx';
import { COMPUTER_PARTS } from './computerParts.js';
import { HARDWARE_PARTS } from '../hardwareGame.js';
import { ASSEMBLY_PARTS, assemblyCheck, assemblySignature, installPart, reconcileInstallation } from '../hardwareAssembly.js';
import './hardwareAssembly.css';
import { loadAssemblyDraft, saveAssemblyDraft } from '../assemblyDraft.js';

const BOOT_STEPS = ['供电正常 · 主板已通电', 'CPU / 内存自检通过', '存储设备已识别', '显示输出就绪 · 系统启动成功'];

export function HardwareAssemblyWorkbench({ parts, onPartChange, score, activeCategory, onCategoryChange, onAssemblyReady, draftKey, draftStorage }) {
  const [installed, setInstalled] = useState(() => loadAssemblyDraft(draftStorage, draftKey, parts));
  const [message, setMessage] = useState(() => Object.keys(installed).length ? '已恢复本订单的装配进度，请重新开机自检。' : '从左侧台面拿起零件，拖到机箱中的对应插槽。');
  const [structure, setStructure] = useState(() => readStructure(draftStorage, draftKey, installed, parts));
  const [cableFrom, setCableFrom] = useState(CABLES[0].from);
  const [cableTo, setCableTo] = useState(CABLES[0].to);
  const [cableMode,setCableMode]=useState(false);
  const [selectedConnector,setSelectedConnector]=useState(null);
  const [saved, setSaved] = useState(false);
  const [boot, setBoot] = useState(null);
  const [cameraPreset, setCameraPreset] = useState('perspective');
  const [resetKey, setResetKey] = useState(0);
  const [showGuide, setShowGuide] = useState(true);
  const [focused, setFocused] = useState(false);
  const selectionKey = JSON.stringify(parts);
  const validInstalled = useMemo(() => reconcileInstallation(installed, parts), [installed, selectionKey]);
  const status = assemblyCheck(validInstalled, parts);
  const validStructure = reconcileStructure(structure, validInstalled, parts);
  const structureKey = JSON.stringify(validStructure);
  const structuralStatus = structureCheck(validStructure, validInstalled, parts);
  const ready = status.ready && structuralStatus.ready;
  const signature = assemblySignature(validInstalled, parts) + structureKey;
  const bootCurrent = boot?.signature === signature;
  const powered = bootCurrent && boot.step === BOOT_STEPS.length;
  const booting = bootCurrent && !powered;
  const active = ASSEMBLY_PARTS.find(part => part.id === activeCategory) ?? ASSEMBLY_PARTS[0];
  const priorCategory = useRef(active.id);
  useEffect(() => {
    if (priorCategory.current !== active.id) setCameraPreset('part');
    priorCategory.current = active.id;
  }, [active.id]);
  const integrated = parts.gpu === 'gpu-integrated';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => { setSaved(saveAssemblyDraft(draftStorage, draftKey, validInstalled, parts) && saveStructure(draftStorage, draftKey, validStructure)); setStructure(validStructure); }, [draftStorage, draftKey, signature, selectionKey]);
  useEffect(() => {
    if (!focused) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = event => { if (event.key === 'Escape') setFocused(false); };
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape); };
  }, [focused]);
  useEffect(() => {
    if (!booting) return;
    const timer = setTimeout(() => setBoot(current => current?.signature === signature ? { ...current, step: current.step + 1 } : current), reducedMotion ? 80 : 650);
    return () => clearTimeout(timer);
  }, [booting, boot?.step, signature, reducedMotion]);
  useEffect(() => { onAssemblyReady?.(powered ? selectionKey : null); }, [powered, selectionKey, onAssemblyReady]);
  function invalidate() { setBoot(null); onAssemblyReady?.(null); }
  function install(category, socket) {
    if (booting || powered) return;
    if (!validStructure.open || !validStructure.motherboard) { setMessage('请先打开侧板并固定主板。'); return; }
    const result = installPart(validInstalled, parts, category, socket);
    setMessage(result.message);
    if (result.ok) { setInstalled(result.installed); invalidate(); }
  }
  function remove(category) {
    if (!validStructure.open) { setMessage('请先打开侧板。'); return; }
    if (category === 'cpu' && validStructure.cooler) { setMessage('请先拆下 CPU 散热器。'); return; }
    const next = { ...validInstalled }; delete next[category];
    setInstalled(next); invalidate(); setMessage('部件已放回工作台。更换或重新安装后，请再次开机自检。');
  }
  function changeStructure(id, value) {
    if (booting || powered) return;
    const result = structureAction(validStructure, id, value, validInstalled, parts);
    setMessage(result.message);
    if (result.ok) { setStructure(result.state); invalidate(); }
  }
  function connect() {
    if (booting || powered) return;
    const result = connectCable(validStructure, cableFrom, cableTo, validInstalled, parts);
    setMessage(result.message);
    if (result.ok) { setStructure(result.state); invalidate(); }
  }
  function pickConnector(id) {
    if(booting || powered || !validStructure.open)return;
    const cable=CABLES.find(c=>c.from===id);
    if(cable){setSelectedConnector(id);setCableFrom(id);setMessage('已拿起'+cable.fromLabel+'，请点击主机上的目标接口。');return;}
    if(!selectedConnector){setMessage('请先点击线缆插头。');return;}
    const result=connectCable(validStructure,selectedConnector,id,validInstalled,parts);
    setCableTo(id);setMessage(result.message);
    if(result.ok){setStructure(result.state);setSelectedConnector(null);invalidate();}
  }
  function changeVariant(value) {
    invalidate();
    const next = { ...validInstalled }; delete next[active.id]; setInstalled(next);
    onPartChange(current => ({ ...current, [active.id]: value })); setMessage('型号已更换。请将新的部件装入机箱。');
  }
  const sceneState = useMemo(() => ({ visiblePartIds: COMPUTER_PARTS.map(part => part.id), selectedPartId: active.sceneId,
    reducedMotion, cameraPreset, resetKey,
    assembly: { installed: validInstalled, activeId: active.id, integrated, powered: powered || booting, locked: powered || booting || !validStructure.open || !validStructure.motherboard, structure: validStructure, cableMode, selectedConnector },
  }), [signature, active.id, integrated, powered, booting, reducedMotion, cameraPreset, resetKey,cableMode,selectedConnector]);
  return <section className={'assembly-workshop' + (focused ? ' focused' : '')} aria-label="3D 交互装机工作台">
    <header className="assembly-toolbar">
      <div className="assembly-brand"><Cube size={23} weight="duotone" /><div><small>PRECISION WORKSHOP / 01</small><h2>装机实验室</h2></div></div>
      <button className="assembly-focus-toggle" type="button" aria-pressed={focused} onClick={() => setFocused(value => !value)}>{focused ? '退出专注 · Esc' : '专注装机 ↗'}</button>
      <div className="assembly-view-controls"><button type="button" aria-pressed={cameraPreset === 'part'} onClick={() => { setCameraPreset('part'); setResetKey(value => value + 1); }}>部件近景</button><button type="button" aria-pressed={cameraPreset === 'top'} onClick={() => setCameraPreset(current => current === 'top' ? 'perspective' : 'top')}>俯视 / 透视</button><button type="button" onClick={() => { setCameraPreset('perspective'); setResetKey(value => value + 1); }} aria-label="重置观察视角"><ArrowCounterClockwise size={16} /></button><button type="button" aria-pressed={showGuide} onClick={() => setShowGuide(value => !value)}>操作提示</button></div>
    </header>
    <div className="assembly-viewport">
      <NativeComputerScene assembly viewState={sceneState} onInstall={install} onConnector={pickConnector} onPartSelect={sceneId => { const part = ASSEMBLY_PARTS.find(part => part.sceneId === sceneId); if (part) { onCategoryChange(part.id); setMessage(part.hint); } }} fallback={<div className="assembly-fallback"><Cube size={40} /><strong>当前设备无法启动 3D 场景</strong><p>可以用下方的部件选择与“安装到插槽”完成教学操作。</p></div>} />
      <div className="assembly-scene-heading"><span className="assembly-live-dot" />{powered ? 'SYSTEM ONLINE' : 'ASSEMBLY MODE'}<small>{validStructure.open ? '侧板已打开' : '先打开侧板'} · {validStructure.motherboard ? '主板已固定' : '主板待固定'} · {validStructure.psu ? '电源已固定' : '电源待固定'}</small></div>
      <div className="assembly-counter"><strong>{status.installed}<span> / {status.total}</span></strong><small>部件已安装</small></div>
      {showGuide && !bootCurrent && !cableMode && <div className="assembly-guide"><Hand size={20} /><span><strong>{active.label+' · '+active.socket}</strong><small>{active.hint+' 拖动或点击安装，空白处拖动旋转。'}</small></span></div>}
      {bootCurrent && <div className={'assembly-boot' + (powered ? ' online' : '')} role="status"><Power size={25} /><strong>{powered ? '开机成功' : '正在开机自检…'}</strong><div>{BOOT_STEPS.slice(0, boot.step).map(line => <p key={line}>✓ {line}</p>)}</div>{powered && <small>{score.passed ? '装配与订单要求均已满足，可以交付。' : '装配正常，客户配置要求仍需调整。'}</small>}</div>}
      <div className="assembly-scene-footer"><span>WORKBENCH A · 防静电工作台</span><span>{saved ? '本机进度已保存 · 开机状态不保留' : '进度仅在本次操作中保留'}</span></div>
    </div>
    <div className="assembly-action-strip" role="status"><Wrench size={17} /><span>{message}</span><strong>{score.metrics.totalPrice <= score.targets.budget ? '预算内' : '超出预算'} · ¥{score.metrics.totalPrice} / ¥{score.targets.budget}</strong></div>
    <div className="assembly-structure-controls" aria-label="机箱与接线步骤">
      <div className="assembly-structure-parts">
        <button type="button" aria-pressed={cableMode} disabled={booting || powered || !validStructure.open} onClick={()=>{setCableMode(value=>!value);setSelectedConnector(null);setCameraPreset('perspective');setResetKey(value=>value+1);}}>{cableMode?'结束接线':'连接线缆'}</button>
        {[['open', '侧板'], ['motherboard', '主板'], ['psu', '电源'], ['cooler', 'CPU 散热器']].map(([id, label]) =>
          <button type="button" key={id} disabled={booting || powered} aria-pressed={Boolean(validStructure[id])} onClick={() => changeStructure(id, !validStructure[id])}>
            {id === 'open' ? (validStructure.open ? '合上侧板' : '打开侧板') : (validStructure[id] ? '拆下' : '固定') + label}
          </button>)}
      </div>
      <div className="assembly-cable-controls">
        <label>线缆端<select aria-label="线缆端" disabled={booting || powered} value={cableFrom} onChange={e => setCableFrom(e.target.value)}>{CABLES.map(c => <option key={c.id} value={c.from}>{c.fromLabel}</option>)}</select></label>
        <span aria-hidden="true">→</span>
        <label>目标接口<select aria-label="目标接口" disabled={booting || powered} value={cableTo} onChange={e => setCableTo(e.target.value)}>{CABLES.map(c => <option key={c.id} value={c.to}>{c.toLabel}</option>)}</select></label>
        <button type="button" disabled={booting || powered} onClick={connect}>连接接口</button>
      </div>
      <div className="assembly-cable-list">{CABLES.map(c => <button type="button" key={c.id} disabled={!validStructure.cables[c.id] || booting || powered || !validStructure.open} onClick={() => { const cables = { ...validStructure.cables }; delete cables[c.id]; setStructure({ ...validStructure, cables }); invalidate(); setMessage(c.label + '已断开。'); }}>{validStructure.cables[c.id] ? '✓ ' : '○ '}{c.label}{validStructure.cables[c.id] ? ' · 断开' : ''}</button>)}</div>
    </div>
    <div className="assembly-console"><div className="assembly-parts-controls">
      <div className="assembly-part-tabs" aria-label="选择装配部件">{ASSEMBLY_PARTS.map((part, index) => <button type="button" key={part.id} aria-pressed={active.id === part.id} onClick={() => { onCategoryChange(part.id); setMessage(part.hint); }}><span>{validInstalled[part.id] || part.id === 'gpu' && integrated ? <CheckCircle size={17} weight="fill" /> : '0' + (index + 1)}</span>{part.label}<small>{part.id === 'gpu' && integrated ? 'CPU 集显' : validInstalled[part.id] ? '已安装' : '待安装'}</small></button>)}</div>
      <div className="assembly-part-config"><label htmlFor="assembly-variant">{active.label}型号<select id="assembly-variant" value={parts[active.id]} disabled={booting} onChange={event => changeVariant(event.target.value)}>{HARDWARE_PARTS[active.id].map(part => <option key={part.id} value={part.id}>{part.name} · ¥{part.price}</option>)}</select></label>{active.id === 'gpu' && integrated ? <p className="assembly-integrated">使用 CPU 集成图形，无需安装独立显卡。</p> : validInstalled[active.id] ? <button className="assembly-secondary" type="button" disabled={booting} onClick={() => remove(active.id)}>拆下{active.label}</button> : <button className="assembly-secondary" type="button" disabled={booting || powered} onClick={() => install(active.id, active.id)}>安装到{active.socket}</button>}</div>
    </div><div className="assembly-power-controls"><button type="button" className={'assembly-power' + (powered ? ' online' : '')} disabled={!ready || booting} onClick={() => { if (powered) { invalidate(); setMessage('已关机，可以继续调整配置。'); } else { setBoot({ signature, step: 0 }); setMessage('开始供电、处理器、内存、存储与显示输出自检。'); } }}><Power size={21} />{powered ? '关闭电源' : booting ? '自检中…' : '开机自检'}</button><small>{ready ? '装配与必要连接已完成，可以开机自检' : '还需完成：' + [...status.missing.map(id => ASSEMBLY_PARTS.find(part => part.id === id).label), ...structuralStatus.missing].join('、')}</small></div></div>
  </section>;
}
