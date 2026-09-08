export function assemblyCameraPose(preset, rack = [-1.15, -.2, 0], socket = [0, 0, 0], size = [.3,.2,.4]) {
  if (preset === 'top') return { target: [-.28, 0, 0], position: [-.28, 3.6, .15] };
  if (preset === 'part') {
    const target = rack.map((v, i) => (v + socket[i]) / 2);
    const span=Math.max(Math.hypot(...rack.map((v,i)=>v-socket[i])),...size);
    const height=Math.max(1.25,span*.88);
    return { target, position: [target[0] - .55, target[1] + height, target[2] + height*.92] };
  }
  return { target: [-.28, .05, 0], position: [-1.45, 1.85, 2.3] };
}

export function assemblyLabelVisible(partId, activeId, dragging) {
  return partId === activeId || Boolean(dragging);
}

export function assemblyEntryPosition(partId, socket) {
  return socket.map((value, axis) => value + (axis === (partId === 'storage' ? 2 : 1) ? (partId === 'storage' ? .25 : .18) : 0));
}

export function nearestAssemblySocket(labels, x, y) {
  const nearest = labels.map(label => ({
    id: label.part.id,
    distance: Math.min(Math.hypot(x - label.screen.x, y - label.screen.y), Math.hypot(x - label.anchor.x, y - label.anchor.y)),
  })).sort((a, b) => a.distance - b.distance)[0];
  return nearest?.distance < 42 ? nearest.id : null;
}
