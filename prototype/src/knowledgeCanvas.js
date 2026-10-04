export const MIN_CONCEPT_ZOOM = 0.15;
export const MAX_CONCEPT_ZOOM = 3;
const clampZoom = value => Math.max(MIN_CONCEPT_ZOOM, Math.min(MAX_CONCEPT_ZOOM, value));

// Camera coordinates are screen pixels; graph coordinates remain unchanged.
export function zoomConceptCamera(camera, requestedZoom, anchor) {
  const zoom = clampZoom(requestedZoom);
  const ratio = zoom / camera.zoom;
  return { zoom, x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio };
}

export function fitConceptCamera(nodes, viewport, padding = 32) {
  if (!nodes.length) return { x: viewport.width / 2, y: viewport.height / 2, zoom: 1 };
  const left = Math.min(...nodes.map(node => node.x - 88));
  const right = Math.max(...nodes.map(node => node.x + 88));
  const top = Math.min(...nodes.map(node => node.y - 38));
  const bottom = Math.max(...nodes.map(node => node.y + 38));
  const zoom = clampZoom(Math.min(1, Math.max(1, viewport.width - padding * 2) / (right - left), Math.max(1, viewport.height - padding * 2) / (bottom - top)));
  return { zoom, x: viewport.width / 2 - (left + right) / 2 * zoom, y: viewport.height / 2 - (top + bottom) / 2 * zoom };
}

export function centerConceptCamera(camera, node, viewport, readable = false) {
  const zoom = readable ? Math.max(camera.zoom, 0.85) : camera.zoom;
  return { zoom, x: viewport.width / 2 - node.x * zoom, y: viewport.height / 2 - node.y * zoom };
}
