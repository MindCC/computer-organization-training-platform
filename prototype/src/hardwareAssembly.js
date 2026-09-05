import { HARDWARE_PARTS } from './hardwareGame.js';

export const ASSEMBLY_PARTS = [
  { id: 'cpu', sceneId: 'cpu', label: '处理器', socket: 'CPU 插座', hint: '对齐金色三角标记，放入 CPU 插座。', rack: [-1.15, -0.25, -0.62] },
  { id: 'memory', sceneId: 'ram-0', label: '内存', socket: 'DIMM 插槽', hint: '将金手指缺口对准 DIMM 插槽，垂直压入。', rack: [-1.15, -0.2, -0.2] },
  { id: 'storage', sceneId: 'storage', label: '硬盘', socket: '硬盘托架', hint: '放入硬盘托架，教学模式自动连接 SATA 数据与供电。', rack: [-1.15, -0.25, 0.23] },
  { id: 'gpu', sceneId: 'gpu', label: '显卡', socket: 'PCIe 插槽', hint: '将显卡金手指对准 PCIe 插槽。', rack: [-1.15, -0.25, 0.68] },
];

export function reconcileInstallation(installed, selection) {
  return Object.fromEntries(ASSEMBLY_PARTS.filter(({ id }) => installed[id] === selection[id]
    && HARDWARE_PARTS[id].some(part => part.id === selection[id])
    && selection[id] !== 'gpu-integrated').map(({ id }) => [id, installed[id]]));
}

export function installPart(installed, selection, partId, socketId) {
  const part = ASSEMBLY_PARTS.find(part => part.id === partId);
  if (!part || partId !== socketId) return { ok: false, installed, message: '插槽不匹配，请对准高亮的安装位置。' };
  if (selection[partId] === 'gpu-integrated' || !HARDWARE_PARTS[partId].some(part => part.id === selection[partId])) {
    return { ok: false, installed, message: '此配置没有需要安装的独立部件。' };
  }
  return { ok: true, installed: { ...installed, [partId]: selection[partId] }, message: `${part.label}已安装到${part.socket}。` };
}

export function assemblyCheck(installed, selection) {
  const valid = reconcileInstallation(installed, selection);
  const missing = ASSEMBLY_PARTS.filter(({ id }) => !(id === 'gpu' && selection.gpu === 'gpu-integrated') && !valid[id]).map(part => part.id);
  return { ready: missing.length === 0, missing, installed: Object.keys(valid).length, total: selection.gpu === 'gpu-integrated' ? 3 : 4 };
}

export function assemblySignature(installed, selection) {
  return JSON.stringify(ASSEMBLY_PARTS.map(({ id }) => [id, selection[id] ?? null, installed[id] ?? null]));
}
