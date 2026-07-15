function defaultCreateCanvas() {
  return typeof document === "undefined" ? null : document.createElement("canvas");
}

export function canUseWebGL(createCanvas = defaultCreateCanvas) {
  try {
    const canvas = createCanvas();
    const context = canvas?.getContext?.("webgl2")
      || canvas?.getContext?.("webgl");
    if (!context) return false;
    context.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}
