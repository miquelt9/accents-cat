import { useEffect, useState } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Visible caption with cycling dots (. .. ...); `live` stays stable for aria-live. */
export function useCyclingDotsLabel(
  active: boolean,
  baseText: string,
  intervalMs = 480,
): { visible: string; live: string } {
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion);
  const [dotCount, setDotCount] = useState(1);
  const liveLabel = `${baseText}…`;

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
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, reduceMotion]);

  if (!active) {
    return { visible: liveLabel, live: liveLabel };
  }

  const visible = reduceMotion ? liveLabel : `${baseText}${".".repeat(dotCount)}`;
  return { visible, live: liveLabel };
}

export const ANALYZING_LIVE_LABEL = "Analitzant la mostra…";

/** Visible analyzing caption with cycling dots; `live` stays stable for aria-live. */
export function useAnalyzingLabel(active: boolean): { visible: string; live: string } {
  return useCyclingDotsLabel(active, "Analitzant la mostra");
}

