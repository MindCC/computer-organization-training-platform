export function motionPolicy(reducedMotion) {
  return reducedMotion
    ? { enabled: false, duration: 0.01 }
    : { enabled: true, duration: 0.55 };
}

export function questEntrance(reducedMotion) {
  return reducedMotion
    ? { autoAlpha: 1, x: 0, y: 0, duration: 0.01 }
    : { autoAlpha: 0, y: 18, duration: 0.55, ease: "power2.out" };
}

export function questUnlock(reducedMotion) {
  return reducedMotion
    ? { autoAlpha: 1, scale: 1, duration: 0.01 }
    : { autoAlpha: 0, scale: 0.9, duration: 0.5, ease: "back.out(1.4)" };
}
