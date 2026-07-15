import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { comarcaCentroid, comarcaDisplayName, getComarca } from "../../lib/comarcaDisplay";
import {
  easeInOutCubic,
  easeOutCubic,
  MAP_MOTION,
  switchMoveDuration,
} from "../../lib/mapMotion";
import { loadOracleMap, type ParsedComarcaPath } from "../../lib/parseOracleMap";
import { ComarcaCallout } from "./ComarcaCallout";

export interface DialectMapHandle {
  focusComarca: (id: string) => void;
  highlightComarca: (id: string) => void;
  clearSelection: () => void;
}

export interface DialectMapProps {
  selectedComarca?: string | null;
  confidence?: number;
  onSelect?: (slug: string) => void;
  playEntrance?: boolean;
}

interface CameraTarget {
  focusX: number;
  focusY: number;
  scale: number;
}

const VIEWBOX = { x: 170, y: 100, w: 1000, h: 1000 };
const VIEW_CENTER = { x: VIEWBOX.x + VIEWBOX.w / 2, y: VIEWBOX.y + VIEWBOX.h / 2 };
const DEFAULT_SCALE = 1.05;
const FOCUS_SCALE = 2.15;
const MIN_SCALE = 0.85;
const MAX_SCALE = 3.4;

function cameraForSlug(slug: string | null | undefined): CameraTarget {
  const centroid = slug ? comarcaCentroid(slug) : null;
  if (!centroid) {
    return { focusX: VIEW_CENTER.x, focusY: VIEW_CENTER.y, scale: DEFAULT_SCALE };
  }
  return { focusX: centroid.x, focusY: centroid.y, scale: FOCUS_SCALE };
}

function distanceNorm(a: CameraTarget, b: CameraTarget): number {
  const dx = a.focusX - b.focusX;
  const dy = a.focusY - b.focusY;
  const dist = Math.hypot(dx, dy) / Math.hypot(VIEWBOX.w, VIEWBOX.h);
  return Math.min(1, dist * 1.4);
}

function buildTransform(fx: number, fy: number, s: number, px: number, py: number): string {
  return `translate(${VIEW_CENTER.x + px * s} ${VIEW_CENTER.y + py * s}) scale(${s}) translate(${-fx} ${-fy})`;
}

export const DialectMap = forwardRef<DialectMapHandle, DialectMapProps>(function DialectMap(
  { selectedComarca = null, confidence, onSelect, playEntrance = true },
  ref,
) {
  const reducedMotion = useReducedMotion() ?? false;
  const [comarques, setComarques] = useState<ParsedComarcaPath[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [revealReady, setRevealReady] = useState(!playEntrance || reducedMotion);
  const [pinVisible, setPinVisible] = useState(false);
  const [labelVisible, setLabelVisible] = useState(false);
  const [calloutPos, setCalloutPos] = useState({ x: 0, y: 0 });
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [showHint, setShowHint] = useState(true);
  const [transform, setTransform] = useState(
    buildTransform(VIEW_CENTER.x, VIEW_CENTER.y, DEFAULT_SCALE, 0, 0),
  );
  const [fillOpState, setFillOpState] = useState(reducedMotion || !playEntrance ? 1 : 0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cameraGroupRef = useRef<SVGGElement>(null);
  const idleTimerRef = useRef<number | null>(null);
  const pinTimerRef = useRef<number | null>(null);
  const labelTimerRef = useRef<number | null>(null);
  const entranceDoneRef = useRef(false);
  const skipNextSwitchRef = useRef(true);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
  } | null>(null);
  const homeCameraRef = useRef<CameraTarget>(cameraForSlug(selectedComarca));
  const panXRef = useRef(0);
  const panYRef = useRef(0);

  const focusX = useMotionValue(VIEW_CENTER.x);
  const focusY = useMotionValue(VIEW_CENTER.y);
  const scale = useMotionValue(DEFAULT_SCALE);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const lineOpacity = useMotionValue(reducedMotion || !playEntrance ? 1 : 0);
  const fillOpacity = useMotionValue(reducedMotion || !playEntrance ? 1 : 0);

  const selectedSlug = selectedComarca;
  const activeHighlight = highlightId && highlightId !== selectedSlug ? highlightId : null;

  const projectSlugToViewport = useCallback((slug: string | null | undefined) => {
    const centroid = slug ? comarcaCentroid(slug) : null;
    const svg = svgRef.current;
    const viewport = viewportRef.current;
    if (!centroid || !svg || !viewport) {
      return null;
    }
    const pt = svg.createSVGPoint();
    pt.x = centroid.x;
    pt.y = centroid.y;
    const ctm = cameraGroupRef.current?.getScreenCTM() ?? svg.getScreenCTM();
    if (!ctm) {
      return null;
    }
    const screen = pt.matrixTransform(ctm);
    const bounds = viewport.getBoundingClientRect();
    return { x: screen.x - bounds.left, y: screen.y - bounds.top };
  }, []);

  const updateOverlayPositions = useCallback(() => {
    const selectedPos = projectSlugToViewport(selectedSlug);
    if (selectedPos) {
      setCalloutPos(selectedPos);
    }
    const hoverSlug = hoveredId && hoveredId !== selectedSlug ? hoveredId : null;
    const nextHoverPos = projectSlugToViewport(hoverSlug);
    if (nextHoverPos) {
      setHoverPos(nextHoverPos);
    }
  }, [hoveredId, projectSlugToViewport, selectedSlug]);

  const animateCameraTo = useCallback(
    (target: CameraTarget, duration: number, resetPan = true) => {
      homeCameraRef.current = target;
      const ease = reducedMotion ? "easeOut" : easeInOutCubic;
      const dur = reducedMotion ? Math.min(0.35, duration) : duration;
      animate(focusX, target.focusX, { duration: dur, ease });
      animate(focusY, target.focusY, { duration: dur, ease });
      animate(scale, target.scale, { duration: dur, ease });
      if (resetPan) {
        animate(panX, 0, { duration: dur, ease });
        animate(panY, 0, { duration: dur, ease });
        panXRef.current = 0;
        panYRef.current = 0;
      }
    },
    [focusX, focusY, panX, panY, reducedMotion, scale],
  );

  const scheduleCallout = useCallback(
    (show: boolean, delayPin = 0) => {
      if (pinTimerRef.current) {
        window.clearTimeout(pinTimerRef.current);
      }
      if (labelTimerRef.current) {
        window.clearTimeout(labelTimerRef.current);
      }
      if (!show) {
        setPinVisible(false);
        setLabelVisible(false);
        return;
      }
      const pinDelay = reducedMotion ? 0 : delayPin * 1000;
      pinTimerRef.current = window.setTimeout(() => {
        setPinVisible(true);
        updateOverlayPositions();
        const labelDelay = reducedMotion ? 0 : MAP_MOTION.labelDelayAfterPin * 1000;
        labelTimerRef.current = window.setTimeout(() => {
          setLabelVisible(true);
        }, labelDelay);
      }, pinDelay);
    },
    [reducedMotion, updateOverlayPositions],
  );

  useImperativeHandle(
    ref,
    () => ({
      focusComarca(id: string) {
        onSelect?.(id);
      },
      highlightComarca(id: string) {
        setHighlightId(id);
      },
      clearSelection() {
        setHighlightId(null);
        onSelect?.("");
      },
    }),
    [onSelect],
  );

  useEffect(() => {
    let cancelled = false;
    loadOracleMap()
      .then((map) => {
        if (!cancelled) {
          setComarques(map.comarques);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Error de mapa");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!comarques.length) {
      return;
    }

    if (!playEntrance || entranceDoneRef.current) {
      if (!entranceDoneRef.current) {
        const target = cameraForSlug(selectedSlug);
        focusX.set(target.focusX);
        focusY.set(target.focusY);
        scale.set(target.scale);
        fillOpacity.set(1);
        lineOpacity.set(1);
        setFillOpState(1);
        setRevealReady(true);
        scheduleCallout(Boolean(selectedSlug), 0);
        entranceDoneRef.current = true;
        skipNextSwitchRef.current = true;
      }
      return;
    }

    if (reducedMotion) {
      const target = cameraForSlug(selectedSlug);
      focusX.set(target.focusX);
      focusY.set(target.focusY);
      scale.set(target.scale);
      lineOpacity.set(1);
      fillOpacity.set(1);
      setFillOpState(1);
      setRevealReady(true);
      scheduleCallout(Boolean(selectedSlug), 0);
      entranceDoneRef.current = true;
      skipNextSwitchRef.current = true;
      return;
    }

    const target = cameraForSlug(selectedSlug);
    focusX.set(target.focusX - 220);
    focusY.set(target.focusY + 80);
    scale.set(0.92);
    lineOpacity.set(0);
    fillOpacity.set(0);
    setFillOpState(0);
    setPinVisible(false);
    setLabelVisible(false);

    const lineAnim = animate(lineOpacity, 1, {
      delay: MAP_MOTION.fadeIn.delay,
      duration: MAP_MOTION.fadeIn.duration,
      ease: easeOutCubic,
    });
    animateCameraTo(target, MAP_MOTION.frame.duration);

    const fillTimer = window.setTimeout(() => {
      animate(fillOpacity, 1, {
        duration: MAP_MOTION.fill.duration,
        ease: easeOutCubic,
      });
      setFillOpState(1);
      setRevealReady(true);
      entranceDoneRef.current = true;
      skipNextSwitchRef.current = true;
    }, MAP_MOTION.fill.delay * 1000);

    // Failsafe: never leave the map stuck invisible if an animation is interrupted.
    const opacityFailsafe = window.setTimeout(() => {
      if (lineOpacity.get() < 0.95) {
        lineOpacity.set(1);
      }
    }, (MAP_MOTION.fadeIn.delay + MAP_MOTION.fadeIn.duration + 0.35) * 1000);

    scheduleCallout(Boolean(selectedSlug), MAP_MOTION.showPinAt);

    return () => {
      lineAnim.stop();
      window.clearTimeout(fillTimer);
      window.clearTimeout(opacityFailsafe);
    };
    // Entrance once when paths load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comarques.length]);

  useEffect(() => {
    if (!revealReady || !comarques.length) {
      return;
    }
    if (skipNextSwitchRef.current) {
      skipNextSwitchRef.current = false;
      return;
    }

    const next = cameraForSlug(selectedSlug);
    const prev = homeCameraRef.current;
    const moveDur = reducedMotion ? 0.3 : switchMoveDuration(distanceNorm(prev, next));
    let refillTimer = 0;

    scheduleCallout(false);
    void animate(fillOpacity, 0, {
      duration: reducedMotion ? 0.12 : MAP_MOTION.switchFade,
      ease: easeOutCubic,
    }).then(() => {
      setFillOpState(0);
      animateCameraTo(next, moveDur);
      const refillAt = reducedMotion ? 0 : moveDur * 0.55;
      refillTimer = window.setTimeout(() => {
        animate(fillOpacity, 1, {
          duration: reducedMotion ? 0.15 : MAP_MOTION.fill.duration * 0.7,
          ease: easeOutCubic,
        });
        setFillOpState(1);
        scheduleCallout(Boolean(selectedSlug), reducedMotion ? 0 : moveDur * 0.25);
      }, refillAt * 1000);
    });

    return () => {
      if (refillTimer) {
        window.clearTimeout(refillTimer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug]);

  useEffect(() => {
    updateOverlayPositions();
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const observer = new ResizeObserver(() => updateOverlayPositions());
    observer.observe(viewport);
    const unsubs = [
      focusX.on("change", updateOverlayPositions),
      focusY.on("change", updateOverlayPositions),
      scale.on("change", updateOverlayPositions),
      panX.on("change", updateOverlayPositions),
      panY.on("change", updateOverlayPositions),
    ];
    return () => {
      observer.disconnect();
      unsubs.forEach((u) => u());
    };
  }, [focusX, focusY, panX, panY, scale, updateOverlayPositions]);

  useEffect(() => {
    const sync = () => {
      setTransform(buildTransform(focusX.get(), focusY.get(), scale.get(), panX.get(), panY.get()));
    };
    sync();
    const unsubs = [
      focusX.on("change", sync),
      focusY.on("change", sync),
      scale.on("change", sync),
      panX.on("change", sync),
      panY.on("change", sync),
    ];
    return () => unsubs.forEach((u) => u());
  }, [focusX, focusY, panX, panY, scale]);

  useEffect(() => {
    const unsub = fillOpacity.on("change", (value) => setFillOpState(value));
    return () => unsub();
  }, [fillOpacity]);

  useEffect(() => {
    if (!showHint) {
      return;
    }
    const timer = window.setTimeout(() => setShowHint(false), MAP_MOTION.hintHideMs);
    return () => window.clearTimeout(timer);
  }, [showHint]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      if (pinTimerRef.current) {
        window.clearTimeout(pinTimerRef.current);
      }
      if (labelTimerRef.current) {
        window.clearTimeout(labelTimerRef.current);
      }
    };
  }, []);

  function scheduleIdleReturn() {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      const home = homeCameraRef.current;
      animateCameraTo(home, reducedMotion ? 0.3 : MAP_MOTION.idleReturn, true);
    }, MAP_MOTION.idleGraceMs);
  }

  function onPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }
    setShowHint(false);
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
    }
    viewportRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originPanX: panXRef.current,
      originPanY: panYRef.current,
    };
  }

  function onPointerMove(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const currentScale = scale.get();
    const dx = ((event.clientX - drag.startX) / rect.width) * VIEWBOX.w / currentScale;
    const dy = ((event.clientY - drag.startY) / rect.height) * VIEWBOX.h / currentScale;
    const nextX = drag.originPanX + dx;
    const nextY = drag.originPanY + dy;
    panX.set(nextX);
    panY.set(nextY);
    panXRef.current = nextX;
    panYRef.current = nextY;
  }

  function onPointerUp(event: ReactPointerEvent) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      scheduleIdleReturn();
    }
  }

  function onWheel(event: ReactWheelEvent) {
    event.preventDefault();
    setShowHint(false);
    const next = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, scale.get() * (event.deltaY > 0 ? 0.92 : 1.08)),
    );
    scale.set(next);
    homeCameraRef.current = { ...homeCameraRef.current, scale: next };
    scheduleIdleReturn();
  }

  const selected = selectedSlug ? getComarca(selectedSlug, confidence) : null;
  const hoverName =
    hoveredId && hoveredId !== selectedSlug ? comarcaDisplayName(hoveredId) : null;

  if (loadError) {
    return (
      <div className="dialect-map-viewport dialect-map-error" role="alert">
        {loadError}
      </div>
    );
  }

  return (
    <div
      className="dialect-map-viewport"
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      role="application"
      aria-label="Mapa interactiu de comarques"
    >
      <svg
        ref={svgRef}
        className="dialect-map-svg"
        viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
        role="img"
        aria-label="Mapa de similitud dialectal"
      >
        <defs>
          <filter id="oracle-selection-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <motion.g ref={cameraGroupRef} style={{ opacity: lineOpacity }} transform={transform}>
          {comarques.map((comarca) => {
            const isSelected = comarca.slug === selectedSlug;
            const isHovered = comarca.slug === hoveredId && !isSelected;
            const isHighlighted = comarca.slug === activeHighlight;
            return (
              <g
                key={comarca.id}
                id={comarca.id}
                className={[
                  "oracle-comarca-node",
                  isSelected ? "is-selected" : "",
                  isHovered ? "is-hovered" : "",
                  isHighlighted ? "is-highlighted" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                transform={comarca.transform}
                onPointerEnter={() => setHoveredId(comarca.slug)}
                onPointerLeave={() =>
                  setHoveredId((prev) => (prev === comarca.slug ? null : prev))
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect?.(comarca.slug);
                }}
                style={{
                  cursor: "pointer",
                  ["--fill-op" as string]: isSelected ? fillOpState : 0,
                }}
              >
                {comarca.parts.map((part, index) => (
                  <path key={`${comarca.id}-${index}`} className="oracle-comarca-shape" d={part.d} />
                ))}
              </g>
            );
          })}
        </motion.g>
      </svg>

      {selected ? (
        <ComarcaCallout
          label={selected.displayName}
          sublabel={
            selected.confidence != null
              ? `${selected.dialect} · ${Math.round(selected.confidence * 100)}%`
              : selected.dialect
          }
          x={calloutPos.x}
          y={calloutPos.y}
          visible={pinVisible}
          showLabel={labelVisible}
        />
      ) : null}

      {hoverName ? (
        <div className="comarca-hover-label" style={{ left: hoverPos.x, top: hoverPos.y }}>
          {hoverName}
        </div>
      ) : null}

      {showHint && !reducedMotion ? (
        <p className="dialect-map-hint">Arrossega per explorar</p>
      ) : null}

      {!comarques.length ? <div className="dialect-map-loading" aria-busy="true" /> : null}
    </div>
  );
});
