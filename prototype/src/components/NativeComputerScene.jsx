import { useEffect, useRef, useState } from "react";
import { canUseWebGL } from "../webglSupport.js";
import { createNativeComputerScene } from "./nativeComputerScene.js";

export function NativeComputerScene({ viewState, onPartSelect, onInstall, onConnector, fallback, assembly = false, exploration = false }) {
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const latestSelectRef = useRef(onPartSelect);
  const latestStateRef = useRef(viewState);
  const latestInstallRef = useRef(onInstall);
  latestInstallRef.current = onInstall;
  const latestConnectorRef=useRef(onConnector);latestConnectorRef.current=onConnector;
  const [assetMessage, setAssetMessage] = useState(assembly ? '正在加载教学主机模型…' : '');
  const [failed, setFailed] = useState(() => !canUseWebGL());
  latestSelectRef.current = onPartSelect;
  latestStateRef.current = viewState;

  useEffect(() => {
    if (failed || !containerRef.current) return undefined;
    let cancelled = false;
    let releaseAsset = () => {};
    async function start() {
      let asset;
      if (assembly || exploration) {
        try {
          const loader = await import('./teachingPcAsset.js');
          asset = await loader.loadTeachingAsset();
          releaseAsset = () => loader.disposeTeachingAsset(asset);
          if (cancelled) { releaseAsset(); return; }
          setAssetMessage('Blender 教学模型');
        } catch {
          if (cancelled) return;
          setAssetMessage('精细模型加载失败，已使用基础教学模型。');
        }
      }
      if (cancelled) return;
      try {
        const controller = createNativeComputerScene(containerRef.current, {
          assembly, exploration, asset,
          onInstall: (...args) => latestInstallRef.current?.(...args),
          onConnector: id => latestConnectorRef.current?.(id),
          onPartSelect: (partId) => latestSelectRef.current?.(partId),
          onFailure: () => setFailed(true),
        });
        controllerRef.current = controller;
        controller.setViewState(latestStateRef.current);
      } catch {
        controllerRef.current?.dispose();
        controllerRef.current = null;
        releaseAsset();
        setFailed(true);
      }
    }
    start();
    return () => {
      cancelled = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
      releaseAsset();
    };
  }, [failed, assembly, exploration]);

  useEffect(() => { controllerRef.current?.setViewState(viewState); }, [viewState]);

  if (failed) return fallback;
  return <><div className="computer-exploded" data-renderer="native-three" ref={containerRef} />{assembly && <span className="assembly-model-status" role="status">{assetMessage}</span>}</>;
}
