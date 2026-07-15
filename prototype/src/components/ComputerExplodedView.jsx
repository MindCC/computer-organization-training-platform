import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Grid } from "@react-three/drei";
import { Suspense } from "react";

export function ComputerExplodedView({ children, cameraPosition = [1.5, 1.0, 2.0], className = "" }) {
  return (
    <div className={"computer-exploded " + className} style={{ width: "100%", height: "100%", minHeight: 480, background: "#08090a" }}>
      <Suspense fallback={<div className="computer-exploded-loading">加载 3D 场景...</div>}>
        <Canvas dpr={1} gl={{ antialias: false, powerPreference: "low-power" }}>
          <PerspectiveCamera makeDefault position={cameraPosition} fov={45} />
          <OrbitControls
            enableDamping={false}
            minDistance={0.8}
            maxDistance={4}
            target={[0, 0.05, 0]}
          />
          <ambientLight intensity={0.4} />
          <directionalLight position={[3, 4, 2]} intensity={1.2} />
          <directionalLight position={[-2, 1, -1]} intensity={0.3} />
          <Grid position={[0, -0.45, 0]} args={[3, 3]} cellSize={0.1} cellThickness={0.5} cellColor="#1a1a3e" sectionSize={0.5} sectionThickness={1} sectionColor="#2a2a5e" fadeDistance={5} />
          {children}
        </Canvas>
      </Suspense>
    </div>
  );
}
