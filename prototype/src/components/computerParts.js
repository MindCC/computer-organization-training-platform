import { Group } from "three/src/objects/Group.js";
import { BoxGeometry } from "three/src/geometries/BoxGeometry.js";
import { CylinderGeometry } from "three/src/geometries/CylinderGeometry.js";
import { ExtrudeGeometry } from "three/src/geometries/ExtrudeGeometry.js";
import { PlaneGeometry } from "three/src/geometries/PlaneGeometry.js";
import { RingGeometry } from "three/src/geometries/RingGeometry.js";
import { SphereGeometry } from "three/src/geometries/SphereGeometry.js";
import { MeshStandardMaterial } from "three/src/materials/MeshStandardMaterial.js";
import { Shape } from "three/src/extras/core/Shape.js";

// ── Materials ──
const matCPU_IHS = new MeshStandardMaterial({ color: "#C0C0C0", metalness: 0.85, roughness: 0.15 });
const matCPU_PCB = new MeshStandardMaterial({ color: "#1a4d1a", metalness: 0.1, roughness: 0.6 });
const matRAM_PCB = new MeshStandardMaterial({ color: "#0d4d0d", metalness: 0.05, roughness: 0.55 });
const matRAM_CHIP = new MeshStandardMaterial({ color: "#111", metalness: 0.2, roughness: 0.4 });
const matMobo = new MeshStandardMaterial({ color: "#0d3320", metalness: 0.05, roughness: 0.7 });
const matGPU_PCB = new MeshStandardMaterial({ color: "#1a1a1a", metalness: 0.4, roughness: 0.4 });
const matGPU_FAN = new MeshStandardMaterial({ color: "#333", metalness: 0.6, roughness: 0.3 });
const matGPU_SHROUD = new MeshStandardMaterial({ color: "#222", metalness: 0.5, roughness: 0.35 });
const matStorage = new MeshStandardMaterial({ color: "#888", metalness: 0.8, roughness: 0.2 });
const matStorageLabel = new MeshStandardMaterial({ color: "#ddd", metalness: 0.1, roughness: 0.8 });
const matPSU = new MeshStandardMaterial({ color: "#333", metalness: 0.6, roughness: 0.3 });
const matPSU_FAN = new MeshStandardMaterial({ color: "#222", metalness: 0.7, roughness: 0.2 });
const matPSU_CABLE = new MeshStandardMaterial({ color: "#1a1a1a", metalness: 0.3, roughness: 0.6 });
const matCase_FRAME = new MeshStandardMaterial({ color: "#2a2a3e", metalness: 0.5, roughness: 0.4 });
const matCase_PANEL = new MeshStandardMaterial({ color: "#16162a", metalness: 0.2, roughness: 0.6, transparent: true, opacity: 0.15 });
const matCase_FRONT = new MeshStandardMaterial({ color: "#1a1a2e", metalness: 0.3, roughness: 0.5 });
const matSocket = new MeshStandardMaterial({ color: "#2a2a2a", metalness: 0.8, roughness: 0.3 });
const matSlot = new MeshStandardMaterial({ color: "#1a1a1a", metalness: 0.5, roughness: 0.4 });
const matGold = new MeshStandardMaterial({ color: "#d4a843", metalness: 0.9, roughness: 0.1 });
const matGoldBright = new MeshStandardMaterial({ color: "#ffd700", metalness: 0.95, roughness: 0.05, emissive: "#332200", emissiveIntensity: 0.3 });
const matLabel = new MeshStandardMaterial({ color: "#333", metalness: 0.3, roughness: 0.5 });
const matHeatsink = new MeshStandardMaterial({ color: "#9a9a9a", metalness: 0.7, roughness: 0.25 });
const matIOShield = new MeshStandardMaterial({ color: "#666", metalness: 0.6, roughness: 0.3 });
const matPort = new MeshStandardMaterial({ color: "#444", metalness: 0.5, roughness: 0.4 });
const matUSB = new MeshStandardMaterial({ color: "#1a1a3a", metalness: 0.4, roughness: 0.4 });
const matPowerBtn = new MeshStandardMaterial({ color: "#4fc3f7", metalness: 0.3, roughness: 0.3, emissive: "#0a3a5a", emissiveIntensity: 0.4 });

// ── Reusable geometry ──
const pcbBaseGeo = new BoxGeometry(1.2, 0.025, 1.0);
const cpuIhsGeo = new BoxGeometry(0.38, 0.04, 0.38);
const cpuPcbGeo = new BoxGeometry(0.42, 0.015, 0.42);
const ramBoardGeo = new BoxGeometry(0.055, 0.48, 0.01);
const ramChipGeo = new BoxGeometry(0.045, 0.08, 0.008);
const gpuBoardGeo = new BoxGeometry(0.38, 0.04, 0.26);
const gpuFanRingGeo = new RingGeometry(0.06, 0.09, 24);
const gpuFanBladeGeo = new BoxGeometry(0.025, 0.12, 0.006);
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

// ── Compound geometries ──

// GPU fan compound: ring + blades + center hub
function gpuFanGroup() {
  return [
    { type: "ring", geo: gpuFanRingGeo, mat: matGPU_SHROUD, pos: [0, 0.05, 0], rot: [-Math.PI / 2, 0, 0] },
    ...Array.from({ length: 7 }, (_, i) => {
      const angle = (i / 7) * Math.PI * 2;
      return { type: "box", geo: gpuFanBladeGeo, mat: matGPU_FAN, pos: [Math.cos(angle) * 0.045, 0.047, Math.sin(angle) * 0.045], rot: [0, angle, 0.3] };
    }),
    { type: "sphere", geo: new SphereGeometry(0.03, 8, 8), mat: matGPU_FAN, pos: [0, 0.05, 0], rot: [0, 0, 0] },
  ];
}

// PSU fan grill
function psuFanGrillGroup() {
  return [
    { type: "ring", geo: psuFanGrillGeo, mat: matPSU_FAN, pos: [0, -0.05, 0.22], rot: [0, 0, 0] },
    { type: "sphere", geo: psuFanCenterGeo, mat: matPSU_FAN, pos: [0, -0.05, 0.22], rot: [0, 0, 0] },
    { type: "box", geo: new BoxGeometry(0.2, 0.005, 0.005), mat: matPSU_FAN, pos: [0, -0.02, 0.22], rot: [0, 0, 0] },
    { type: "box", geo: new BoxGeometry(0.2, 0.005, 0.005), mat: matPSU_FAN, pos: [0, -0.08, 0.22], rot: [0, 0, 0] },
    { type: "box", geo: new BoxGeometry(0.005, 0.06, 0.005), mat: matPSU_FAN, pos: [-0.04, -0.05, 0.225], rot: [0, 0, Math.PI / 2] },
    { type: "box", geo: new BoxGeometry(0.005, 0.06, 0.005), mat: matPSU_FAN, pos: [0.04, -0.05, 0.225], rot: [0, 0, Math.PI / 2] },
  ];
}

// PSU cable bundle coming out the front
function psuCablesGroup() {
  const cables = [];
  const cablePositions = [
    { pos: [0.18, 0.05, 0.12], rot: [0, 0.3, 0.4], len: 0.25 },
    { pos: [0.18, 0.05, 0], rot: [0, 0, 0.2], len: 0.28 },
    { pos: [0.18, 0.05, -0.12], rot: [0, -0.3, -0.3], len: 0.22 },
  ];
  for (const c of cablePositions) {
    cables.push({ type: "cyl", geo: new CylinderGeometry(0.018, 0.018, c.len, 8), mat: matPSU_CABLE, pos: c.pos, rot: c.rot });
  }
  // 24-pin connector block at end of middle cable
  cables.push({ type: "box", geo: new BoxGeometry(0.06, 0.04, 0.1), mat: matPSU_CABLE, pos: [0.32, 0.08, 0], rot: [0, 0, 0.2] });
  return cables;
}

// Case wireframe: 12 edges
function caseFrameEdges() {
  const hw = 0.69, hh = 0.44, hd = 0.29;
  return [
    { geo: caseFrameGeoV, mat: matCase_FRAME, pos: [-hw, 0, -hd] },
    { geo: caseFrameGeoV, mat: matCase_FRAME, pos: [hw, 0, -hd] },
    { geo: caseFrameGeoV, mat: matCase_FRAME, pos: [-hw, 0, hd] },
    { geo: caseFrameGeoV, mat: matCase_FRAME, pos: [hw, 0, hd] },
    { geo: new BoxGeometry(1.38, 0.02, 0.02), mat: matCase_FRAME, pos: [0, -hh, -hd] },
    { geo: new BoxGeometry(1.38, 0.02, 0.02), mat: matCase_FRAME, pos: [0, -hh, hd] },
    { geo: new BoxGeometry(0.02, 0.02, 0.58), mat: matCase_FRAME, pos: [-hw, -hh, 0] },
    { geo: new BoxGeometry(0.02, 0.02, 0.58), mat: matCase_FRAME, pos: [hw, -hh, 0] },
    { geo: new BoxGeometry(1.38, 0.02, 0.02), mat: matCase_FRAME, pos: [0, hh, -hd] },
    { geo: new BoxGeometry(1.38, 0.02, 0.02), mat: matCase_FRAME, pos: [0, hh, hd] },
    { geo: new BoxGeometry(0.02, 0.02, 0.58), mat: matCase_FRAME, pos: [-hw, hh, 0] },
    { geo: new BoxGeometry(0.02, 0.02, 0.58), mat: matCase_FRAME, pos: [hw, hh, 0] },
  ];
}

// Case front panel with power button and USB ports
function caseFrontPanel() {
  return [
    // Front panel plate
    { type: "box", geo: new BoxGeometry(1.38, 0.88, 0.01), mat: matCase_FRONT, pos: [0, 0, -0.295], rot: [0, 0, 0] },
    // Power button (glowing blue cylinder)
    { type: "cyl", geo: new CylinderGeometry(0.025, 0.025, 0.02, 16), mat: matPowerBtn, pos: [0.45, 0.3, -0.305], rot: [Math.PI / 2, 0, 0] },
    // USB ports (two small dark rectangles)
    { type: "box", geo: new BoxGeometry(0.04, 0.015, 0.005), mat: matUSB, pos: [-0.35, 0.3, -0.3], rot: [0, 0, 0] },
    { type: "box", geo: new BoxGeometry(0.04, 0.015, 0.005), mat: matUSB, pos: [-0.28, 0.3, -0.3], rot: [0, 0, 0] },
    // Audio jack (small circle)
    { type: "cyl", geo: new CylinderGeometry(0.015, 0.015, 0.005, 12), mat: matPort, pos: [-0.2, 0.3, -0.3], rot: [Math.PI / 2, 0, 0] },
    // Reset button (tiny)
    { type: "cyl", geo: new CylinderGeometry(0.012, 0.012, 0.015, 12), mat: matPort, pos: [0.35, 0.3, -0.3], rot: [Math.PI / 2, 0, 0] },
  ];
}

// CPU pin grid (underside pins visible when exploded up)
function cpuPinGrid() {
  const pins = [];
  const gridSize = 6;
  const spacing = 0.055;
  const start = -((gridSize - 1) * spacing) / 2;
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      pins.push({
        type: "cyl",
        geo: new CylinderGeometry(0.006, 0.006, 0.02, 5),
        mat: matGoldBright,
        pos: [start + i * spacing, -0.035, start + j * spacing],
        rot: [0, 0, 0],
      });
    }
  }
  return pins;
}

// Motherboard I/O shield + heatsinks + ports
function motherboardDetails() {
  return [
    // I/O shield area (metallic block on back edge)
    { type: "box", geo: new BoxGeometry(0.35, 0.12, 0.02), mat: matIOShield, pos: [0.35, 0.02, -0.48], rot: [0, 0, 0] },
    // I/O ports (USB, Ethernet, audio) on shield
    { type: "box", geo: new BoxGeometry(0.04, 0.03, 0.015), mat: matPort, pos: [0.28, 0.03, -0.49], rot: [0, 0, 0] },
    { type: "box", geo: new BoxGeometry(0.04, 0.03, 0.015), mat: matPort, pos: [0.33, 0.03, -0.49], rot: [0, 0, 0] },
    { type: "box", geo: new BoxGeometry(0.05, 0.03, 0.015), mat: matPort, pos: [0.4, 0.03, -0.49], rot: [0, 0, 0] },
    // VRM heatsink near CPU (finned block)
    { type: "box", geo: new BoxGeometry(0.12, 0.06, 0.3), mat: matHeatsink, pos: [0.3, 0.04, 0.15], rot: [0, 0, 0] },
    ...Array.from({ length: 5 }, (_, i) => ({ type: "box", geo: new BoxGeometry(0.12, 0.07, 0.02), mat: matHeatsink, pos: [0.3, 0.045, 0.03 + i * 0.06], rot: [0, 0, 0] })),
    // Chipset heatsink (small finned block)
    { type: "box", geo: new BoxGeometry(0.14, 0.04, 0.14), mat: matHeatsink, pos: [-0.15, 0.03, 0.25], rot: [0, 0, 0] },
    // SATA ports (vertical small rectangles on edge)
    { type: "box", geo: new BoxGeometry(0.03, 0.025, 0.06), mat: matPort, pos: [-0.35, 0.03, -0.2], rot: [0, 0, 0] },
    { type: "box", geo: new BoxGeometry(0.03, 0.025, 0.06), mat: matPort, pos: [-0.35, 0.03, -0.1], rot: [0, 0, 0] },
  ];
}

// GPU output bracket (HDMI/DP ports on back edge)
function gpuOutputBracket() {
  return [
    // Backplate bracket
    { type: "box", geo: new BoxGeometry(0.02, 0.12, 0.2), mat: matIOShield, pos: [0, 0.02, -0.16], rot: [0, 0, 0] },
    // DisplayPort / HDMI ports
    { type: "box", geo: new BoxGeometry(0.015, 0.03, 0.05), mat: matPort, pos: [0.011, 0.04, -0.12], rot: [0, 0, 0] },
    { type: "box", geo: new BoxGeometry(0.015, 0.03, 0.05), mat: matPort, pos: [0.011, 0.04, -0.04], rot: [0, 0, 0] },
    { type: "box", geo: new BoxGeometry(0.015, 0.025, 0.04), mat: matPort, pos: [0.011, -0.01, -0.08], rot: [0, 0, 0] },
  ];
}

// Storage SSD connectors (SATA data + power notches on one end)
function storageConnectors() {
  return [
    // SATA data connector (L-shaped notch)
    { type: "box", geo: new BoxGeometry(0.03, 0.04, 0.08), mat: matPort, pos: [0, -0.02, -0.18], rot: [0, 0, 0] },
    // SATA power connector (wider)
    { type: "box", geo: new BoxGeometry(0.03, 0.05, 0.12), mat: matPort, pos: [0, -0.02, -0.14], rot: [0, 0, 0] },
    // Top label sticker
    { type: "box", geo: new BoxGeometry(0.14, 0.001, 0.2), mat: matStorageLabel, pos: [0, 0.066, 0], rot: [0, 0, 0] },
  ];
}

export const COMPUTER_PARTS = [
  // Case: wireframe + transparent panels + front panel
  {
    id: "case",
    label: "机箱",
    category: "chassis",
    fiveElement: "——",
    description: "容纳并保护所有内部部件。前面板有电源按钮、USB 接口和音频接口。",
    subParts: [
      ...caseFrameEdges(),
      ...caseFrontPanel(),
      // Transparent side/top/bottom panels (keep interior visible)
      { type: "box", geo: new BoxGeometry(1.38, 0.88, 0.005), mat: matCase_PANEL, pos: [0, 0, 0.295], rot: [0, 0, 0] },
      { type: "box", geo: new BoxGeometry(0.005, 0.88, 0.59), mat: matCase_PANEL, pos: [-0.695, 0, 0], rot: [0, 0, 0] },
      { type: "box", geo: new BoxGeometry(0.005, 0.88, 0.59), mat: matCase_PANEL, pos: [0.695, 0, 0], rot: [0, 0, 0] },
      { type: "box", geo: new BoxGeometry(1.38, 0.005, 0.59), mat: matCase_PANEL, pos: [0, -0.442, 0], rot: [0, 0, 0] },
      { type: "box", geo: new BoxGeometry(1.38, 0.005, 0.59), mat: matCase_PANEL, pos: [0, 0.442, 0], rot: [0, 0, 0] },
    ],
    basePos: [0, 0, 0],
    explodeDir: [0, 0, 0],
  },
  // Motherboard: main PCB + I/O shield + heatsinks + SATA ports
  {
    id: "motherboard",
    label: "主板",
    category: "board",
    fiveElement: "控制器",
    description: "所有部件的连接中心。包含芯片组（控制数据流向）、VRM 供电模块、I/O 接口和扩展插槽。对应五大部件中的「控制器」。",
    subParts: [
      { type: "box", geo: pcbBaseGeo, mat: matMobo, pos: [0, 0, 0] },
      ...motherboardDetails(),
      // Chipset
      { type: "box", geo: new BoxGeometry(0.15, 0.008, 0.15), mat: matGold, pos: [-0.1, 0.014, 0.2] },
      // Trace lines
      { type: "box", geo: new BoxGeometry(0.8, 0.001, 0.01), mat: matGold, pos: [0, 0.014, 0.35] },
      { type: "box", geo: new BoxGeometry(0.8, 0.001, 0.01), mat: matGold, pos: [0, 0.014, -0.35] },
    ],
    basePos: [0, 0.05, 0],
    explodeDir: [0, -0.15, 0],
  },
  // CPU: IHS + PCB + pin grid + corner marker
  {
    id: "cpu",
    label: "CPU",
    category: "processor",
    fiveElement: "运算器",
    description: "中央处理器，执行所有计算和逻辑运算。底部有针脚/触点与主板插座连接，内部有 ALU（算术逻辑单元）和寄存器。对应五大部件中的「运算器」。",
    subParts: [
      { type: "box", geo: cpuPcbGeo, mat: matCPU_PCB, pos: [0, -0.01, 0] },
      { type: "box", geo: cpuIhsGeo, mat: matCPU_IHS, pos: [0, 0.02, 0] },
      ...cpuPinGrid(),
      // Corner orientation triangle marker
      { type: "cyl", geo: new CylinderGeometry(0.015, 0.015, 0.002, 3), mat: matGold, pos: [-0.16, 0.042, -0.16], rot: [Math.PI / 2, 0, 0] },
      // Gold contact pads outline
      { type: "box", geo: new BoxGeometry(0.44, 0.003, 0.02), mat: matGold, pos: [0, -0.018, 0.2] },
      { type: "box", geo: new BoxGeometry(0.44, 0.003, 0.02), mat: matGold, pos: [0, -0.018, -0.2] },
    ],
    basePos: [0.05, 0.12, 0.15],
    explodeDir: [0, 0.3, 0.12],
  },
  // RAM stick 1: board + chips + gold contacts + notch
  {
    id: "ram-0",
    label: "内存 1",
    category: "memory",
    fiveElement: "存储器",
    description: "随机存取存储器，临时存储正在运行的程序和数据。断电后数据丢失（易失性）。底部金色触点插入主板 DIMM 插槽。对应五大部件中的「存储器」。",
    subParts: [
      { type: "box", geo: ramBoardGeo, mat: matRAM_PCB, pos: [0, 0, 0] },
      ...Array.from({ length: 4 }, (_, i) => ({ type: "box", geo: ramChipGeo, mat: matRAM_CHIP, pos: [0, -0.15 + i * 0.1, 0.012], rot: [0, 0, 0] })),
      // Gold contact edge (brighter, more visible)
      { type: "box", geo: new BoxGeometry(0.05, 0.16, 0.016), mat: matGoldBright, pos: [0, -0.24, 0.012] },
      // Notch in contact edge
      { type: "box", geo: new BoxGeometry(0.05, 0.012, 0.018), mat: matRAM_PCB, pos: [0, -0.18, 0.013], rot: [0, 0, 0] },
      // Label sticker on top
      { type: "box", geo: new BoxGeometry(0.04, 0.1, 0.003), mat: matLabel, pos: [0, 0.1, 0.008], rot: [0, 0, 0] },
    ],
    basePos: [-0.3, 0.12, 0.1],
    explodeDir: [-0.18, 0.26, 0.12],
  },
  // RAM stick 2
  {
    id: "ram-1",
    label: "内存 2",
    category: "memory",
    fiveElement: "存储器",
    description: "第二条内存条，与内存 1 组成双通道，提升数据吞吐速度。双通道使内存带宽翻倍。",
    subParts: [
      { type: "box", geo: ramBoardGeo, mat: matRAM_PCB, pos: [0, 0, 0] },
      ...Array.from({ length: 4 }, (_, i) => ({ type: "box", geo: ramChipGeo, mat: matRAM_CHIP, pos: [0, -0.15 + i * 0.1, 0.012], rot: [0, 0, 0] })),
      { type: "box", geo: new BoxGeometry(0.05, 0.16, 0.016), mat: matGoldBright, pos: [0, -0.24, 0.012] },
      { type: "box", geo: new BoxGeometry(0.05, 0.012, 0.018), mat: matRAM_PCB, pos: [0, -0.18, 0.013], rot: [0, 0, 0] },
      { type: "box", geo: new BoxGeometry(0.04, 0.1, 0.003), mat: matLabel, pos: [0, 0.1, 0.008], rot: [0, 0, 0] },
    ],
    basePos: [-0.15, 0.12, 0.1],
    explodeDir: [-0.1, 0.26, 0.12],
  },
  // GPU: board + fan + output bracket + PCIe gold finger
  {
    id: "gpu",
    label: "显卡",
    category: "gpu",
    fiveElement: "运算器",
    description: "图形处理器，专门加速图形渲染和并行计算。通过 PCIe 总线与 CPU 通信，背面有 HDMI/DP 输出接口连接显示器。现代 GPU 也可用于 AI 训练。",
    subParts: [
      { type: "box", geo: gpuBoardGeo, mat: matGPU_PCB, pos: [0, 0, 0] },
      // Fan shroud ring + blades + hub
      ...gpuFanGroup(),
      // Output bracket with ports
      ...gpuOutputBracket(),
      // PCIe gold finger connector (bright gold strip)
      { type: "box", geo: new BoxGeometry(0.3, 0.015, 0.025), mat: matGoldBright, pos: [0, -0.03, -0.14] },
      // GPU core heatsink under fan
      { type: "box", geo: new BoxGeometry(0.15, 0.03, 0.12), mat: matHeatsink, pos: [0, 0.025, 0.05], rot: [0, 0, 0] },
    ],
    basePos: [0.25, 0.12, -0.15],
    explodeDir: [0.2, 0.22, -0.15],
  },
  // Storage: SSD shape + SATA connectors + label
  {
    id: "storage",
    label: "硬盘",
    category: "storage",
    fiveElement: "存储器",
    description: "长期存储数据。SSD 比传统 HDD 快数十倍，无机械部件更耐用。通过 SATA 数据线和电源线连接主板和电源。对应五大部件中的「存储器」。",
    subParts: [
      { type: "box", geo: storageGeo, mat: matStorage, pos: [0, 0, 0] },
      ...storageConnectors(),
    ],
    basePos: [-0.45, 0.12, -0.15],
    explodeDir: [-0.26, 0.08, -0.18],
  },
  // PSU: box + fan grill + cable bundle + 24-pin connector
  {
    id: "psu",
    label: "电源",
    category: "power",
    fiveElement: "——",
    description: "将 220V 交流电转换为 12V/5V/3.3V 直流电，通过线缆为主板、CPU、显卡等供电。24-pin 为主板供电，8-pin 为 CPU 供电，6/8-pin 为显卡供电。",
    subParts: [
      { type: "box", geo: psuGeo, mat: matPSU, pos: [0, 0, 0] },
      ...psuFanGrillGroup(),
      ...psuCablesGroup(),
    ],
    basePos: [-0.45, -0.08, 0],
    explodeDir: [-0.3, -0.18, 0],
  },
];

// ── Part lookup map ──
export const PARTS_MAP = Object.fromEntries(COMPUTER_PARTS.map((p) => [p.id, p]));

// ── Connection lines: reference parts with local offsets so they follow explosions ──
// Each connection stores fromPart/toPart (part ID) and fromOffset/toOffset (local offset from that part's basePos)
export const CONNECTIONS = [
  { fromPart: "cpu", fromOffset: [0, 0, 0], toPart: "ram-0", toOffset: [0, 0, 0], color: "#4fc3f7", label: "数据总线", thickness: 0.028 },
  { fromPart: "cpu", fromOffset: [0, 0, 0], toPart: "ram-1", toOffset: [0, 0, 0], color: "#4fc3f7", label: "数据总线", thickness: 0.028 },
  { fromPart: "cpu", fromOffset: [0, 0, 0], toPart: "gpu", toOffset: [0, 0, 0], color: "#4fc3f7", label: "PCIe 总线", thickness: 0.028 },
  { fromPart: "cpu", fromOffset: [0, 0, 0], toPart: "storage", toOffset: [0, 0, 0], color: "#ff9800", label: "SATA 总线", thickness: 0.026 },
  { fromPart: "cpu", fromOffset: [0.02, 0.01, 0.07], toPart: "ram-0", toOffset: [0.02, 0.01, 0.01], color: "#81c784", label: "地址总线", thickness: 0.026 },
  { fromPart: "cpu", fromOffset: [0.02, 0.01, 0.07], toPart: "ram-1", toOffset: [0.02, 0.01, 0.01], color: "#81c784", label: "地址总线", thickness: 0.026 },
  { fromPart: "cpu", fromOffset: [-0.02, -0.01, 0], toPart: "ram-0", toOffset: [0, -0.01, -0.01], color: "#ffeb3b", label: "控制总线", thickness: 0.024 },
  { fromPart: "cpu", fromOffset: [-0.02, -0.01, 0], toPart: "gpu", toOffset: [0, -0.01, -0.01], color: "#ffeb3b", label: "控制总线", thickness: 0.024 },
  { fromPart: "psu", fromOffset: [0, 0, 0], toPart: "motherboard", toOffset: [-0.05, -0.02, 0.3], color: "#ef5350", label: "主板供电", thickness: 0.028 },
  { fromPart: "psu", fromOffset: [0, 0, 0], toPart: "cpu", toOffset: [0, -0.02, 0], color: "#ef5350", label: "CPU 供电", thickness: 0.026 },
  { fromPart: "psu", fromOffset: [0, 0, 0], toPart: "gpu", toOffset: [0, -0.02, 0], color: "#ef5350", label: "GPU 供电", thickness: 0.024 },
];

// Compute a connection endpoint position given part ID, local offset, and explode distance
export function getConnectionEndpoint(partId, offset, distance = 0) {
  const part = PARTS_MAP[partId];
  if (!part) return offset;
  return [
    part.basePos[0] + part.explodeDir[0] * distance + (offset[0] || 0),
    part.basePos[1] + part.explodeDir[1] * distance + (offset[1] || 0),
    part.basePos[2] + part.explodeDir[2] * distance + (offset[2] || 0),
  ];
}

// ── Motherboard surface details (static, always visible on mobo) ──
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

export function getPartInstances(explodeDistance = 0) {
  return COMPUTER_PARTS.flatMap((part) => flattenPart(part, explodeDistance));
}
