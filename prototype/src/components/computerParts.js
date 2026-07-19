import { BoxGeometry, CylinderGeometry, PlaneGeometry, RingGeometry, MeshStandardMaterial, SphereGeometry, ExtrudeGeometry, Shape, Group } from "three";
import { useMemo } from "react";

// ── Materials ──
const matCPU_IHS = new MeshStandardMaterial({ color: "#C0C0C0", metalness: 0.85, roughness: 0.15 });
const matCPU_PCB = new MeshStandardMaterial({ color: "#1a4d1a", metalness: 0.1, roughness: 0.6 });
const matRAM_PCB = new MeshStandardMaterial({ color: "#0d4d0d", metalness: 0.05, roughness: 0.55 });
const matRAM_CHIP = new MeshStandardMaterial({ color: "#111", metalness: 0.2, roughness: 0.4 });
const matMobo = new MeshStandardMaterial({ color: "#0d3320", metalness: 0.05, roughness: 0.7 });
const matGPU_PCB = new MeshStandardMaterial({ color: "#1a1a1a", metalness: 0.4, roughness: 0.4 });
const matGPU_FAN = new MeshStandardMaterial({ color: "#333", metalness: 0.6, roughness: 0.3 });
const matStorage = new MeshStandardMaterial({ color: "#888", metalness: 0.8, roughness: 0.2 });
const matPSU = new MeshStandardMaterial({ color: "#333", metalness: 0.6, roughness: 0.3 });
const matPSU_FAN = new MeshStandardMaterial({ color: "#222", metalness: 0.7, roughness: 0.2 });
const matCase_FRAME = new MeshStandardMaterial({ color: "#2a2a3e", metalness: 0.5, roughness: 0.4 });
const matCase_PANEL = new MeshStandardMaterial({ color: "#16162a", metalness: 0.2, roughness: 0.6, transparent: true, opacity: 0.2 });
const matSocket = new MeshStandardMaterial({ color: "#2a2a2a", metalness: 0.8, roughness: 0.3 });
const matSlot = new MeshStandardMaterial({ color: "#1a1a1a", metalness: 0.5, roughness: 0.4 });
const matGold = new MeshStandardMaterial({ color: "#d4a843", metalness: 0.9, roughness: 0.1 });
const matLabel = new MeshStandardMaterial({ color: "#333", metalness: 0.3, roughness: 0.5 });

// ── Reusable geometry ──
const pcbBaseGeo = new BoxGeometry(1.2, 0.025, 1.0);
const cpuIhsGeo = new BoxGeometry(0.38, 0.03, 0.38);
const cpuPcbGeo = new BoxGeometry(0.42, 0.015, 0.42);
const ramBoardGeo = new BoxGeometry(0.055, 0.48, 0.01);
const ramChipGeo = new BoxGeometry(0.045, 0.08, 0.008);
const gpuBoardGeo = new BoxGeometry(0.38, 0.04, 0.26);
const gpuFanRingGeo = new RingGeometry(0.06, 0.09, 24);
const gpuFanBladeGeo = new BoxGeometry(0.02, 0.1, 0.005);
const storageGeo = new BoxGeometry(0.18, 0.13, 0.32);
const psuGeo = new BoxGeometry(0.33, 0.26, 0.43);
const psuFanGrillGeo = new RingGeometry(0.06, 0.1, 32);
const psuFanCenterGeo = new SphereGeometry(0.02, 8, 8);
const caseFrameGeoV = new BoxGeometry(0.02, 0.88, 0.02);
const caseFrameGeoH = new BoxGeometry(1.38, 0.02, 0.02);
const caseFrameGeoD = new BoxGeometry(0.02, 0.02, 0.58);
const cpuSocketGeo = new BoxGeometry(0.46, 0.002, 0.46);
const dimmSlotGeo = new BoxGeometry(0.06, 0.002, 0.5);
const pcieSlotGeo = new BoxGeometry(0.4, 0.002, 0.05);

// ── Compound geometries (manual Group proxy — parts rendered via iteration) ──

// GPU fan compound: ring + 4 blades + center hub
function gpuFanGroup() {
  // Return array of { type: 'mesh', geo, mat, pos } for fan sub-meshes
  return [
    // Fan ring (outer)
    { type: "ring", geo: gpuFanRingGeo, mat: matGPU_FAN, pos: [0, 0.05, 0], rot: [-Math.PI / 2, 0, 0] },
    // 6 blades
    ...Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      return { type: "box", geo: gpuFanBladeGeo, mat: matGPU_FAN, pos: [Math.cos(angle) * 0.04, 0.047, Math.sin(angle) * 0.04], rot: [0, angle, 0] };
    }),
    // Center hub
    { type: "sphere", geo: new SphereGeometry(0.03, 8, 8), mat: matGPU_FAN, pos: [0, 0.048, 0], rot: [0, 0, 0] },
  ];
}

// PSU fan grill
function psuFanGrillGroup() {
  return [
    { type: "ring", geo: psuFanGrillGeo, mat: matPSU_FAN, pos: [0, -0.05, 0.22], rot: [0, 0, 0] },
    { type: "sphere", geo: psuFanCenterGeo, mat: matPSU_FAN, pos: [0, -0.05, 0.22], rot: [0, 0, 0] },
    // 4 bars across the fan
    { type: "box", geo: new BoxGeometry(0.2, 0.005, 0.005), mat: matPSU_FAN, pos: [0, -0.02, 0.22], rot: [0, 0, 0] },
    { type: "box", geo: new BoxGeometry(0.2, 0.005, 0.005), mat: matPSU_FAN, pos: [0, -0.08, 0.22], rot: [0, 0, 0] },
    { type: "box", geo: new BoxGeometry(0.005, 0.06, 0.005), mat: matPSU_FAN, pos: [-0.04, -0.05, 0.225], rot: [0, 0, Math.PI / 2] },
    { type: "box", geo: new BoxGeometry(0.005, 0.06, 0.005), mat: matPSU_FAN, pos: [0.04, -0.05, 0.225], rot: [0, 0, Math.PI / 2] },
  ];
}

// Case wireframe: 12 edges (4 vertical posts + 8 horizontal)
function caseFrameEdges() {
  const hw = 0.69, hh = 0.44, hd = 0.29;
  return [
    // 4 vertical posts at each corner
    { geo: caseFrameGeoV, mat: matCase_FRAME, pos: [-hw, 0, -hd] },
    { geo: caseFrameGeoV, mat: matCase_FRAME, pos: [hw, 0, -hd] },
    { geo: caseFrameGeoV, mat: matCase_FRAME, pos: [-hw, 0, hd] },
    { geo: caseFrameGeoV, mat: matCase_FRAME, pos: [hw, 0, hd] },
    // Bottom rectangle edges
    { geo: new BoxGeometry(1.38, 0.02, 0.02), mat: matCase_FRAME, pos: [0, -hh, -hd] },
    { geo: new BoxGeometry(1.38, 0.02, 0.02), mat: matCase_FRAME, pos: [0, -hh, hd] },
    { geo: new BoxGeometry(0.02, 0.02, 0.58), mat: matCase_FRAME, pos: [-hw, -hh, 0] },
    { geo: new BoxGeometry(0.02, 0.02, 0.58), mat: matCase_FRAME, pos: [hw, -hh, 0] },
    // Top rectangle edges
    { geo: new BoxGeometry(1.38, 0.02, 0.02), mat: matCase_FRAME, pos: [0, hh, -hd] },
    { geo: new BoxGeometry(1.38, 0.02, 0.02), mat: matCase_FRAME, pos: [0, hh, hd] },
    { geo: new BoxGeometry(0.02, 0.02, 0.58), mat: matCase_FRAME, pos: [-hw, hh, 0] },
    { geo: new BoxGeometry(0.02, 0.02, 0.58), mat: matCase_FRAME, pos: [hw, hh, 0] },
  ];
}

export const COMPUTER_PARTS = [
  // Case: wireframe + transparent panels
  {
    id: "case",
    label: "机箱",
    category: "chassis",
    fiveElement: "——",
    description: "容纳并保护所有内部部件。前面板有电源按钮、USB 接口。",
    subParts: [
      ...caseFrameEdges(),
      { type: "box", geo: new BoxGeometry(1.38, 0.88, 0.005), mat: matCase_PANEL, pos: [0, 0, -0.295], rot: [0, 0, 0] },
      { type: "box", geo: new BoxGeometry(1.38, 0.88, 0.005), mat: matCase_PANEL, pos: [0, 0, 0.295], rot: [0, 0, 0] },
      { type: "box", geo: new BoxGeometry(0.005, 0.88, 0.59), mat: matCase_PANEL, pos: [-0.695, 0, 0], rot: [0, 0, 0] },
      { type: "box", geo: new BoxGeometry(0.005, 0.88, 0.59), mat: matCase_PANEL, pos: [0.695, 0, 0], rot: [0, 0, 0] },
      { type: "box", geo: new BoxGeometry(1.38, 0.005, 0.59), mat: matCase_PANEL, pos: [0, -0.442, 0], rot: [0, 0, 0] },
      { type: "box", geo: new BoxGeometry(1.38, 0.005, 0.59), mat: matCase_PANEL, pos: [0, 0.442, 0], rot: [0, 0, 0] },
    ],
    basePos: [0, 0, 0],
    explodeDir: [0, 0, 0],
  },
  // Motherboard: main PCB + visible slots
  {
    id: "motherboard",
    label: "主板",
    category: "board",
    fiveElement: "控制器",
    description: "所有部件的连接中心。包含芯片组（控制数据流向）、BIOS 芯片和扩展插槽。",
    subParts: [
      { type: "box", geo: pcbBaseGeo, mat: matMobo, pos: [0, 0, 0] },
      // Chipset near center
      { type: "box", geo: new BoxGeometry(0.15, 0.008, 0.15), mat: matGold, pos: [-0.1, 0.014, 0.2] },
      // Trace lines (decorative strips on PCB)
      { type: "box", geo: new BoxGeometry(0.8, 0.001, 0.01), mat: matGold, pos: [0, 0.014, 0.35] },
      { type: "box", geo: new BoxGeometry(0.8, 0.001, 0.01), mat: matGold, pos: [0, 0.014, -0.35] },
    ],
    basePos: [0, 0.05, 0],
    explodeDir: [0, 0.06, 0],
  },
  // CPU: IHS top + PCB base
  {
    id: "cpu",
    label: "CPU",
    category: "processor",
    fiveElement: "运算器",
    description: "中央处理器，执行所有计算和逻辑运算。内部有 ALU（算术逻辑单元）和寄存器。",
    subParts: [
      { type: "box", geo: cpuPcbGeo, mat: matCPU_PCB, pos: [0, -0.01, 0] },
      { type: "box", geo: cpuIhsGeo, mat: matCPU_IHS, pos: [0, 0.015, 0] },
      // Gold contact pads outline
      { type: "box", geo: new BoxGeometry(0.44, 0.003, 0.02), mat: matGold, pos: [0, -0.018, 0.2] },
      { type: "box", geo: new BoxGeometry(0.44, 0.003, 0.02), mat: matGold, pos: [0, -0.018, -0.2] },
      { type: "box", geo: new BoxGeometry(0.02, 0.003, 0.4), mat: matGold, pos: [0.21, -0.018, 0] },
      { type: "box", geo: new BoxGeometry(0.02, 0.003, 0.4), mat: matGold, pos: [-0.21, -0.018, 0] },
    ],
    basePos: [0.05, 0.12, 0.15],
    explodeDir: [0, 0.08, 0],
  },
  // RAM stick 1: board + chips
  {
    id: "ram-0",
    label: "内存 1",
    category: "memory",
    fiveElement: "存储器",
    description: "随机存取存储器，临时存储正在运行的程序和数据。断电后数据丢失（易失性）。",
    subParts: [
      { type: "box", geo: ramBoardGeo, mat: matRAM_PCB, pos: [0, 0, 0] },
      ...Array.from({ length: 4 }, (_, i) => ({ type: "box", geo: ramChipGeo, mat: matRAM_CHIP, pos: [0, -0.15 + i * 0.1, 0.012], rot: [0, 0, 0] })),
      { type: "box", geo: new BoxGeometry(0.04, 0.15, 0.014), mat: matGold, pos: [0, -0.22, 0.012] },
    ],
    basePos: [-0.3, 0.12, 0.1],
    explodeDir: [-0.04, 0.06, 0],
  },
  // RAM stick 2
  {
    id: "ram-1",
    label: "内存 2",
    category: "memory",
    fiveElement: "存储器",
    description: "第二条内存条，与内存 1 组成双通道，提升数据吞吐速度。",
    subParts: [
      { type: "box", geo: ramBoardGeo, mat: matRAM_PCB, pos: [0, 0, 0] },
      ...Array.from({ length: 4 }, (_, i) => ({ type: "box", geo: ramChipGeo, mat: matRAM_CHIP, pos: [0, -0.15 + i * 0.1, 0.012], rot: [0, 0, 0] })),
      { type: "box", geo: new BoxGeometry(0.04, 0.15, 0.014), mat: matGold, pos: [0, -0.22, 0.012] },
    ],
    basePos: [-0.15, 0.12, 0.1],
    explodeDir: [-0.02, 0.06, 0],
  },
  // GPU: board + fan assembly
  {
    id: "gpu",
    label: "显卡",
    category: "gpu",
    fiveElement: "运算器",
    description: "图形处理器，专门加速图形和并行计算。现代 GPU 也可用于 AI 训练。",
    subParts: [
      { type: "box", geo: gpuBoardGeo, mat: matGPU_PCB, pos: [0, 0, 0] },
      // Fan assembly
      { type: "ring", geo: gpuFanRingGeo, mat: matGPU_FAN, pos: [0, 0.04, 0], rot: [-Math.PI / 2, 0, 0] },
      { type: "sphere", geo: new SphereGeometry(0.03, 8, 8), mat: matGPU_FAN, pos: [0, 0.038, 0] },
      // PCIe connector gold pins
      { type: "box", geo: new BoxGeometry(0.3, 0.01, 0.02), mat: matGold, pos: [0, -0.025, -0.14] },
    ],
    basePos: [0.25, 0.12, -0.15],
    explodeDir: [0.04, 0.06, 0],
  },
  // Storage: SSD shape
  {
    id: "storage",
    label: "硬盘",
    category: "storage",
    fiveElement: "存储器",
    description: "长期存储数据。SSD 比传统 HDD 快数十倍，无机械部件更耐用。",
    subParts: [
      { type: "box", geo: storageGeo, mat: matStorage, pos: [0, 0, 0] },
      // Connector edge
      { type: "box", geo: new BoxGeometry(0.08, 0.02, 0.04), mat: matGold, pos: [0, -0.06, -0.17] },
    ],
    basePos: [-0.45, 0.12, -0.15],
    explodeDir: [-0.06, 0, 0],
  },
  // PSU: box + fan grill
  {
    id: "psu",
    label: "电源",
    category: "power",
    fiveElement: "——",
    description: "将 220V 交流电转换为 12V/5V/3.3V 直流电，为主板、CPU、显卡等供电。",
    subParts: [
      { type: "box", geo: psuGeo, mat: matPSU, pos: [0, 0, 0] },
      ...psuFanGrillGroup(),
    ],
    basePos: [-0.45, -0.08, 0],
    explodeDir: [-0.08, 0, 0],
  },
];

// ── Connection lines (data buses + power) ──
export const CONNECTIONS = [
  { from: [0.05, 0.12, 0.15], to: [-0.3, 0.12, 0.1], color: "#4fc3f7", label: "数据总线", thickness: 0.008 },
  { from: [0.05, 0.12, 0.15], to: [-0.15, 0.12, 0.1], color: "#4fc3f7", label: "数据总线", thickness: 0.008 },
  { from: [0.05, 0.12, 0.15], to: [0.25, 0.12, -0.15], color: "#4fc3f7", label: "PCIe 总线", thickness: 0.01 },
  { from: [0.05, 0.12, 0.15], to: [-0.45, 0.12, -0.15], color: "#ff9800", label: "SATA 总线", thickness: 0.006 },
  { from: [0.07, 0.13, 0.22], to: [-0.28, 0.13, 0.11], color: "#81c784", label: "地址总线", thickness: 0.006 },
  { from: [0.07, 0.13, 0.22], to: [-0.13, 0.13, 0.11], color: "#81c784", label: "地址总线", thickness: 0.006 },
  { from: [0.03, 0.11, 0.15], to: [-0.3, 0.11, 0.09], color: "#ffeb3b", label: "控制总线", thickness: 0.005 },
  { from: [0.03, 0.11, 0.15], to: [0.25, 0.11, -0.16], color: "#ffeb3b", label: "控制总线", thickness: 0.005 },
  { from: [-0.45, -0.08, 0], to: [-0.05, 0.03, 0.3], color: "#ef5350", label: "主板供电", thickness: 0.01 },
  { from: [-0.45, -0.08, 0], to: [0.05, 0.1, 0.15], color: "#ef5350", label: "CPU 供电", thickness: 0.008 },
  { from: [-0.45, -0.08, 0], to: [0.25, 0.1, -0.15], color: "#ef5350", label: "GPU 供电", thickness: 0.006 },
];

// ── Motherboard surface details ──
export const MOBO_DETAILS = [
  { geo: cpuSocketGeo, mat: matSocket, pos: [0.05, 0.067, 0.15] },
  { geo: dimmSlotGeo, mat: matSlot, pos: [-0.3, 0.067, 0.1] },
  { geo: dimmSlotGeo, mat: matSlot, pos: [-0.15, 0.067, 0.1] },
  { geo: pcieSlotGeo, mat: matSlot, pos: [0.25, 0.067, -0.15] },
];

// ── Helper to flatten compound parts into renderable sub-meshes ──
export function flattenPart(part, explodeDistance = 0) {
  const x = part.basePos[0] + part.explodeDir[0] * explodeDistance;
  const y = part.basePos[1] + part.explodeDir[1] * explodeDistance;
  const z = part.basePos[2] + part.explodeDir[2] * explodeDistance;

  if (!part.subParts) {
    return [{ ...part, position: [x, y, z], localOffset: [0, 0, 0], parentId: part.id }];
  }

  return (part.subParts ?? []).map((sub) => ({
    id: `${part.id}-${sub.type}-${JSON.stringify(sub.pos)}`,
    label: part.label,
    category: part.category,
    fiveElement: part.fiveElement,
    description: part.description,
    geo: sub.geo,
    mat: sub.mat,
    position: [x + (sub.pos?.[0] ?? 0), y + (sub.pos?.[1] ?? 0), z + (sub.pos?.[2] ?? 0)],
    rotation: sub.rot ?? [0, 0, 0],
    localOffset: sub.pos ?? [0, 0, 0],
    basePos: part.basePos,
    explodeDir: part.explodeDir,
    parentId: part.id,
  }));
}

export function usePartPositions(explodeDistance = 0) {
  return useMemo(() => {
    const result = [];
    for (const part of COMPUTER_PARTS) {
      const subParts = flattenPart(part, explodeDistance);
      for (const sub of subParts) {
        result.push(sub);
      }
    }
    return result;
  }, [explodeDistance]);
}
