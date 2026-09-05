import { useEffect, useRef, useState } from "react";
import { canUseWebGL } from "../webglSupport.js";
import { createNativeComputerScene } from "./nativeComputerScene.js";

export function NativeComputerScene({ viewState, onPartSelect, onInstall, fallback, assembly = false }) {
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const latestSelectRef = useRef(onPartSelect);
  const latestStateRef = useRef(viewState);
  const latestInstallRef = useRef(onInstall);
  latestInstallRef.current = onInstall;
  const [failed, setFailed] = useState(() => !canUseWebGL());
  latestSelectRef.current = onPartSelect;
  latestStateRef.current = viewState;

  useEffect(() => {
    if (failed || !containerRef.current) return undefined;
    try {
      const controller = createNativeComputerScene(containerRef.current, {
        assembly,
        onInstall: (...args) => latestInstallRef.current?.(...args),
        onPartSelect: (partId) => latestSelectRef.current?.(partId),
        onFailure: () => setFailed(true),
      });
      controllerRef.current = controller;
      controller.setViewState(latestStateRef.current);
    } catch {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setFailed(true);
    }
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [failed, assembly]);

  useEffect(() => { controllerRef.current?.setViewState(viewState); }, [viewState]);

  if (failed) return fallback;
  return <div className="computer-exploded" data-renderer="native-three" ref={containerRef} />;
}
