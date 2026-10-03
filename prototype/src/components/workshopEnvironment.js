import { Group } from "three/src/objects/Group.js";
import { Mesh } from "three/src/objects/Mesh.js";
import { BoxGeometry } from "three/src/geometries/BoxGeometry.js";
import { CylinderGeometry } from "three/src/geometries/CylinderGeometry.js";
import { MeshStandardMaterial } from "three/src/materials/MeshStandardMaterial.js";
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js';
import { PlaneGeometry } from 'three/src/geometries/PlaneGeometry.js';
import { CanvasTexture } from 'three/src/textures/CanvasTexture.js';
import { SRGBColorSpace } from 'three/src/constants.js';

/**
 * Add a compact engineering workbench around the assembly model.
 * The caller owns the scene and resource registry; every disposable resource
 * created here is added to that registry.
 */
export function createWorkshopEnvironment(scene, registry, asset, assembly = false) {
  const root = new Group();
  root.name = "workshop-environment";
  scene.add(root);

  const material = (options) => registry.add(new MeshStandardMaterial(options));
  const navy = material({ color: "#536d78", roughness: 0.72, metalness: 0.18 });
  const navyDark = material({ color: "#091722", roughness: 0.62, metalness: 0.3 });
  const steel = material({ color: "#698393", roughness: 0.38, metalness: 0.68 });
  const teal = material({ color: "#20a6a4", roughness: 0.4, metalness: 0.25 });
  const matSurface = material({ color: "#183746", roughness: 0.78, metalness: 0.08 });
  const grid = material({ color: "#2d6370", roughness: 0.6, metalness: 0.08 });
  let screen = material({
    color: "#0c2b35",
    emissive: "#11b9b1",
    emissiveIntensity: 0.08,
    roughness: 0.35,
  });

  function addBox(name, size, position, mat, rotation) {
    const mesh = new Mesh(registry.add(new BoxGeometry(...size)), mat);
    mesh.name = name;
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  }

  // Top surface is just below the shared assembly floor at y = -0.45.
  addBox("workbench-top", [3.3, 0.08, 2.25], [0, -0.51, -0.05], navy);
  if (assembly) {
    const floor = material({ color:'#c9d1cf', roughness:.92 });
    addBox('workshop-floor', [8,.025,6], [.6,-1.515,0], floor);
    for (const x of [-1.4,1.4]) for (const z of [-.93,.83]) {
      addBox('workbench-leg',[.085,.95,.085],[x,-1.025,z],navyDark);
    }
  }
  addBox("assembly-mat", [1.72, 0.018, 1.2], [0, -0.458, 0], matSurface);

  // A restrained engraved grid gives scale without competing with part hotspots.
  for (let i = -4; i <= 4; i += 1) {
    addBox("mat-grid-z", [0.008, 0.004, 1.12], [i * 0.19, -0.447, 0], grid);
  }
  for (let i = -3; i <= 3; i += 1) {
    addBox("mat-grid-x", [1.64, 0.004, 0.008], [0, -0.447, i * 0.18], grid);
  }

  // Low monitor behind the computer, angled squarely toward the learner.
  const modeledMonitor = asset?.scene.getObjectByName('monitor');
  if (modeledMonitor) {
    for (const name of ['monitor', 'keyboard', 'mouse']) {
      const node = asset.scene.getObjectByName(name);
      if (!node) continue;
      node.removeFromParent();
      node.position.multiplyScalar(3.1);
      node.scale.multiplyScalar(3.1);
      node.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material.name === 'Reference / Monitor screen') {
          screen = registry.add(mesh.material.clone());
          screen.emissive.set('#11b9b1');
          mesh.material = screen;
        }
      });
      root.add(node);
    }
  } else {
    addBox("monitor-shell", [1.02, 0.48, 0.055], [0.28, 0.16, -0.91], navyDark);
    addBox("monitor-screen", [0.9, 0.37, 0.012], [0.28, 0.17, -0.876], screen);
    addBox("monitor-stand", [0.08, 0.32, 0.07], [0.28, -0.25, -0.91], steel);
    addBox("monitor-foot", [0.42, 0.035, 0.22], [0.28, -0.405, -0.84], navyDark);
  }
  // Simple status rails suggest a live diagnostic view without requiring textures.
  const diagnosticRails = [
    addBox("screen-rail-1", [0.62, 0.012, 0.008], [0.22, 0.25, -0.866], teal),
    addBox("screen-rail-2", [0.38, 0.012, 0.008], [0.1, 0.17, -0.866], teal),
    addBox("screen-rail-3", [0.5, 0.012, 0.008], [0.16, 0.09, -0.866], teal),
  ];
  let screenMessage = null, displayTexture, displayContext, displayCanvas;
  if (assembly) {
    displayCanvas = document.createElement('canvas');
    displayCanvas.width = 1024; displayCanvas.height = 512;
    displayContext = displayCanvas.getContext('2d');
    displayTexture = registry.add(new CanvasTexture(displayCanvas));
    displayTexture.colorSpace = SRGBColorSpace;
    screenMessage = new Mesh(registry.add(new PlaneGeometry(modeledMonitor ? .962 : .88, modeledMonitor ? .488 : .355)),
      registry.add(new MeshBasicMaterial({map:displayTexture,toneMapped:false})));
    screenMessage.name = 'monitor-boot-message';
    screenMessage.position.set(.28,.169,-.872);
    screenMessage.visible = false;
    root.add(screenMessage);
  }
  let displayedPhase;
  function updateScreen(phase) {
    if (!screenMessage || phase === displayedPhase) return;
    displayedPhase = phase;
    screenMessage.visible = Boolean(phase);
    for (const rail of diagnosticRails) rail.visible = !phase;
    if (!phase) return;
    const ready = phase === 'ready';
    const ctx = displayContext;
    ctx.fillStyle = '#081e27'; ctx.fillRect(0,0,1024,512);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = ready ? '#70f0c0' : '#b3d9df';
    ctx.font = 'bold 112px "Microsoft YaHei", "Noto Sans SC", sans-serif';
    ctx.fillText(ready ? '开机成功' : '正在开机…',512,235);
    ctx.fillStyle = '#9ab8c0';
    ctx.font = '30px "Microsoft YaHei", sans-serif';
    ctx.fillText(ready ? '自检通过 · 系统已就绪' : '正在检测处理器、内存与存储设备',512,338);
    displayTexture.needsUpdate = true;
    screenMessage.userData.message = ready ? '开机成功' : '正在开机';
  }

  // Restrained desk props: a parts tray and an ESD tool at the right edge.
  addBox("parts-tray", [0.55, 0.035, 0.4], [1.18, -0.445, 0.35], navyDark);
  addBox("parts-tray-inset", [0.46, 0.014, 0.31], [1.18, -0.422, 0.35], steel);
  const tool = new Mesh(registry.add(new CylinderGeometry(0.025, 0.035, 0.48, 10)), navyDark);
  tool.name = "precision-driver";
  tool.position.set(1.22, -0.39, -0.27);
  tool.rotation.set(Math.PI / 2, 0, 0.45);
  tool.castShadow = true;
  root.add(tool);
  const tip = new Mesh(registry.add(new CylinderGeometry(0.01, 0.018, 0.22, 8)), steel);
  tip.name = "precision-driver-tip";
  tip.position.set(1.08, -0.4, -0.4);
  tip.rotation.copy(tool.rotation);
  tip.castShadow = true;
  root.add(tip);

  let isPowered = false;
  return {
    update(powered, time = 0, reducedMotion = false, bootPhase = null) {
      updateScreen(bootPhase);
      isPowered = Boolean(powered);
      screen.emissiveIntensity = isPowered
        ? (reducedMotion ? 0.7 : 0.66 + Math.sin(time * 1.8) * 0.06)
        : 0.08;
    },
    dispose() {
      scene.remove(root);
    },
  };
}
