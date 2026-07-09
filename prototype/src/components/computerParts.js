import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, Group } from "three";
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
  { id: "case", label: "机箱", category: "chassis", geo: caseGeo, mat: matCase, size: [1.4, 0.9, 0.6], basePos: [0, 0, 0], explodeDir: [0, 0, 0] },
  { id: "motherboard", label: "主板", category: "board", geo: moboGeo, mat: matMobo, size: [1.2, 0.03, 1.0], basePos: [0, 0.05, 0], explodeDir: [0, 0.06, 0] },
  { id: "cpu", label: "CPU", category: "processor", geo: cpuGeo, mat: matCPU, size: [0.45, 0.06, 0.45], basePos: [0.05, 0.12, 0.15], explodeDir: [0, 0.08, 0] },
  { id: "ram-0", label: "内存 1", category: "memory", geo: ramGeo, mat: matRAM, size: [0.06, 0.5, 0.02], basePos: [-0.3, 0.12, 0.1], explodeDir: [-0.04, 0.06, 0] },
  { id: "ram-1", label: "内存 2", category: "memory", geo: ramGeo, mat: matRAM, size: [0.06, 0.5, 0.02], basePos: [-0.15, 0.12, 0.1], explodeDir: [-0.02, 0.06, 0] },
  { id: "gpu", label: "显卡", category: "gpu", geo: gpuGeo, mat: matGPU, size: [0.4, 0.07, 0.28], basePos: [0.25, 0.12, -0.15], explodeDir: [0.04, 0.06, 0] },
  { id: "storage", label: "硬盘", category: "storage", geo: storageGeo, mat: matStorage, size: [0.2, 0.14, 0.35], basePos: [-0.45, 0.12, -0.15], explodeDir: [-0.06, 0, 0] },
  { id: "psu", label: "电源", category: "power", geo: psuGeo, mat: matPSU, size: [0.35, 0.28, 0.45], basePos: [-0.45, -0.08, 0], explodeDir: [-0.08, 0, 0] },
];

// ── Hook ──
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
