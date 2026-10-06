export const MIN_CONCEPT_ZOOM = 0.15;
export const MAX_CONCEPT_ZOOM = 3;
const clampZoom = value => Math.max(MIN_CONCEPT_ZOOM, Math.min(MAX_CONCEPT_ZOOM, value));

// Camera coordinates are screen pixels; graph coordinates remain unchanged.
export function zoomConceptCamera(camera, requestedZoom, anchor) {
  const zoom = clampZoom(requestedZoom);
  const ratio = zoom / camera.zoom;
  return { zoom, x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio };
}

/** 卡片尺寸由布局模型给出（默认沿用 176×76 的历史尺寸），相机只负责取景。 */
export function fitConceptCamera(nodes, viewport, padding = 32, box = { width: 176, height: 76 }) {
  if (!nodes.length) return { x: viewport.width / 2, y: viewport.height / 2, zoom: 1 };
  const halfWidth = (box.width ?? 176) / 2, halfHeight = (box.height ?? 76) / 2;
  const left = Math.min(...nodes.map(node => node.x - halfWidth));
  const right = Math.max(...nodes.map(node => node.x + halfWidth));
  const top = Math.min(...nodes.map(node => node.y - halfHeight));
  const bottom = Math.max(...nodes.map(node => node.y + halfHeight));
  const zoom = clampZoom(Math.min(1, Math.max(1, viewport.width - padding * 2) / (right - left), Math.max(1, viewport.height - padding * 2) / (bottom - top)));
  return { zoom, x: viewport.width / 2 - (left + right) / 2 * zoom, y: viewport.height / 2 - (top + bottom) / 2 * zoom };
}

export function centerConceptCamera(camera, node, viewport, readable = false) {
  const zoom = readable ? Math.max(camera.zoom, 0.85) : camera.zoom;
  return { zoom, x: viewport.width / 2 - node.x * zoom, y: viewport.height / 2 - node.y * zoom };
}
