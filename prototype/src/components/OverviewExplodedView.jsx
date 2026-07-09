import { useState, useEffect, useRef, useMemo } from "react";
import { ComputerExplodedView } from "./ComputerExplodedView.jsx";
import { COMPUTER_PARTS, CONNECTIONS, usePartPositions } from "./computerParts.js";
import { useMemo as useMemoThree } from "react";

function ConnectionLine({ from, to, color, thickness = 0.006 }) {
  const lineGeo = useMemoThree(() => {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return { len, mid: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2] };
  }, [from, to]);
  return (
    <mesh position={lineGeo.mid}>
      <cylinderGeometry args={[thickness, thickness, lineGeo.len, 6]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
    </mesh>
  );
}

function Part({ part, isHovered, onClick, onPointerOver, onPointerOut }) {
  const scale = isHovered ? [1.15, 1.15, 1.15] : [1, 1, 1];
  return (
    <mesh
      geometry={part.geo}
      material={part.mat}
      position={part.position}
      scale={scale}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      castShadow
      receiveShadow
    />
  );
}

export function OverviewExplodedView({ autoPlay = true }) {
  const [explodeDistance, setExplodeDistance] = useState(0);
  const [hoveredPart, setHoveredPart] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const timerRef = useRef(null);
  const parts = usePartPositions(explodeDistance);

  // Auto-play explosion animation
  useEffect(() => {
    if (!autoPlay) return;
    let dir = 1;
    let val = 0;
    timerRef.current = setInterval(() => {
      val += 0.012 * dir;
      if (val >= 2.0) { val = 2.0; dir = -1; }
      if (val <= 0) { val = 0; dir = 1; }
      setExplodeDistance(val);
    }, 30);
    return () => clearInterval(timerRef.current);
  }, [autoPlay]);

  function handlePartClick(part) {
    setSelectedPart(selectedPart?.id === part.id ? null : part);
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ComputerExplodedView cameraPosition={[1.2, 0.8, 2.0]}>
        {parts.map((part) => (
          <Part
            key={part.id}
            part={part}
            isHovered={hoveredPart?.id === part.id}
            onClick={() => handlePartClick(part)}
            onPointerOver={() => setHoveredPart(part)}
            onPointerOut={() => setHoveredPart(null)}
          />
        ))}
        {CONNECTIONS.map((conn, i) => (
          <ConnectionLine key={`conn-${i}`} from={conn.from} to={conn.to} color={conn.color} thickness={conn.thickness} />
        ))}
      </ComputerExplodedView>

      {/* Overlay: control bar */}
      <div className="exploded-controls">
        <button onClick={() => setExplodeDistance(0)} type="button">装配</button>
        <button onClick={() => setExplodeDistance(1.5)} type="button">爆炸</button>
        <button onClick={() => setExplodeDistance(2.0)} type="button">全展开</button>
        <span className="exploded-hint">拖拽旋转 · 滚轮缩放 · 点击部件查看信息</span>
      </div>

      {/* Overlay: part info card */}
      {selectedPart ? (
        <div className="exploded-info-card">
          <strong>{selectedPart.label}</strong>
          <small>{selectedPart.category} · 五大部件：{selectedPart.fiveElement}</small>
          <p className="exploded-info-desc">{selectedPart.description}</p>
          <button onClick={() => setSelectedPart(null)} type="button">✕</button>
        </div>
      ) : null}
    </div>
  );
}
