import { useState } from "react";
import { ComputerExplodedView } from "./ComputerExplodedView.jsx";
import { COMPUTER_PARTS, usePartPositions } from "./computerParts.js";

// Builder-only parts: cpu, ram-0, ram-1, gpu, storage
const BUILDER_SLOTS = COMPUTER_PARTS.filter((p) =>
  ["cpu", "gpu", "storage", "ram-0", "ram-1"].includes(p.id)
);

function BuilderPart({ part, isPlaced, onClick }) {
  const scale = isPlaced ? [1, 1, 1] : [0.6, 0.6, 0.6];
  const opacity = isPlaced ? 1 : 0.4;
  return (
    <mesh
      geometry={part.geo}
      position={part.position}
      scale={scale}
      onClick={onClick}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial {...part.mat} transparent opacity={opacity} />
    </mesh>
  );
}

export function HardwareBuilderView({ parts, onPartChange, score }) {
  const [selectedSlot, setSelectedSlot] = useState(null);
  const positions = usePartPositions(0); // Always assembled view

  function handleSlotClick(part) {
    if (selectedSlot) {
      // Swap: put selected part in this slot
      const newParts = { ...parts };
      const selectedPartId = selectedSlot.id;
      const targetSlot = part.id;
      // Find what was in the selected slot
      const sourceValue = parts[slotToKey(selectedPartId)];
      const targetValue = parts[slotToKey(targetSlot)];
      newParts[slotToKey(targetSlot)] = sourceValue;
      newParts[slotToKey(selectedPartId)] = targetValue;
      onPartChange(newParts);
      setSelectedSlot(null);
    } else {
      setSelectedSlot(part);
    }
  }

  function handlePartCardClick(slotId, partValue) {
    const newParts = { ...parts, [slotToKey(slotId)]: partValue };
    onPartChange(newParts);
    setSelectedSlot(null);
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex" }}>
      <div style={{ flex: 1 }}>
        <ComputerExplodedView cameraPosition={[1.0, 0.8, 2.5]}>
          {positions.map((part) => (
            <BuilderPart
              key={part.id}
              part={part}
              isPlaced={parts[slotToKey(part.id)] != null}
              onClick={() => handleSlotClick(part)}
            />
          ))}
        </ComputerExplodedView>
      </div>

      {/* Parts panel */}
      <div className="builder-panel">
        <h3>零件库</h3>
        {BUILDER_SLOTS.map((slot) => (
          <div key={slot.id} className="builder-slot">
            <span>{slot.label}</span>
            <div className="builder-options">
              {getOptionsForSlot(slot.id).map((opt) => (
                <button
                  key={opt.id}
                  className={parts[slotToKey(slot.id)] === opt.id ? "active" : ""}
                  onClick={() => handlePartCardClick(slot.id, opt.id)}
                  type="button"
                >
                  {opt.label}
                  <small>{opt.spec}</small>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Score */}
        {score ? (
          <div className="builder-score">
            <strong>{score.score} 分</strong>
            <small>{score.passed ? "目标达成" : "需要调整"}</small>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function slotToKey(slotId) {
  const map = { cpu: "cpu", gpu: "gpu", storage: "storage", "ram-0": "memory", "ram-1": "memory2" };
  return map[slotId] ?? slotId;
}

const PART_OPTIONS = {
  cpu: [
    { id: "cpu-i3", label: "Core i3", spec: "2核4线程 · ¥800" },
    { id: "cpu-i5", label: "Core i5", spec: "4核8线程 · ¥1500" },
    { id: "cpu-i7", label: "Core i7", spec: "8核16线程 · ¥2500" },
  ],
  gpu: [
    { id: "gpu-integrated", label: "集成显卡", spec: "日常办公 · ¥0" },
    { id: "gpu-3050", label: "GTX 3050", spec: "轻度设计 · ¥1800" },
    { id: "gpu-4060", label: "RTX 4060", spec: "3D设计/AI · ¥3500" },
  ],
  storage: [
    { id: "ssd-256", label: "SSD 256GB", spec: "入门 · ¥300" },
    { id: "ssd-512", label: "SSD 512GB", spec: "常用 · ¥500" },
    { id: "ssd-1tb", label: "SSD 1TB", spec: "大容量 · ¥900" },
  ],
  memory: [
    { id: "mem-8", label: "8GB", spec: "基础办公 · ¥300" },
    { id: "mem-16", label: "16GB", spec: "多任务 · ¥500" },
    { id: "mem-32", label: "32GB", spec: "专业应用 · ¥1000" },
  ],
  memory2: [
    { id: "mem2-8", label: "8GB", spec: "基础办公 · ¥300" },
    { id: "mem2-16", label: "16GB", spec: "多任务 · ¥500" },
  ],
};

function getOptionsForSlot(slotId) {
  return PART_OPTIONS[slotToKey(slotId)] ?? [];
}
