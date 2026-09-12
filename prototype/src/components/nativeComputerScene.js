import { createStructureScene } from './assemblyStructureScene.js';
import { createCableScene } from './assemblyCableScene.js';
import { attachTeachingPart, readSocketPose, createTeachingMotion } from './teachingAssetRig.js';
import { addWorkshopReflections } from './workshopLighting.js';
import { Box3 } from 'three/src/math/Box3.js';
import { AmbientLight } from "three/src/lights/AmbientLight.js";
import { DirectionalLight } from "three/src/lights/DirectionalLight.js";
import { Color } from "three/src/math/Color.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { Vector2 } from "three/src/math/Vector2.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { Plane } from "three/src/math/Plane.js";
import { CylinderGeometry } from "three/src/geometries/CylinderGeometry.js";
import { SphereGeometry } from "three/src/geometries/SphereGeometry.js";
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three/src/constants.js';
import { createWorkshopEnvironment } from './workshopEnvironment.js';
import { createAssemblyInteraction } from './assemblySceneInteraction.js';
import { assemblyCameraPose } from '../assemblySceneLayout.js';
import { ASSEMBLY_PARTS } from '../hardwareAssembly.js';
import { Group } from "three/src/objects/Group.js";
import { Mesh } from "three/src/objects/Mesh.js";
import { MeshBasicMaterial } from "three/src/materials/MeshBasicMaterial.js";
import { MeshStandardMaterial } from "three/src/materials/MeshStandardMaterial.js";
import { PerspectiveCamera } from "three/src/cameras/PerspectiveCamera.js";
import { Raycaster } from "three/src/core/Raycaster.js";
import { Scene } from "three/src/scenes/Scene.js";
import { WebGLRenderer } from "three/src/renderers/WebGLRenderer.js";
import { COMPUTER_PARTS, CONNECTIONS, MOBO_DETAILS, getConnectionEndpoint } from "./computerParts.js";
import {
  createResourceRegistry,
  normalizeSceneViewState,
  partPosition,
  screenPointFromNdc,
} from "./nativeComputerSceneState.js";

const UP = new Vector3(0, 1, 0);
const cameraPosition = new Vector3();

function createPartMesh(subPart, partId, registry) {
  const base = registry.add(subPart.mat.clone());
  const xray = registry.add(new MeshStandardMaterial({
    color: base.color,
    metalness: base.metalness,
    roughness: base.roughness,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  }));
  const highlighted = registry.add(base.clone());
  highlighted.emissive.set("#16b8a6");
  highlighted.emissiveIntensity = 0.09;

  const mesh = new Mesh(registry.add(subPart.geo.clone()), base);
  mesh.castShadow = !base.transparent;
  mesh.receiveShadow = true;
  mesh.position.fromArray(subPart.pos ?? [0, 0, 0]);
  mesh.rotation.fromArray(subPart.rot ?? [0, 0, 0]);
  mesh.userData.partId = partId;
  if (subPart.fanBlade) mesh.userData.fanAngle = Math.atan2((subPart.pos?.[1] ?? 0) + 0.08, (subPart.pos?.[0] ?? 0) - 0.39);
  mesh.userData.materials = { base, xray, highlighted };
  return mesh;
}

function applyMeshMaterial(mesh, state, partId) {
  const materials = mesh.userData.materials;
  if (!materials) return;
  mesh.material = state.xray
    ? materials.xray
    : state.selectedPartId === partId
      ? materials.highlighted
      : materials.base;
}

export function createNativeComputerScene(container, options = {}) {
  const registry = createResourceRegistry();
  const scene = new Scene();
  scene.background = new Color(options.assembly ? '#dce5e8' : '#15232c');
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  const initialPosition = options.cameraPosition ?? (options.assembly ? assemblyCameraPose().position : [1.5, 1.6, 2.5]);
  camera.position.fromArray(initialPosition);
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.assembly ? 1.05 : 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.domElement.dataset.partPicking = "enabled";
  container.append(renderer.domElement);

  const cameraTarget = new Vector3(options.assembly ? -0.28 : 0, 0.05, 0);
  const offset = camera.position.clone().sub(cameraTarget);
  let cameraDistance = offset.length();
  let azimuth = Math.atan2(offset.x, offset.z);
  let polar = Math.acos(offset.y / cameraDistance);
  let drag = null;
  let suppressClick = false;
  let assemblyInteraction = null;
  let cameraTransition = null;
  let pendingCameraTransition = null;
  const explorationOffsets = new Map();
  let explorationDrag = null;
  const dragPlane = new Plane();
  const dragPoint = new Vector3();
  function castPointer(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }
  function updateCamera() {
    const sinPolar = Math.sin(polar);
    camera.position.set(
      cameraDistance * sinPolar * Math.sin(azimuth),
      cameraDistance * Math.cos(polar),
      cameraDistance * sinPolar * Math.cos(azimuth),
    ).add(cameraTarget);
    camera.lookAt(cameraTarget);
    renderer.domElement.dataset.cameraChanged = "true";
  }
  function onPointerDown(event) {
    if (event.button === 1) event.preventDefault();
    cameraTransition = null;
    pendingCameraTransition = null;
    if (options.exploration && event.button === 0) {
      castPointer(event);
      const hit = raycaster.intersectObjects([...partGroups.values()].filter(entry => entry.group.visible).map(entry => entry.group), true)[0];
      const id = hit?.object.userData.partId;
      const entry = partGroups.get(id);
      if (entry && id !== 'case') {
        dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), hit.point);
        explorationDrag = { id, start: hit.point.clone(), offset: (explorationOffsets.get(id) ?? new Vector3()).clone(), x: event.clientX, y: event.clientY, moved: false };
        options.onPartSelect?.(id);
        renderer.domElement.setPointerCapture?.(event.pointerId);
        renderer.domElement.style.cursor = 'grabbing';
        return;
      }
    }
    if (assemblyInteraction?.pointerDown(event)) return;
    drag = { x: event.clientX, y: event.clientY, button: event.button, moved: false };
    renderer.domElement.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event) {
    if (explorationDrag) {
      castPointer(event);
      explorationDrag.moved ||= Math.hypot(event.clientX - explorationDrag.x, event.clientY - explorationDrag.y) > 4;
      if (explorationDrag.moved && raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
        explorationOffsets.set(explorationDrag.id, dragPoint.clone().sub(explorationDrag.start).add(explorationDrag.offset));
      }
      return;
    }
    if (assemblyInteraction?.pointerMove(event)) return;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
    if ((options.assembly || options.exploration) && drag.button === 1) {
      const scale = 2 * cameraDistance * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, renderer.domElement.clientHeight);
      cameraTarget.add(new Vector3(-dx * scale, dy * scale, 0).applyQuaternion(camera.quaternion));
    } else if (drag.button === 2) {
      cameraTarget.x -= dx * 0.003 * cameraDistance;
      cameraTarget.y += dy * 0.003 * cameraDistance;
    } else {
      azimuth -= dx * 0.008;
      polar = Math.max(0.2, Math.min(Math.PI - 0.2, polar + dy * 0.008));
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    updateCamera();
  }
  function onPointerUp(event) {
    if (explorationDrag) {
      if (event.type === 'pointercancel') explorationOffsets.set(explorationDrag.id, explorationDrag.offset);
      explorationDrag = null;
      suppressClick = true;
      renderer.domElement.style.cursor = 'grab';
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      return;
    }
    if (assemblyInteraction?.pointerUp(event, event.type === 'pointercancel')) return;
    renderer.domElement.releasePointerCapture?.(event.pointerId);
    suppressClick = Boolean(drag?.moved);
    drag = null;
  }
  function onWheel(event) {
    cameraTransition = null;
    pendingCameraTransition = null;
    event.preventDefault();
    cameraDistance = Math.max(1.3, Math.min(6, cameraDistance * (event.deltaY > 0 ? 1.12 : 0.89)));
    updateCamera();
  }
  function preventContextMenu(event) { event.preventDefault(); }
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerUp);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
  renderer.domElement.addEventListener("contextmenu", preventContextMenu);

  scene.add(new AmbientLight("#e8f5ff", options.assembly ? .9 : 1.7));
  const keyLight = new DirectionalLight("#ffffff", 2.5);
  keyLight.position.set(3, 4, 2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -3;
  keyLight.shadow.camera.right = 3;
  keyLight.shadow.camera.top = 3;
  keyLight.shadow.camera.bottom = -3;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);
  const fillLight = new DirectionalLight("#d2e5ff", 1.1);
  fillLight.position.set(-2, 1, -1);
  scene.add(fillLight);
  if (options.assembly) {
    const benchLight = new DirectionalLight('#fff5e5', 1.3);
    benchLight.position.set(-3, 4, 3);
    scene.add(benchLight);
    addWorkshopReflections(scene, registry);
  }
  const workshop = createWorkshopEnvironment(scene, registry);

  const partGroups = new Map();
  for (const part of COMPUTER_PARTS) {
    const group = new Group();
    group.userData.partId = part.id;
    for (const subPart of options.asset ? [] : part.subParts ?? []) {
      group.add(createPartMesh(subPart, part.id, registry));
    }
    scene.add(group);
    partGroups.set(part.id, { part, group });
  }
  const motherboard = partGroups.get("motherboard")?.group;
  for (const detail of options.asset ? [] : MOBO_DETAILS) {
    motherboard?.add(createPartMesh(detail, "motherboard", registry));
  }
  if (options.asset) {
    for (const [id, entry] of partGroups) {
      const modelName = id === 'ram-0' ? 'ram_0' : id;
      const node = options.asset.scene.getObjectByName(modelName);
      entry.group.clear();
      if (!node) continue;
      const anchorName = modelName === 'case' ? 'assembly_origin' : 'socket_' + (modelName === 'ram_0' ? 'memory' : modelName);
      const anchor = options.asset.scene.getObjectByName(anchorName);
      if (anchor) {
        entry.pose = readSocketPose(anchor);
        const focus = options.asset.scene.getObjectByName('focus_' + (modelName === 'ram_0' ? 'memory' : modelName));
        entry.focus = focus ? readSocketPose(focus).position.toArray() : entry.pose.position.toArray();
        entry.part = { ...entry.part, basePos: entry.pose.position.toArray() };
        attachTeachingPart(node,entry.group,entry.pose);
      }
      node.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.userData.partId = id;
        mesh.castShadow = true; mesh.receiveShadow = true;
        const base=registry.add(mesh.material.clone()),highlighted=registry.add(base.clone());
        highlighted.emissive.set('#16b8a6');highlighted.emissiveIntensity=.12;
        const xray = registry.add(base.clone());
        xray.transparent = true; xray.opacity = .3; xray.depthWrite = false;
        mesh.material=base;mesh.userData.materials={base,highlighted,xray};
      });
      entry.size = new Box3().setFromObject(entry.group).getSize(new Vector3()).toArray();
    }
    renderer.domElement.dataset.modelSource = 'blender-glb';
  } else renderer.domElement.dataset.modelSource = 'procedural';
  const structureScene = options.assembly ? createStructureScene(scene, partGroups, options.asset, registry) : null;
  const cableScene=options.assembly && options.asset ? createCableScene(scene,container,camera,registry,options.onConnector) : null;
  const teachingMotion=options.asset ? createTeachingMotion(scene, options.asset.animations) : null;
  if (options.assembly) assemblyInteraction = createAssemblyInteraction(container, renderer.domElement, camera, partGroups, {
    ...options, scene, registry,
    onGestureEnd({ moved, cancelled }) {
      if (!moved && !cancelled) cameraTransition = pendingCameraTransition;
      pendingCameraTransition = null;
    },
  });

  const busGeometry = registry.add(new CylinderGeometry(1, 1, 1, 8));
  const particleGeometry = registry.add(new SphereGeometry(0.035, 8, 8));
  const busGroup = new Group();
  const particleGroup = new Group();
  scene.add(busGroup, particleGroup);
  const busEntries = CONNECTIONS.filter(connection => !options.exploration || (connection.fromPart !== 'ram-1' && connection.toPart !== 'ram-1')).map((connection) => {
    const material = registry.add(new MeshBasicMaterial({ color: connection.color }));
    const mesh = new Mesh(busGeometry, material);
    busGroup.add(mesh);
    const particle = new Mesh(particleGeometry, registry.add(new MeshBasicMaterial({ color: connection.color })));
    particleGroup.add(particle);
    return {
      connection,
      mesh,
      material,
      particle,
      from: new Vector3(),
      to: new Vector3(),
      midpoint: new Vector3(),
      direction: new Vector3(),
      quaternion: new Quaternion(),
    };
  });

  const labelLayer = document.createElement("div");
  labelLayer.className = "native-bus-label-layer";
  container.append(labelLayer);
  const labels = new Map();
  for (const entry of busEntries) {
    if (labels.has(entry.connection.label)) continue;
    const labelIndex = labels.size;
    const element = document.createElement("span");
    element.className = "native-bus-label";
    element.dataset.busLabel = entry.connection.label;
    element.textContent = entry.connection.label;
    element.style.color = entry.connection.color;
    labelLayer.append(element);
    labels.set(entry.connection.label, {
      element,
      midpoint: entry.midpoint,
      offsetX: [-20, 20, -12, 12, -28, 28, 0][labelIndex] ?? 0,
      offsetY: [-16, 14, 26, -28, 38, -40, 0][labelIndex] ?? 0,
    });
  }

  const pointer = new Vector2();
  const raycaster = new Raycaster();
  function onClick(event) {
    if (assemblyInteraction?.consumeClick()) return;
    if(options.assembly){if(!suppressClick)cableScene?.pick(event);suppressClick=false;return;}
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const groups = [...partGroups.values()].map(({ group }) => group).filter(group => group.visible);
    const hit = raycaster.intersectObjects(groups, true)[0];
    const partId = hit?.object?.userData?.partId;
    if (partId) options.onPartSelect?.(partId);
  }
  renderer.domElement.addEventListener("click", onClick);

  function onContextLost(event) {
    event.preventDefault();
    options.onFailure?.(new Error("WebGL context lost"));
  }
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);

  let viewState = normalizeSceneViewState();
  let currentDistance = 0;
  let frameId = 0;
  let elapsed = 0;
  let previousTime=0;
  function updateBusLabels(show) {
    for (const label of labels.values()) {
      label.element.hidden = !show;
      if (!show) continue;
      cameraPosition.copy(label.midpoint).project(camera);
      const point = screenPointFromNdc(cameraPosition, container.clientWidth, container.clientHeight);
      if (!point) {
        label.element.hidden = true;
        continue;
      }
      label.element.style.left = `${point.left + label.offsetX}px`;
      label.element.style.top = `${point.top + label.offsetY}px`;
    }
  }

  function render(time) {
    const delta=Math.min(.05,Math.max(1/120,(time-previousTime)/1000));previousTime=time;
    if (cameraTransition) {
      const amount = viewState.reducedMotion ? 1 : .13;
      cameraTarget.lerp(cameraTransition.target, amount);
      cameraDistance += (cameraTransition.distance - cameraDistance) * amount;
      azimuth += (cameraTransition.azimuth - azimuth) * amount;
      polar += (cameraTransition.polar - polar) * amount;
      updateCamera();
      if (Math.abs(cameraDistance - cameraTransition.distance) + cameraTarget.distanceTo(cameraTransition.target)
        + Math.abs(azimuth - cameraTransition.azimuth) + Math.abs(polar - cameraTransition.polar) < .001) {
        cameraTarget.copy(cameraTransition.target);
        cameraDistance = cameraTransition.distance;
        azimuth = cameraTransition.azimuth;
        polar = cameraTransition.polar;
        updateCamera();
        cameraTransition = null;
      }
    }
    const target = viewState.targetExplodeDistance;
    currentDistance += (target - currentDistance) * (viewState.reducedMotion ? 1 : 0.08);
    if (Math.abs(target - currentDistance) < 0.001) currentDistance = target;
    elapsed = time / 1000;
    for (const [partId, entry] of partGroups) {
      entry.group.visible = viewState.visiblePartIds.has(partId);
      if (!viewState.assembly) {
        entry.group.position.fromArray(partPosition(entry.part, currentDistance));
        if (explorationOffsets.has(partId)) entry.group.position.add(explorationOffsets.get(partId));
      }
      else if (['case', 'motherboard', 'psu'].includes(partId)) entry.group.position.fromArray(entry.part.basePos);
      entry.group.traverse((node) => {
        applyMeshMaterial(node, viewState, partId);
        if (node.userData.fanAngle !== undefined) {
          const angle = node.userData.fanAngle + (viewState.assembly?.powered && !viewState.reducedMotion ? elapsed * 9 : 0);
          node.position.x = 0.39 + Math.cos(angle) * 0.065;
          node.position.y = -0.08 + Math.sin(angle) * 0.065;
          node.rotation.z = angle + 0.42;
        }
      });
    }
    assemblyInteraction?.update(viewState.assembly, viewState.reducedMotion);
    structureScene?.update(viewState.assembly, viewState.reducedMotion);
    teachingMotion?.update(viewState.assembly,delta,viewState.reducedMotion);
    cableScene?.update(viewState.assembly);
    if(options.assembly){renderer.domElement.dataset.fansRunning=String(Boolean(viewState.assembly?.powered && !viewState.reducedMotion));renderer.domElement.dataset.cableMode=String(Boolean(viewState.assembly?.cableMode));}
    workshop.update(Boolean(viewState.assembly?.powered), elapsed, viewState.reducedMotion);
    const showConnections = viewState.showConnections;
    for (let index = 0; index < busEntries.length; index += 1) {
      const entry = busEntries[index];
      const { connection } = entry;
      entry.from.fromArray(getConnectionEndpoint(connection.fromPart, connection.fromOffset, currentDistance));
      entry.to.fromArray(getConnectionEndpoint(connection.toPart, connection.toOffset, currentDistance));
      if (options.exploration && options.asset) {
        const from = partGroups.get(connection.fromPart);
        const to = partGroups.get(connection.toPart);
        if (from) entry.from.copy(from.group.position);
        if (to) entry.to.copy(to.group.position);
      }
      entry.midpoint.copy(entry.from).add(entry.to).multiplyScalar(0.5);
      entry.direction.copy(entry.to).sub(entry.from);
      const length = entry.direction.length();
      entry.mesh.visible = showConnections;
      entry.particle.visible = showConnections && !viewState.reducedMotion;
      entry.material.depthTest = !viewState.xray;
      entry.material.transparent = viewState.xray;
      entry.material.opacity = viewState.xray ? 0.56 : 1;
      if (length > 0) {
        entry.mesh.position.copy(entry.midpoint);
        entry.mesh.quaternion.copy(entry.quaternion.setFromUnitVectors(UP, entry.direction.normalize()));
        const thickness = connection.thickness * (viewState.xray ? 0.48 : 1);
        entry.mesh.scale.set(thickness, length, thickness);
        entry.particle.position.copy(entry.from).lerp(entry.to, (elapsed * 0.3 + index / busEntries.length) % 1);
      }
    }
    const showLabels = showConnections && viewState.xray;
    updateBusLabels(showLabels);
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(render);
  }

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    if (options.assembly) camera.zoom = Math.min(1, camera.aspect / 1.45);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);
  if (!resizeObserver) window.addEventListener("resize", resize);
  resize();
  updateCamera();
  render(0);

  let disposed = false;
  return {
    setViewState(nextState) {
      const previous = viewState;
      viewState = normalizeSceneViewState(nextState);
      if (options.exploration) {
        if (previous.returnPart !== viewState.returnPart && viewState.returnPart) {
          if (viewState.returnPart.id) explorationOffsets.delete(viewState.returnPart.id);
          else explorationOffsets.clear();
        }
        if (previous.targetExplodeDistance !== viewState.targetExplodeDistance || [...previous.visiblePartIds].join() !== [...viewState.visiblePartIds].join()) {
          explorationOffsets.clear();
          explorationDrag = null;
        }
      }
      if (options.assembly && (previous.cameraPreset !== viewState.cameraPreset || previous.resetKey !== viewState.resetKey || previous.assembly?.selectedConnector !== viewState.assembly?.selectedConnector || (viewState.cameraPreset === 'part' && previous.selectedPartId !== viewState.selectedPartId))) {
        const selected = ASSEMBLY_PARTS.find(part => part.sceneId === viewState.selectedPartId);
        const entry=partGroups.get(selected?.sceneId);
        const connectorFocus=cableScene?.focus(viewState.assembly?.selectedConnector);
        const installed = viewState.assembly?.installed?.[selected?.id];
        const focus = entry?.focus ?? entry?.part.basePos;
        const pose = connectorFocus ? {target:connectorFocus.toArray(),position:connectorFocus.clone().add(new Vector3(-.65,1.1,1.2)).toArray()} : assemblyCameraPose(viewState.cameraPreset, installed ? focus : selected?.rack, focus, entry?.size);
        const target = new Vector3().fromArray(pose.target);
        offset.fromArray(pose.position).sub(target);
        const nextTransition = { target, distance: offset.length(), azimuth: Math.atan2(offset.x, offset.z), polar: Math.acos(offset.y / offset.length()) };
        if (assemblyInteraction?.isDragging()) pendingCameraTransition = nextTransition;
        else cameraTransition = nextTransition;
        renderer.domElement.dataset.cameraPreset = viewState.cameraPreset ?? 'perspective';
      } else if (!options.assembly && (previous.cameraPreset !== viewState.cameraPreset || previous.resetKey !== viewState.resetKey)) {
        cameraTarget.set(options.assembly ? -0.28 : 0, 0.05, 0);
        const pos = viewState.cameraPreset === 'top' ? [0, 3.6, 0.15] : initialPosition;
        offset.fromArray(pos).sub(cameraTarget);
        cameraDistance = offset.length();
        azimuth = Math.atan2(offset.x, offset.z);
        polar = Math.acos(offset.y / cameraDistance);
        updateCamera();
      }
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("contextmenu", preventContextMenu);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      structureScene?.dispose();
      cableScene?.dispose();
      registry.dispose();
      keyLight.shadow.map?.dispose();
      assemblyInteraction?.dispose();
      workshop.dispose();
      renderer.dispose();
      labelLayer.remove();
      renderer.domElement.remove();
    },
  };
}
