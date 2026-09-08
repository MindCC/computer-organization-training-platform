import { Vector2 } from 'three/src/math/Vector2.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { Plane } from 'three/src/math/Plane.js';
import { Raycaster } from 'three/src/core/Raycaster.js';
import { ASSEMBLY_PARTS } from '../hardwareAssembly.js';
import { assemblyLabelVisible, nearestAssemblySocket, assemblyEntryPosition } from '../assemblySceneLayout.js';
import { Box3 } from 'three/src/math/Box3.js';
import { BoxGeometry } from 'three/src/geometries/BoxGeometry.js';
import { EdgesGeometry } from 'three/src/geometries/EdgesGeometry.js';
import { LineSegments } from 'three/src/objects/LineSegments.js';
import { LineBasicMaterial } from 'three/src/materials/LineBasicMaterial.js';
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js';
import { socketApproachAllowed } from './teachingAssetRig.js';

// React validates every requested installation. This controller only owns gestures and projection.
export function createAssemblyInteraction(container, canvas, camera, partGroups, options) {
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const point = new Vector3();
  const plane = new Plane();
  let state = null;
  let gesture = null;
  let blockClick = false;
  let hoveredSocket = null;
  const priorInstallation = new Map();
  const previews = new Map();
  const previewMaterial = options.registry.add(new MeshBasicMaterial({ color: '#25bfa4', transparent: true, opacity: .18, depthWrite: false }));
  const outlineMaterial = options.registry.add(new LineBasicMaterial({ color: '#087e6b', transparent: true, opacity: .9, depthTest: false }));
  for (const part of ASSEMBLY_PARTS) {
    const source = partGroups.get(part.sceneId).group;
    const preview = source.clone(true);
    preview.traverse(node => { if (node.isMesh) { node.material = previewMaterial; node.castShadow = false; } });
    const bounds = new Box3().setFromObject(source);
    const size = bounds.getSize(new Vector3()).multiplyScalar(1.08);
    const box = new BoxGeometry(size.x, size.y, size.z);
    const edges = options.registry.add(new EdgesGeometry(box));
    box.dispose();
    const outline = new LineSegments(edges, outlineMaterial);
    outline.position.copy(bounds.getCenter(new Vector3()));
    outline.renderOrder = 5;
    options.scene.add(outline);outline.visible=false;
    preview.userData.outline=outline;
    preview.position.fromArray(partGroups.get(part.sceneId).part.basePos);
    preview.visible = false;
    options.scene.add(preview);
    previews.set(part.id, preview);
  }
  const layer = document.createElement('div');
  layer.className = 'assembly-scene-labels';
  container.append(layer);
  const dropStatus = document.createElement('div');
  dropStatus.className = 'assembly-drop-status';
  dropStatus.setAttribute('role', 'status');
  container.append(dropStatus);
  const labels = ASSEMBLY_PARTS.map((part, index) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'assembly-slot-label';
    element.dataset.socket = part.id;
    element.setAttribute('aria-label', `安装到${part.socket}`);
    element.textContent = `${String(index + 1).padStart(2, '0')} · ${part.socket}`;
    element.onclick = () => { if (state?.activeId && !state.locked) options.onInstall?.(state.activeId, part.id); };
    layer.append(element);
    const rackLabel = document.createElement('button');
    rackLabel.type = 'button';
    rackLabel.className = 'assembly-rack-label';
    rackLabel.dataset.rack = part.id;
    rackLabel.textContent = part.label;
    rackLabel.setAttribute('aria-label', `拿起${part.label}`);
    rackLabel.onclick = () => { if (!state?.locked) options.onPartSelect?.(part.sceneId); };
    layer.append(rackLabel);
    return { part, element, rackLabel, screen: { x: 0, y: 0 }, anchor: { x: 0, y: 0 } };
  });
  function cast(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return bounds;
  }
  function project(position) {
    point.copy(position).project(camera);
    return { x: (point.x + 1) * container.clientWidth / 2, y: (1 - point.y) * container.clientHeight / 2 };
  }
  function pointerDown(event) {
    if (gesture) return true;
    if (!state || state.locked || state.cableMode || event.button !== 0) return false;
    cast(event);
    const available = ASSEMBLY_PARTS.filter(part => !state.installed[part.id] && !(part.id === 'gpu' && state.integrated));
    const hit = raycaster.intersectObjects(available.map(part => partGroups.get(part.sceneId).group), true)[0];
    const part = available.find(part => part.sceneId === hit?.object.userData.partId);
    if (!part) return false;
    const group = partGroups.get(part.sceneId).group;
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), group.position);
    gesture = { part, group, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    options.onPartSelect?.(part.sceneId);
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
    return true;
  }
  function socketAt(event) {
    const bounds=cast(event);
    const candidates=labels.filter(({part})=>!(part.id==='gpu' && state.integrated));
    // A direct hit on the authored part preview has priority over a label's projected target.
    const hits=candidates.map(({part})=>({id:part.id,hit:raycaster.intersectObject(previews.get(part.id),true)[0]})).filter(x=>x.hit).sort((a,b)=>a.hit.distance-b.hit.distance);
    const id=hits[0]?.id ?? nearestAssemblySocket(candidates,event.clientX-bounds.left,event.clientY-bounds.top);
    const entry=partGroups.get(ASSEMBLY_PARTS.find(p=>p.id===id)?.sceneId);
    return entry?.pose && !socketApproachAllowed(entry.pose,camera.position) ? null : id;
  }
  function pointerMove(event) {
    if (!gesture) return false;
    if (event.pointerId !== gesture.pointerId) return true;
    gesture.moved ||= Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 5;
    cast(event);
    if (gesture.moved && raycaster.ray.intersectPlane(plane, point)) gesture.group.position.copy(point);
    hoveredSocket=socketAt(event);
    return true;
  }
  function pointerUp(event, cancelled = false) {
    if (!gesture) return false;
    if (event.pointerId !== gesture.pointerId) return true;
    const current = gesture;
    gesture = null;
    hoveredSocket = null;
    canvas.style.cursor = 'grab';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    blockClick = true;
    if (current.moved && !cancelled) {
      options.onInstall?.(current.part.id, socketAt(event));
    }
    options.onGestureEnd?.({ moved: current.moved, cancelled });
    return true;
  }
  function update(nextState, reducedMotion) {
    state = nextState;
    layer.hidden = !state || state.cableMode;
    if (!state) return;
    const dragging = Boolean(gesture);
    const wrongTarget = dragging && hoveredSocket && hoveredSocket !== gesture.part.id;
    const showHints=state.showMatchingHints!==false;
    canvas.dataset.dropState = dragging ? (showHints ? (wrongTarget ? 'wrong' : hoveredSocket ? 'ready' : 'moving') : 'moving') : 'idle';
    dropStatus.hidden = !dragging;
    dropStatus.dataset.state = canvas.dataset.dropState;
    const statusText = !showHints ? '正在移动 · 请判断安装位置后松开' : wrongTarget ? '插槽不匹配 · 请对准青绿色轮廓' : hoveredSocket ? '位置正确 · 松开完成安装' : '正在移动 · 对准青绿色安装预览';
    if (dropStatus.textContent !== statusText) dropStatus.textContent = statusText;
    previewMaterial.color.set(wrongTarget ? '#e5a23c' : '#25bfa4');
    let previewId = '';
    labels.forEach(({ part, element, rackLabel, screen, anchor }, index) => {
      const { group, part: model, pose } = partGroups.get(part.sceneId);
      const installed = Boolean(state.installed[part.id]);
      const hidden = part.id === 'gpu' && state.integrated;
      group.visible = !hidden;
      if (installed && priorInstallation.get(part.id) === false && !reducedMotion) {
        if (pose) group.position.copy(pose.position).addScaledVector(pose.approach, part.id === 'storage' ? .25 : .18);
        else group.position.fromArray(assemblyEntryPosition(part.id, model.basePos));
      }
      priorInstallation.set(part.id, installed);
      if (gesture?.part.id !== part.id) group.position.lerp(point.fromArray(installed ? model.basePos : part.rack), reducedMotion ? 1 : 0.14);
      const socket = project(point.fromArray(model.basePos));
      anchor.x = socket.x; anchor.y = socket.y;
      const offsets = [[55, 48], [0, 18], [-18, -40], [50, -30]][index];
      screen.x = socket.x + offsets[0]; screen.y = socket.y + offsets[1];
      element.style.left = `${screen.x}px`; element.style.top = `${screen.y}px`;
      element.hidden = hidden || (showHints && !assemblyLabelVisible(part.id, state.activeId, dragging));
      element.disabled = installed || state.locked || !state.activeId;
      element.className = `assembly-slot-label${installed ? ' installed' : ''}${showHints && state.activeId === part.id ? ' active' : ''}`;
      const rack = project(point.fromArray(part.rack));
      rackLabel.style.left = `${rack.x}px`; rackLabel.style.top = `${rack.y}px`;
      rackLabel.hidden = hidden || installed || state.activeId !== part.id;
      rackLabel.disabled = state.locked;
      rackLabel.classList.toggle('active', state.activeId === part.id);
      const preview = previews.get(part.id);
      preview.visible = showHints && !hidden && !installed && !state.locked && !state.cableMode && state.activeId === part.id;
      preview.userData.outline.visible=preview.visible;
      if (preview.visible) previewId = part.id;
    });
    canvas.dataset.preview = previewId;
    const secondRam = partGroups.get('ram-1');
    if (secondRam) secondRam.group.visible = false;
  }
  return { update, pointerDown, pointerMove, pointerUp,
    isDragging() { return Boolean(gesture); },
    consumeClick() { const result = blockClick; blockClick = false; return result; },
    dispose() { layer.remove(); dropStatus.remove(); previews.forEach(preview => {options.scene.remove(preview);options.scene.remove(preview.userData.outline);}); gesture = null; },
  };
}
