import { Vector2 } from 'three/src/math/Vector2.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { Plane } from 'three/src/math/Plane.js';
import { Raycaster } from 'three/src/core/Raycaster.js';
import { ASSEMBLY_PARTS } from '../hardwareAssembly.js';

// React validates every requested installation. This controller only owns gestures and projection.
export function createAssemblyInteraction(container, canvas, camera, partGroups, options) {
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const point = new Vector3();
  const plane = new Plane();
  let state = null;
  let gesture = null;
  let blockClick = false;
  const layer = document.createElement('div');
  layer.className = 'assembly-scene-labels';
  container.append(layer);
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
    if (!state || state.locked || event.button !== 0) return false;
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
  function pointerMove(event) {
    if (!gesture) return false;
    if (event.pointerId !== gesture.pointerId) return true;
    gesture.moved ||= Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 5;
    cast(event);
    if (gesture.moved && raycaster.ray.intersectPlane(plane, point)) gesture.group.position.copy(point);
    return true;
  }
  function pointerUp(event, cancelled = false) {
    if (!gesture) return false;
    if (event.pointerId !== gesture.pointerId) return true;
    const current = gesture;
    gesture = null;
    canvas.style.cursor = 'grab';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    blockClick = true;
    if (current.moved && !cancelled) {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const candidates = labels.filter(({ part }) => !(part.id === 'gpu' && state.integrated));
      const nearest = candidates.map(label => ({ label, distance: Math.min(Math.hypot(x - label.screen.x, y - label.screen.y), Math.hypot(x - label.anchor.x, y - label.anchor.y)) }))
        .sort((a, b) => a.distance - b.distance)[0];
      options.onInstall?.(current.part.id, nearest?.distance < 42 ? nearest.label.part.id : null);
    }
    return true;
  }
  function update(nextState, reducedMotion) {
    state = nextState;
    layer.hidden = !state;
    if (!state) return;
    labels.forEach(({ part, element, rackLabel, screen, anchor }, index) => {
      const { group, part: model } = partGroups.get(part.sceneId);
      const installed = Boolean(state.installed[part.id]);
      const hidden = part.id === 'gpu' && state.integrated;
      group.visible = !hidden;
      if (gesture?.part.id !== part.id) group.position.lerp(point.fromArray(installed ? model.basePos : part.rack), reducedMotion ? 1 : 0.14);
      const socket = project(point.fromArray(model.basePos));
      anchor.x = socket.x; anchor.y = socket.y;
      const offsets = [[55, 48], [0, 18], [-18, -40], [50, -30]][index];
      screen.x = socket.x + offsets[0]; screen.y = socket.y + offsets[1];
      element.style.left = `${screen.x}px`; element.style.top = `${screen.y}px`;
      const narrow = container.clientWidth < 520;
      element.hidden = hidden || (narrow && state.activeId !== part.id);
      element.disabled = installed || state.locked || !state.activeId;
      element.className = `assembly-slot-label${installed ? ' installed' : ''}${state.activeId === part.id ? ' active' : ''}`;
      const rack = project(point.fromArray(part.rack));
      rackLabel.style.left = `${rack.x}px`; rackLabel.style.top = `${rack.y + 31}px`;
      rackLabel.hidden = hidden || installed || (narrow && state.activeId !== part.id);
      rackLabel.disabled = state.locked;
      rackLabel.classList.toggle('active', state.activeId === part.id);
    });
    const secondRam = partGroups.get('ram-1');
    if (secondRam) secondRam.group.visible = false;
  }
  return { update, pointerDown, pointerMove, pointerUp,
    consumeClick() { const result = blockClick; blockClick = false; return result; },
    dispose() { layer.remove(); gesture = null; },
  };
}
