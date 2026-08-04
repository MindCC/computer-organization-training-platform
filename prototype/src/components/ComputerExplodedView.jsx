import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Grid, Environment, Lightformer } from "@react-three/drei";
import { Suspense, useState } from "react";
import { canUseWebGL } from "../webglSupport.js";
import { ThreeSceneFallback } from "./ThreeSceneFallback.jsx";

export function ComputerExplodedView({
  children,
  cameraPosition = [1.5, 1.0, 2.0],
  className = "",
  fallback = null,
}) {
  const [webglAvailable] = useState(canUseWebGL);
  return (
    <div className={"computer-exploded " + className} style={{ width: "100%", height: "100%", minHeight: 480, background: "#08090a" }}>
      {webglAvailable ? (
        <Suspense fallback={<div className="computer-exploded-loading">加载 3D 场景...</div>}>
          <Canvas
            dpr={[1, 1.5]}
            shadows
            gl={{ antialias: true, powerPreference: "low-power" }}
          >
            <PerspectiveCamera makeDefault position={cameraPosition} fov={45} />
            <OrbitControls
              enableDamping={false}
              minDistance={0.8}
              maxDistance={4}
              target={[0, 0.05, 0]}
            />
            {/* 离线程序化环境贴图：Lightformer 生成 PBR 反射环境，无网络依赖 */}
            <Environment resolution={256} frames={1}>
              <Lightformer intensity={2.4} position={[0, 4, 2]} scale={[8, 4, 1]} color="#ffffff" />
              <Lightformer intensity={1.6} position={[-3, 1, 1]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} color="#cfe8ff" />
              <Lightformer intensity={1.2} position={[3, -1, -2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} color="#ffe6c4" />
              <Lightformer intensity={1.0} position={[0, 0.5, 3]} scale={[8, 2, 1]} color="#ffffff" />
            </Environment>

            {/* 光照：暖色主光 + 补光 + rim 背光 */}
            <ambientLight intensity={0.35} />
            <directionalLight
              position={[3, 4, 2]}
              intensity={1.4}
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
              shadow-camera-near={0.1}
              shadow-camera-far={12}
              shadow-camera-left={-2}
              shadow-camera-right={2}
              shadow-camera-top={2}
              shadow-camera-bottom={-2}
              shadow-bias={-0.0004}
            />
            <directionalLight position={[-2, 1, -1]} intensity={0.45} color="#ffd9a0" />
            <directionalLight position={[0, 0, -2.5]} intensity={0.6} color="#9db8ff" />
            <Grid position={[0, -0.45, 0]} args={[3, 3]} cellSize={0.1} cellThickness={0.5} cellColor="#1a1a3e" sectionSize={0.5} sectionThickness={1} sectionColor="#2a2a5e" fadeDistance={5} receiveShadow />
            {children}
          </Canvas>
        </Suspense>
      ) : (fallback ?? <ThreeSceneFallback />)}
    </div>
  );
}
