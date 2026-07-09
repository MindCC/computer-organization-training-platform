import { BoxGeometry, CylinderGeometry, MeshStandardMaterial } from "three";
import { useMemo } from "react";

// ── Materials ──
const matCPU = new MeshStandardMaterial({ color: "#C0C0C0", metalness: 0.7, roughness: 0.2 });
const matRAM = new MeshStandardMaterial({ color: "#1a5c2a", metalness: 0.1, roughness: 0.5 });
const matMobo = new MeshStandardMaterial({ color: "#0d3320", metalness: 0.05, roughness: 0.7 });
const matGPU = new MeshStandardMaterial({ color: "#2a2a2a", metalness: 0.6, roughness: 0.3 });
const matStorage = new MeshStandardMaterial({ color: "#888", metalness: 0.8, roughness: 0.2 });
const matPSU = new MeshStandardMaterial({ color: "#333", metalness: 0.5, roughness: 0.4 });
const matCase = new MeshStandardMaterial({ color: "#1a1a2e", metalness: 0.3, roughness: 0.6, transparent: true, opacity: 0.35 });
const matLabel = new MeshStandardMaterial({ color: "#4fc3f7", emissive: "#4fc3f7", emissiveIntensity: 0.5 });

// ── Geometry factories ──
const cpuGeo = new BoxGeometry(0.45, 0.06, 0.45);
const ramGeo = new BoxGeometry(0.06, 0.5, 0.02);
const moboGeo = new BoxGeometry(1.2, 0.03, 1.0);
const gpuGeo = new BoxGeometry(0.4, 0.07, 0.28);
const storageGeo = new BoxGeometry(0.2, 0.14, 0.35);
const psuGeo = new BoxGeometry(0.35, 0.28, 0.45);
const caseGeo = new BoxGeometry(1.4, 0.9, 0.6);

// ── Part specs ──
export const COMPUTER_PARTS = [
  { id: "case", label: "机箱", category: "chassis", fiveElement: "——", description: "容纳并保护所有内部部件。前面板有电源按钮、USB 接口。", geo: caseGeo, mat: matCase, size: [1.4, 0.9, 0.6], basePos: [0, 0, 0], explodeDir: [0, 0, 0] },
  { id: "motherboard", label: "主板", category: "board", fiveElement: "控制器", description: "所有部件的连接中心。包含芯片组（控制数据流向）、BIOS 芯片和扩展插槽。", geo: moboGeo, mat: matMobo, size: [1.2, 0.03, 1.0], basePos: [0, 0.05, 0], explodeDir: [0, 0.06, 0] },
  { id: "cpu", label: "CPU", category: "processor", fiveElement: "运算器", description: "中央处理器，执行所有计算和逻辑运算。内部有 ALU（算术逻辑单元）和寄存器。", geo: cpuGeo, mat: matCPU, size: [0.45, 0.06, 0.45], basePos: [0.05, 0.12, 0.15], explodeDir: [0, 0.08, 0] },
  { id: "ram-0", label: "内存 1", category: "memory", fiveElement: "存储器", description: "随机存取存储器，临时存储正在运行的程序和数据。断电后数据丢失（易失性）。", geo: ramGeo, mat: matRAM, size: [0.06, 0.5, 0.02], basePos: [-0.3, 0.12, 0.1], explodeDir: [-0.04, 0.06, 0] },
  { id: "ram-1", label: "内存 2", category: "memory", fiveElement: "存储器", description: "第二条内存条，与内存 1 组成双通道，提升数据吞吐速度。", geo: ramGeo, mat: matRAM, size: [0.06, 0.5, 0.02], basePos: [-0.15, 0.12, 0.1], explodeDir: [-0.02, 0.06, 0] },
  { id: "gpu", label: "显卡", category: "gpu", fiveElement: "运算器", description: "图形处理器，专门加速图形和并行计算。现代 GPU 也可用于 AI 训练。", geo: gpuGeo, mat: matGPU, size: [0.4, 0.07, 0.28], basePos: [0.25, 0.12, -0.15], explodeDir: [0.04, 0.06, 0] },
  { id: "storage", label: "硬盘", category: "storage", fiveElement: "存储器", description: "长期存储数据。SSD 比传统 HDD 快数十倍，无机械部件更耐用。", geo: storageGeo, mat: matStorage, size: [0.2, 0.14, 0.35], basePos: [-0.45, 0.12, -0.15], explodeDir: [-0.06, 0, 0] },
  { id: "psu", label: "电源", category: "power", fiveElement: "——", description: "将 220V 交流电转换为 12V/5V/3.3V 直流电，为主板、CPU、显卡等供电。", geo: psuGeo, mat: matPSU, size: [0.35, 0.28, 0.45], basePos: [-0.45, -0.08, 0], explodeDir: [-0.08, 0, 0] },
];

// ── Connection lines (data buses + power) ──
// Each: { from: [x,y,z], to: [x,y,z], color, label }
export const CONNECTIONS = [
  // Data bus: CPU ↔ RAM
  { from: [0.05, 0.12, 0.15], to: [-0.3, 0.12, 0.1], color: "#4fc3f7", label: "数据总线", thickness: 0.008 },
  { from: [0.05, 0.12, 0.15], to: [-0.15, 0.12, 0.1], color: "#4fc3f7", label: "数据总线", thickness: 0.008 },
  // Data bus: CPU ↔ GPU
  { from: [0.05, 0.12, 0.15], to: [0.25, 0.12, -0.15], color: "#4fc3f7", label: "PCIe 总线", thickness: 0.01 },
  // Data bus: CPU ↔ Storage
  { from: [0.05, 0.12, 0.15], to: [-0.45, 0.12, -0.15], color: "#ff9800", label: "SATA 总线", thickness: 0.006 },
  // Address bus: CPU ↔ RAM
  { from: [0.07, 0.13, 0.22], to: [-0.28, 0.13, 0.11], color: "#81c784", label: "地址总线", thickness: 0.006 },
  { from: [0.07, 0.13, 0.22], to: [-0.13, 0.13, 0.11], color: "#81c784", label: "地址总线", thickness: 0.006 },
  // Control bus: CPU ↔ all
  { from: [0.03, 0.11, 0.15], to: [-0.3, 0.11, 0.09], color: "#ffeb3b", label: "控制总线", thickness: 0.005 },
  { from: [0.03, 0.11, 0.15], to: [0.25, 0.11, -0.16], color: "#ffeb3b", label: "控制总线", thickness: 0.005 },
  // Power: PSU → motherboard, CPU, GPU
  { from: [-0.45, -0.08, 0], to: [-0.05, 0.03, 0.3], color: "#ef5350", label: "主板供电", thickness: 0.01 },
  { from: [-0.45, -0.08, 0], to: [0.05, 0.1, 0.15], color: "#ef5350", label: "CPU 供电", thickness: 0.008 },
  { from: [-0.45, -0.08, 0], to: [0.25, 0.1, -0.15], color: "#ef5350", label: "GPU 供电", thickness: 0.006 },
];

// ── Motherboard surface details (CPU socket, DIMM, PCIe) ──
const cpuSocketGeo = new BoxGeometry(0.48, 0.002, 0.48);
const dimmSlotGeo = new BoxGeometry(0.06, 0.002, 0.52);
const pcieSlotGeo = new BoxGeometry(0.42, 0.002, 0.06);
const socketMat = new MeshStandardMaterial({ color: "#333", metalness: 0.8, roughness: 0.3 });
const slotMat = new MeshStandardMaterial({ color: "#1a1a1a", metalness: 0.5, roughness: 0.4 });

export const MOBO_DETAILS = [
  { geo: cpuSocketGeo, mat: socketMat, pos: [0.05, 0.067, 0.15] },
  { geo: dimmSlotGeo, mat: slotMat, pos: [-0.3, 0.067, 0.1] },
  { geo: dimmSlotGeo, mat: slotMat, pos: [-0.15, 0.067, 0.1] },
  { geo: pcieSlotGeo, mat: slotMat, pos: [0.25, 0.067, -0.15] },
];

export function usePartPositions(explodeDistance = 0) {
  return useMemo(() => COMPUTER_PARTS.map((part) => ({
    ...part,
    position: [
      part.basePos[0] + part.explodeDir[0] * explodeDistance,
      part.basePos[1] + part.explodeDir[1] * explodeDistance,
      part.basePos[2] + part.explodeDir[2] * explodeDistance,
    ],
  })), [explodeDistance]);
}
