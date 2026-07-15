import { motion } from "motion/react";
import { appleOut, prefersReducedMotion } from "../../lib/mapMotion";

interface ComarcaCalloutProps {
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  visible: boolean;
  showLabel: boolean;
}

export function ComarcaCallout({ label, sublabel, x, y, visible, showLabel }: ComarcaCalloutProps) {
  const reduced = prefersReducedMotion();
  const shown = visible && showLabel;

  return (
    <div
      className="comarca-callout"
      style={{ left: x, top: y }}
      aria-hidden={!shown}
    >
      <motion.div
        className="comarca-callout-pill"
        initial={false}
        animate={{
          opacity: shown ? 1 : 0,
          y: shown ? 0 : 8,
          scale: shown ? 1 : 0.92,
        }}
        transition={{
          opacity: { duration: reduced ? 0.12 : 0.32, ease: "easeOut" },
          y: { duration: reduced ? 0.12 : 0.42, ease: appleOut },
          scale: { duration: reduced ? 0.12 : 0.42, ease: appleOut },
        }}
      >
        <strong>{label}</strong>
        {sublabel ? <span>{sublabel}</span> : null}
      </motion.div>
    </div>
  );
}
