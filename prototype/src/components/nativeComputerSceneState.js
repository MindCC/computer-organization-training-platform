export function normalizeSceneViewState(input = {}) {
  return {
    visiblePartIds: new Set(input.visiblePartIds ?? []),
    targetExplodeDistance: input.autoAnimating ? 1.3 : Number(input.explodeDistance ?? 0),
    autoAnimating: Boolean(input.autoAnimating),
    selectedPartId: input.selectedPartId ?? null,
    xray: Boolean(input.xray),
    showConnections: Boolean(input.showConnections),
    reducedMotion: Boolean(input.reducedMotion),
  };
}

export function partPosition(part, distance) {
  return part.basePos.map((value, index) => value + part.explodeDir[index] * distance);
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
