import { useState, useEffect, useRef, useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import { ComputerExplodedView } from "./ComputerExplodedView.jsx";
import { CONNECTIONS, MOBO_DETAILS, usePartPositions } from "./computerParts.js";

// Assembly steps: which part appears at which step
const ASSEMBLY_STEPS = [
  { step: 1, label: "机箱", partIds: ["case"], desc: "第一步：准备好机箱。机箱是计算机的外壳，保护内部所有部件。前面板有电源按钮和 USB 接口。" },
  { step: 2, label: "安装电源", partIds: ["case", "psu"], desc: "第二步：安装电源（PSU）。电源将 220V 交流电转换为 12V/5V/3.3V 直流电，为主板和各个部件供电。" },
  { step: 3, label: "安装主板", partIds: ["case", "psu", "motherboard"], desc: "第三步：安装主板。主板是所有部件的连接中心，包含芯片组和扩展插槽。对应五大部件中的「控制器」。", highlight: "motherboard" },
  { step: 4, label: "安装 CPU", partIds: ["case", "psu", "motherboard", "cpu"], desc: "第四步：安装 CPU（中央处理器）。CPU 是计算机的「大脑」，执行所有运算。对应五大部件中的「运算器」。", highlight: "cpu" },
  { step: 5, label: "安装内存", partIds: ["case", "psu", "motherboard", "cpu", "ram-0", "ram-1"], desc: "第五步：安装内存条。内存是 CPU 的工作区，临时存放正在运行的程序和数据。对应五大部件中的「存储器」。", highlight: "ram-0" },
  { step: 6, label: "安装显卡", partIds: ["case", "psu", "motherboard", "cpu", "ram-0", "ram-1", "gpu"], desc: "第六步：安装显卡（GPU）。显卡专门处理图形和并行计算，通过 PCIe 总线与 CPU 通信。", highlight: "gpu" },
  { step: 7, label: "安装硬盘", partIds: ["case", "psu", "motherboard", "cpu", "ram-0", "ram-1", "gpu", "storage"], desc: "第七步：安装硬盘。硬盘长期保存操作系统、软件和文件。SSD 比机械硬盘快数十倍。", highlight: "storage" },
  { step: 8, label: "整机完成", partIds: ["case", "psu", "motherboard", "cpu", "ram-0", "ram-1", "gpu", "storage"], desc: "组装完成！各部件通过数据总线、地址总线和控制总线相互通信，电源为所有部件供电。试试旋转和缩放查看整机结构。", showConnections: true },
];

function ConnectionLine({ from, to, color, thickness = 0.006 }) {
  const { position, quaternion, length } = useMemo(() => {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
    const dir = new Vector3(dx, dy, dz).normalize();
    const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
    return { position: mid, quaternion: quat, length: len };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[thickness, thickness, length, 6]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
    </mesh>
  );
}

function DataFlowParticle({ from, to, color = "#4fc3f7", speed = 0.3 }) {
  const meshRef = useRef(null);
  const progress = useRef(Math.random()); // Random start position for each line
  useFrame((_, delta) => {
    if (!meshRef.current) return;
    progress.current = (progress.current + delta * speed) % 1;
    const t = progress.current;
    meshRef.current.position.set(
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    );
  });
  return (
    <mesh ref={meshRef} geometry={particleGeo}>
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

export function OverviewExplodedView({ autoPlay = true }) {
  const [mode, setMode] = useState(autoPlay ? "auto" : "step"); // "auto" | "step"
  const [explodeDistance, setExplodeDistance] = useState(0);
  const [currentStep, setCurrentStep] = useState(0); // 0 = all parts exploded, 1-8 = assembly steps
  const [selectedPart, setSelectedPart] = useState(null);
  const timerRef = useRef(null);
  const allParts = usePartPositions(explodeDistance);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (mode !== "step") return;
      if (e.key === "ArrowRight" && currentStep < 8) setCurrentStep((s) => s + 1);
      if (e.key === "ArrowLeft" && currentStep > 1) setCurrentStep((s) => s - 1);
      if (e.key === " " && currentStep < 8) { e.preventDefault(); setCurrentStep((s) => s + 1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, currentStep]);

  // Filter parts by current step
  const visibleParts = useMemo(() => {
    if (mode === "auto" || currentStep === 0) return allParts;
    const stepData = ASSEMBLY_STEPS[currentStep - 1];
    if (!stepData) return allParts;
    return allParts.filter((p) => stepData.partIds.includes(p.id));
  }, [mode, currentStep, allParts]);

  const stepData = currentStep > 0 ? ASSEMBLY_STEPS[currentStep - 1] : null;
  const showConnections = stepData?.showConnections ?? false;

  // Auto-play explosion
  useEffect(() => {
    if (mode !== "auto") { clearInterval(timerRef.current); return; }
    let dir = 1, val = 0;
    timerRef.current = setInterval(() => {
      val += 0.012 * dir;
      if (val >= 2.0) { val = 2.0; dir = -1; }
      if (val <= 0) { val = 0; dir = 1; }
      setExplodeDistance(val);
    }, 30);
    return () => clearInterval(timerRef.current);
  }, [mode]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ComputerExplodedView cameraPosition={[1.2, 0.8, 2.0]}>
        {visibleParts.map((part) => {
          const isHighlighted = stepData?.highlight === part.id;
          const scale = isHighlighted ? [1.2, 1.2, 1.2] : [1, 1, 1];
          return (
            <mesh
              key={part.id}
              geometry={part.geo}
              material={part.mat}
              position={part.position}
              scale={scale}
              onClick={() => setSelectedPart(selectedPart?.id === part.id ? null : part)}
              castShadow
              receiveShadow
            >
              {isHighlighted && (
                <meshStandardMaterial
                  color={part.mat.color}
                  emissive="#ffa726"
                  emissiveIntensity={0.5}
                  metalness={part.mat.metalness}
                  roughness={part.mat.roughness}
                />
              )}
            </mesh>
          );
        })}
        {(showConnections || mode === "auto") && (
          <>
            {CONNECTIONS.map((conn, i) => (
              <ConnectionLine key={`conn-${i}`} from={conn.from} to={conn.to} color={conn.color} thickness={conn.thickness} />
            ))}
            {CONNECTIONS.map((conn, i) => (
              <DataFlowParticle key={`flow-${i}`} from={conn.from} to={conn.to} color={conn.color} />
            ))}
          </>
        )}
        {visibleParts.some((p) => p.id === "motherboard") && MOBO_DETAILS.map((d, i) => (
          <mesh key={`mobo-${i}`} geometry={d.geo} material={d.mat} position={d.pos} />
        ))}
      </ComputerExplodedView>

      {/* Top bar: mode toggle */}
      <div className="exploded-topbar">
        <button className={mode === "auto" ? "active" : ""} onClick={() => { setMode("auto"); setCurrentStep(0); }} type="button">自动爆炸</button>
        <button className={mode === "step" ? "active" : ""} onClick={() => { setMode("step"); setCurrentStep(1); }} type="button">分步组装</button>
        {mode === "auto" && (
          <div className="exploded-controls-inline">
            <button onClick={() => setExplodeDistance(0)} type="button">装配</button>
            <button onClick={() => setExplodeDistance(1.5)} type="button">爆炸</button>
            <button onClick={() => setExplodeDistance(2.0)} type="button">全展开</button>
          </div>
        )}
      </div>

      {/* Bottom bar: step controls (step mode only) */}
      {mode === "step" && (
        <div className="exploded-stepbar">
          <button onClick={() => setCurrentStep(Math.max(1, currentStep - 1))} disabled={currentStep <= 1} type="button">◀ 上一步</button>
          <div className="exploded-step-indicator">
            {ASSEMBLY_STEPS.map((s) => (
              <span key={s.step} className={s.step === currentStep ? "active" : s.step < currentStep ? "done" : ""}>
                {s.step}
              </span>
            ))}
          </div>
          <button onClick={() => setCurrentStep(Math.min(8, currentStep + 1))} disabled={currentStep >= 8} type="button">下一步 ▶</button>
        </div>
      )}

      {/* Step description */}
      {stepData && (
        <div className="exploded-step-desc">
          <strong>{stepData.label}</strong>
          <p>{stepData.desc}</p>
        </div>
      )}

      {/* Part info card */}
      {selectedPart && (
        <div className="exploded-info-card">
          <strong>{selectedPart.label}</strong>
          <small>{selectedPart.category} · 五大部件：{selectedPart.fiveElement}</small>
          <p className="exploded-info-desc">{selectedPart.description}</p>
          <button onClick={() => setSelectedPart(null)} type="button">✕</button>
        </div>
      )}

      {/* Connection legend */}
      <div className="exploded-legend">
        <span><i style={{ background: "#4fc3f7" }} /> 数据总线</span>
        <span><i style={{ background: "#81c784" }} /> 地址总线</span>
        <span><i style={{ background: "#ffeb3b" }} /> 控制总线</span>
        <span><i style={{ background: "#ef5350" }} /> 供电线</span>
      </div>
    </div>
  );
}
