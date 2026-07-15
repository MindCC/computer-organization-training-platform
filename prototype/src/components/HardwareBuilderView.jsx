import { useState, useMemo, useRef, useEffect } from "react";
import { ComputerExplodedView } from "./ComputerExplodedView.jsx";
import { ThreeSceneFallback } from "./ThreeSceneFallback.jsx";
import { COMPUTER_PARTS, usePartPositions } from "./computerParts.js";

const BUILDER_SLOTS = ["cpu", "gpu", "storage", "ram-0", "ram-1"];

const PART_OPTIONS = {
  cpu: [
    { id: "cpu-i3", label: "Core i3", spec: "2核4线程 · ¥800", color: "#90caf9" },
    { id: "cpu-i5", label: "Core i5", spec: "4核8线程 · ¥1500", color: "#64b5f6" },
    { id: "cpu-i7", label: "Core i7", spec: "8核16线程 · ¥2500", color: "#42a5f5" },
  ],
  gpu: [
    { id: "gpu-integrated", label: "集成显卡", spec: "日常办公 · ¥0", color: "#a5d6a7" },
    { id: "gpu-3050", label: "GTX 3050", spec: "轻度设计 · ¥1800", color: "#81c784" },
    { id: "gpu-4060", label: "RTX 4060", spec: "3D设计/AI · ¥3500", color: "#66bb6a" },
  ],
  storage: [
    { id: "ssd-256", label: "SSD 256GB", spec: "入门 · ¥300", color: "#ffcc80" },
    { id: "ssd-512", label: "SSD 512GB", spec: "常用 · ¥500", color: "#ffb74d" },
    { id: "ssd-1tb", label: "SSD 1TB", spec: "大容量 · ¥900", color: "#ffa726" },
  ],
  "ram-0": [
    { id: "mem-8", label: "8GB DDR4", spec: "基础办公 · ¥300", color: "#ce93d8" },
    { id: "mem-16", label: "16GB DDR4", spec: "多任务 · ¥500", color: "#ba68c8" },
    { id: "mem-32", label: "32GB DDR4", spec: "专业应用 · ¥1000", color: "#ab47bc" },
  ],
  "ram-1": [
    { id: "mem2-8", label: "8GB DDR4", spec: "基础办公 · ¥300", color: "#ce93d8" },
    { id: "mem2-16", label: "16GB DDR4", spec: "多任务 · ¥500", color: "#ba68c8" },
  ],
};

function slotToKey(slotId) {
  const m = { cpu: "cpu", gpu: "gpu", storage: "storage", "ram-0": "memory", "ram-1": "memory2" };
  return m[slotId] ?? slotId;
}

export function HardwareBuilderView({ parts, onPartChange, score }) {
  const [selecting, setSelecting] = useState(null);
  const [animating, setAnimating] = useState(null); // slot id that just got filled
  const positions = usePartPositions(0);

  // Clear animation after 400ms
  useEffect(() => { if (animating) { const t = setTimeout(() => setAnimating(null), 400); return () => clearTimeout(t); } }, [animating]);

  const slotParts = useMemo(() => BUILDER_SLOTS.map((sid) => positions.find((p) => p.id === sid)), [positions]);

  function handleSlotClick(part) {
    if (selecting === part.id) { setSelecting(null); return; }
    setSelecting(part.id);
  }

  function handlePartSelect(opt) {
    if (!selecting) return;
    const newParts = { ...parts, [slotToKey(selecting)]: opt.id };
    onPartChange(newParts);
    setAnimating(selecting);
    setSelecting(null);
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex" }}>
      <div style={{ flex: 1 }}>
        <ComputerExplodedView cameraPosition={[1.0, 0.8, 2.5]} fallback={<ThreeSceneFallback context="builder" />}>
          {slotParts.map((part) => {
            if (!part) return null;
            const isSelected = selecting === part.id;
            const isFilled = parts[slotToKey(part.id)] != null;
            const isAnimating = animating === part.id;
            const baseScale = isSelected ? 1.15 : 1;
            const scale = isAnimating ? 1.35 : baseScale;
            return (
              <mesh
                key={part.id}
                geometry={part.geo}
                position={part.position}
                scale={[scale, scale, scale]}
                onClick={() => handleSlotClick(part)}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial
                  color={isFilled ? "#4fc3f7" : isSelected ? "#ffa726" : "#555"}
                  emissive={isSelected ? "#ffa726" : isFilled ? "#4fc3f7" : "#000"}
                  emissiveIntensity={isSelected ? 0.6 : isFilled ? 0.4 : 0}
                  metalness={isFilled ? 0.7 : 0.3}
                  roughness={isFilled ? 0.2 : 0.6}
                  transparent
                  opacity={isFilled ? 1 : 0.55}
                />
              </mesh>
            );
          })}
        </ComputerExplodedView>
      </div>

      <div className="builder-panel">
        <h3>{selecting ? `选择 ${slotParts.find((p) => p?.id === selecting)?.label ?? "零件"}` : "点击 3D 部件选择"}</h3>
        {selecting ? (
          <div className="builder-options">
            {PART_OPTIONS[selecting]?.map((opt) => (
              <button key={opt.id} className={parts[slotToKey(selecting)] === opt.id ? "active" : ""}
                onClick={() => handlePartSelect(opt)} type="button">
                {opt.label}<small>{opt.spec}</small>
              </button>
            ))}
            <button className="builder-options" style={{ borderColor: "#555", color: "#888" }} onClick={() => setSelecting(null)} type="button">
              取消
            </button>
          </div>
        ) : (
          <div className="builder-options">
            {BUILDER_SLOTS.map((sid) => {
              const slot = slotParts.find((p) => p?.id === sid);
              const filled = parts[slotToKey(sid)];
              const optName = filled ? (PART_OPTIONS[sid]?.find((o) => o.id === filled)?.label ?? filled) : "未选择";
              return (
                <button key={sid} onClick={() => setSelecting(sid)} type="button"
                  style={{ borderColor: filled ? "#4fc3f7" : "#444" }}>
                  {slot?.label ?? sid}<small>{optName}</small>
                </button>
              );
            })}
          </div>
        )}

        {score ? (
          <div className="builder-score">
            <strong>{score.score} 分</strong>
            <small>{score.passed ? "目标达成" : "需要调整"}</small>
          </div>
        ) : null}

        {score && !score.passed && score.errors ? (
          <div className="builder-warnings">
            {score.errors.map((e, i) => (
              <div key={i} className="builder-warning-item">
                <span>⚠</span> {e}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
