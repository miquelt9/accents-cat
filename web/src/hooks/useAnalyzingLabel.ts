import { useEffect, useState } from "react";

export const ANALYZING_LIVE_LABEL = "Analitzant la mostra…";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Visible analyzing caption with cycling dots; `live` stays stable for aria-live. */
export function useAnalyzingLabel(active: boolean): { visible: string; live: string } {
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion);
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!active || reduceMotion) {
      return;
    }
    const timer = window.setInterval(() => {
      setDotCount((current) => (current >= 3 ? 1 : current + 1));
    }, 480);
    return () => window.clearInterval(timer);
  }, [active, reduceMotion]);

  if (!active) {
    return { visible: ANALYZING_LIVE_LABEL, live: ANALYZING_LIVE_LABEL };
  }

  const visible = reduceMotion
    ? ANALYZING_LIVE_LABEL
    : `Analitzant la mostra${".".repeat(dotCount)}`;
  return { visible, live: ANALYZING_LIVE_LABEL };
}
