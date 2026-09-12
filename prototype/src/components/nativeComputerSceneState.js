export function normalizeSceneViewState(input = {}) {
  return {
    visiblePartIds: new Set(input.visiblePartIds ?? []),
    targetExplodeDistance: input.autoAnimating ? 1.3 : Number(input.explodeDistance ?? 0),
    autoAnimating: Boolean(input.autoAnimating),
    selectedPartId: input.selectedPartId ?? null,
    xray: Boolean(input.xray),
    showConnections: Boolean(input.showConnections),
    reducedMotion: Boolean(input.reducedMotion),
    assembly: input.assembly ?? null,
    cameraPreset: input.cameraPreset ?? null,
    resetKey: input.resetKey ?? 0,
    returnPart: input.returnPart ?? null,
  };
}

export function partPosition(part, distance) {
  return part.basePos.map((value, index) => value + part.explodeDir[index] * distance);
}

// Render-loop helper: writes an exploded connection endpoint into an existing
// vector so a frame never allocates an endpoint array (or a Vector3) per bus.
export function writeConnectionEndpoint(target, part, offset, distance = 0) {
  if (!part) return target.set(offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0);
  return target.set(
    part.basePos[0] + part.explodeDir[0] * distance + (offset[0] ?? 0),
    part.basePos[1] + part.explodeDir[1] * distance + (offset[1] ?? 0),
    part.basePos[2] + part.explodeDir[2] * distance + (offset[2] ?? 0),
  );
}

export function screenPointFromNdc(ndc, width, height) {
  if (ndc.z < -1 || ndc.z > 1) return null;
  return {
    left: (ndc.x * 0.5 + 0.5) * width,
    top: (-ndc.y * 0.5 + 0.5) * height,
  };
}

export function createResourceRegistry() {
  const resources = new Set();
  let disposed = false;
  return {
    add(resource) {
      if (resource?.dispose) resources.add(resource);
      return resource;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const resource of resources) resource.dispose();
      resources.clear();
    },
  };
}
