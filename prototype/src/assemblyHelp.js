import { HARDWARE_PARTS } from './hardwareGame.js';
import { assemblyCheck, ASSEMBLY_PARTS, reconcileInstallation } from './hardwareAssembly.js';
import { CABLES, reconcileStructure, structureCheck } from './completeAssembly.js';

// Reconstruct the current simulated machine; arbitrary user fields never cross this boundary.
export function safeAssemblySnapshot(raw) {
 if (!raw || typeof raw !== 'object') return null;
 const selection = {};
 for (const id of ['cpu','memory','storage','gpu']) {
  if (!HARDWARE_PARTS[id].some(part => part.id === raw.selection?.[id])) return null;
  selection[id] = raw.selection[id];
 }
 const installed = reconcileInstallation(raw.installed ?? {}, selection);
 const structure = reconcileStructure(raw.structure, installed, selection);
 const ready = assemblyCheck(installed, selection).ready && structureCheck(structure, installed, selection).ready;
 return {selection, installed, structure, powered: ready && raw.powered === true, booting: ready && raw.booting === true};
}

export function assemblyHelp(raw) {
 const state = safeAssemblySnapshot(raw);
 if (!state) return {ready:false,missing:[],steps:['选择有效配置后，再检查装配。'],summary:'尚未读取到有效的装机状态。'};
 const status = assemblyCheck(state.installed, state.selection), structural = structureCheck(state.structure, state.installed, state.selection);
 const missing = [...status.missing.map(id=>ASSEMBLY_PARTS.find(part=>part.id===id).label), ...structural.missing];
 const cableMissing = CABLES.filter(c=>!state.structure.cables[c.id]);
 const ready = missing.length === 0;
 const steps = [];
 if (!ready && !state.structure.open) steps.push('先点击“打开侧板”，再进行安装或接线。');
 if (!state.structure.motherboard) steps.push('点击“固定主板”，然后安装处理器、内存和显卡。');
 if (!state.structure.psu) steps.push('点击“固定电源”，供电线缆才能连接。');
 for (const id of status.missing) steps.push(`安装${ASSEMBLY_PARTS.find(part=>part.id===id).label}到对应插槽。`);
 if (!state.structure.cooler) steps.push('处理器安装后，点击“固定CPU 散热器”。');
 for (const c of cableMissing) steps.push(`连接${c.label}：在线缆端选择“${c.fromLabel}”，目标接口选择“${c.toLabel}”，点击“连接接口”。也可在3D接线模式点击这两个端点。`);
 if (ready) steps.push(state.powered ? '自检已通过；检查订单要求后交付，或查看练习复盘。' : state.booting ? '自检正在进行，请等待显示器上的启动结果。' : '必要装配与接线已完成，点击“开机自检”。侧板合上不会阻止自检。');
 return {ready,missing,steps,installed:status.installed,total:status.total,cables:CABLES.length-cableMissing.length,
  summary:state.powered?'开机自检已通过。':state.booting?'正在开机自检。':ready?'装配与必要连接已完成，可以开机自检。':`部件 ${status.installed}/${status.total}，必要接线 ${CABLES.length-cableMissing.length}/${CABLES.length}。还缺 ${missing.length} 项：${missing.join('、')}。`};
}
