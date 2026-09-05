import { useEffect, useMemo, useState } from 'react';
import { ArrowCounterClockwise, CheckCircle, Cube, Hand, Power, Wrench } from '@phosphor-icons/react';
import { NativeComputerScene } from './NativeComputerScene.jsx';
import { COMPUTER_PARTS } from './computerParts.js';
import { HARDWARE_PARTS } from '../hardwareGame.js';
import { ASSEMBLY_PARTS, assemblyCheck, assemblySignature, installPart, reconcileInstallation } from '../hardwareAssembly.js';
import './hardwareAssembly.css';

const BOOT_STEPS = ['供电正常 · 主板已通电', 'CPU / 内存自检通过', '存储设备已识别', '显示输出就绪 · 系统启动成功'];

export function HardwareAssemblyWorkbench({ parts, onPartChange, score, activeCategory, onCategoryChange, onAssemblyReady }) {
  const [installed, setInstalled] = useState({});
  const [message, setMessage] = useState('从左侧台面拿起零件，拖到机箱中的对应插槽。');
  const [boot, setBoot] = useState(null);
  const [cameraPreset, setCameraPreset] = useState('perspective');
  const [resetKey, setResetKey] = useState(0);
  const [showGuide, setShowGuide] = useState(true);
  const [focused, setFocused] = useState(false);
  const selectionKey = JSON.stringify(parts);
  const validInstalled = useMemo(() => reconcileInstallation(installed, parts), [installed, selectionKey]);
  const status = assemblyCheck(validInstalled, parts);
  const signature = assemblySignature(validInstalled, parts);
  const bootCurrent = boot?.signature === signature;
  const powered = bootCurrent && boot.step === BOOT_STEPS.length;
  const booting = bootCurrent && !powered;
  const active = ASSEMBLY_PARTS.find(part => part.id === activeCategory) ?? ASSEMBLY_PARTS[0];
  const integrated = parts.gpu === 'gpu-integrated';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    const result = installPart(validInstalled, parts, category, socket);
    setMessage(result.message);
    if (result.ok) { setInstalled(result.installed); invalidate(); }
  }
  function remove(category) {
    const next = { ...validInstalled }; delete next[category];
    setInstalled(next); invalidate(); setMessage('部件已放回工作台。更换或重新安装后，请再次开机自检。');
  }
  function changeVariant(value) {
    invalidate();
    const next = { ...validInstalled }; delete next[active.id]; setInstalled(next);
    onPartChange(current => ({ ...current, [active.id]: value })); setMessage('型号已更换。请将新的部件装入机箱。');
  }
  const sceneState = useMemo(() => ({ visiblePartIds: COMPUTER_PARTS.map(part => part.id), selectedPartId: active.sceneId,
    reducedMotion, cameraPreset, resetKey,
    assembly: { installed: validInstalled, activeId: active.id, integrated, powered: powered || booting, locked: powered || booting },
  }), [signature, active.id, integrated, powered, booting, reducedMotion, cameraPreset, resetKey]);
  return <section className={'assembly-workshop' + (focused ? ' focused' : '')} aria-label="3D 交互装机工作台">
    <header className="assembly-toolbar">
      <div className="assembly-brand"><Cube size={23} weight="duotone" /><div><small>PRECISION WORKSHOP / 01</small><h2>装机实验室</h2></div></div>
      <button className="assembly-focus-toggle" type="button" aria-pressed={focused} onClick={() => setFocused(value => !value)}>{focused ? '退出专注 · Esc' : '专注装机 ↗'}</button>
      <div className="assembly-view-controls"><button type="button" aria-pressed={cameraPreset === 'top'} onClick={() => setCameraPreset(current => current === 'top' ? 'perspective' : 'top')}>俯视 / 透视</button><button type="button" onClick={() => { setCameraPreset('perspective'); setResetKey(value => value + 1); }} aria-label="重置观察视角"><ArrowCounterClockwise size={16} /></button><button type="button" aria-pressed={showGuide} onClick={() => setShowGuide(value => !value)}>操作提示</button></div>
    </header>
    <div className="assembly-viewport">
      <NativeComputerScene assembly viewState={sceneState} onInstall={install} onPartSelect={sceneId => { const part = ASSEMBLY_PARTS.find(part => part.sceneId === sceneId); if (part) { onCategoryChange(part.id); setMessage(part.hint); } }} fallback={<div className="assembly-fallback"><Cube size={40} /><strong>当前设备无法启动 3D 场景</strong><p>可以用下方的部件选择与“安装到插槽”完成教学操作。</p></div>} />
      <div className="assembly-scene-heading"><span className="assembly-live-dot" />{powered ? 'SYSTEM ONLINE' : 'ASSEMBLY MODE'}<small>机箱已开盖 · 主板与电源已预装</small></div>
      <div className="assembly-counter"><strong>{status.installed}<span> / {status.total}</span></strong><small>部件已安装</small></div>
      {showGuide && !bootCurrent && <div className="assembly-guide"><Hand size={20} /><span><strong>拿起 → 对准 → 安装</strong><small>拖动零件到高亮插槽，或点击零件名称再点击目标。空白处拖动旋转，滚轮缩放。</small></span></div>}
      {bootCurrent && <div className={'assembly-boot' + (powered ? ' online' : '')} role="status"><Power size={25} /><strong>{powered ? '开机成功' : '正在开机自检…'}</strong><div>{BOOT_STEPS.slice(0, boot.step).map(line => <p key={line}>✓ {line}</p>)}</div>{powered && <small>{score.passed ? '装配与订单要求均已满足，可以交付。' : '装配正常，客户配置要求仍需调整。'}</small>}</div>}
      <div className="assembly-scene-footer"><span>WORKBENCH A · 防静电工作台</span><span>模型可旋转 · 插槽吸附</span></div>
    </div>
    <div className="assembly-action-strip" role="status"><Wrench size={17} /><span>{message}</span><strong>{score.metrics.totalPrice <= score.targets.budget ? '预算内' : '超出预算'} · ¥{score.metrics.totalPrice} / ¥{score.targets.budget}</strong></div>
    <div className="assembly-console"><div className="assembly-parts-controls">
      <div className="assembly-part-tabs" aria-label="选择装配部件">{ASSEMBLY_PARTS.map((part, index) => <button type="button" key={part.id} aria-pressed={active.id === part.id} onClick={() => { onCategoryChange(part.id); setMessage(part.hint); }}><span>{validInstalled[part.id] || part.id === 'gpu' && integrated ? <CheckCircle size={17} weight="fill" /> : '0' + (index + 1)}</span>{part.label}<small>{part.id === 'gpu' && integrated ? 'CPU 集显' : validInstalled[part.id] ? '已安装' : '待安装'}</small></button>)}</div>
      <div className="assembly-part-config"><label htmlFor="assembly-variant">{active.label}型号<select id="assembly-variant" value={parts[active.id]} disabled={booting} onChange={event => changeVariant(event.target.value)}>{HARDWARE_PARTS[active.id].map(part => <option key={part.id} value={part.id}>{part.name} · ¥{part.price}</option>)}</select></label>{active.id === 'gpu' && integrated ? <p className="assembly-integrated">使用 CPU 集成图形，无需安装独立显卡。</p> : validInstalled[active.id] ? <button className="assembly-secondary" type="button" disabled={booting} onClick={() => remove(active.id)}>拆下{active.label}</button> : <button className="assembly-secondary" type="button" disabled={booting || powered} onClick={() => install(active.id, active.id)}>安装到{active.socket}</button>}</div>
    </div><div className="assembly-power-controls"><button type="button" className={'assembly-power' + (powered ? ' online' : '')} disabled={!status.ready || booting} onClick={() => { if (powered) { invalidate(); setMessage('已关机，可以继续调整配置。'); } else { setBoot({ signature, step: 0 }); setMessage('开始供电、处理器、内存、存储与显示输出自检。'); } }}><Power size={21} />{powered ? '关闭电源' : booting ? '自检中…' : '开机自检'}</button><small>{status.ready ? '教学模式自动接线与散热' : '还需安装 ' + status.missing.map(id => ASSEMBLY_PARTS.find(part => part.id === id).label).join('、')}</small></div></div>
  </section>;
}
