/** Motion timing tokens — BoldVoice-inspired choreography (original values). */

export const easeOutCubic = [0.33, 1, 0.68, 1] as const;
export const easeInOutCubic = [0.65, 0, 0.35, 1] as const;
export const appleOut = [0.2, 0.8, 0.25, 1] as const;
export const materialStandard = [0.4, 0, 0.2, 1] as const;
export const accordionEase = [0.22, 1, 0.36, 1] as const;

export const MAP_MOTION = {
  fadeIn: { delay: 0.15, duration: 1.1 },
  frame: { delay: 0.25, duration: 3.2 },
  fill: { delay: 3.45, duration: 0.95 },
  showPinAt: 4.05,
  labelDelayAfterPin: 0.36,
  switchFade: 0.35,
  switchMoveMin: 0.6,
  switchMoveMax: 1.7,
  idleGraceMs: 900,
  idleReturn: 2.2,
  hover: 0.18,
  hintHideMs: 6000,
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Switch camera duration scales with normalized distance (0–1). */
export function switchMoveDuration(distanceNorm: number): number {
  const t = Math.min(1, Math.max(0, distanceNorm));
  return MAP_MOTION.switchMoveMin + (MAP_MOTION.switchMoveMax - MAP_MOTION.switchMoveMin) * t;
}
