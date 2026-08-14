import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { type DialectZone } from "../../lib/accentOracleClient";
import { comarcaCentroid, comarcaDisplayName } from "../../lib/comarcaDisplay";
import { cameraForZone, comarquesForZone } from "../../lib/dialectRegions";
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
  selectedZone: DialectZone;
  /** Comarca guess (or user inspect) pin target. */
  pinComarca?: string | null;
  /** When true, the pin shows the illustrative affinity callout (not mere inspect). */
  showAffinityCallout?: boolean;
  /** Soft core around the guess pin (same-zone neighbors). */
  nearFocusSlugs?: readonly string[];
  onSelect?: (slug: string) => void;
  playEntrance?: boolean;
}

interface CameraTarget {
  focusX: number;
  focusY: number;
  scale: number;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Stand-in until the real viewBox arrives with map-oracle-linework.svg. */
const FALLBACK_VIEWBOX: ViewBox = { x: 0, y: 0, w: 1000, h: 1000 };
const DEFAULT_SCALE = 1.05;
const MIN_SCALE = 0.85;
const MAX_SCALE = 3.4;
const KEY_PAN_FRACTION = 0.08;
const KEY_ZOOM_FACTOR = 1.12;
/** Entrance offsets as a fraction of the viewBox, so they follow the map size. */
const ENTRANCE_OFFSET_X = -0.22;
const ENTRANCE_OFFSET_Y = 0.08;

function parseViewBox(value: string): ViewBox {
  const [x, y, w, h] = value.trim().split(/[\s,]+/).map(Number);
  if (![x, y, w, h].every((part) => Number.isFinite(part)) || w <= 0 || h <= 0) {
    return FALLBACK_VIEWBOX;
  }
  return { x, y, w, h };
}

function viewCenter(view: ViewBox): { x: number; y: number } {
  return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
}

const FALLBACK_CENTER = viewCenter(FALLBACK_VIEWBOX);

function regionCamera(zone: DialectZone, view: ViewBox): CameraTarget {
  return cameraForZone(zone, view, { defaultScale: DEFAULT_SCALE });
}

function distanceNorm(a: CameraTarget, b: CameraTarget, view: ViewBox): number {
  const dx = a.focusX - b.focusX;
  const dy = a.focusY - b.focusY;
  const dist = Math.hypot(dx, dy) / Math.hypot(view.w, view.h);
  return Math.min(1, dist * 1.4);
}

function buildTransform(
  fx: number,
  fy: number,
  s: number,
  px: number,
  py: number,
  view: ViewBox,
): string {
  const center = viewCenter(view);
  return `translate(${center.x + px * s} ${center.y + py * s}) scale(${s}) translate(${-fx} ${-fy})`;
}

function projectPointToViewport(
  point: { x: number; y: number } | null,
  svg: SVGSVGElement | null,
  viewport: HTMLDivElement | null,
  cameraGroup: SVGGElement | null,
): { x: number; y: number } | null {
  if (!point || !svg || !viewport) {
    return null;
  }
  const pt = svg.createSVGPoint();
  pt.x = point.x;
  pt.y = point.y;
  const ctm = cameraGroup?.getScreenCTM() ?? svg.getScreenCTM();
  if (!ctm) {
    return null;
  }
  const screen = pt.matrixTransform(ctm);
  const bounds = viewport.getBoundingClientRect();
  return { x: screen.x - bounds.left, y: screen.y - bounds.top };
}

export const DialectMap = forwardRef<DialectMapHandle, DialectMapProps>(function DialectMap(
  {
    selectedZone,
    pinComarca = null,
    showAffinityCallout = false,
    nearFocusSlugs = [],
    onSelect,
    playEntrance = true,
  },
  ref,
) {
  const reducedMotion = useReducedMotion() ?? false;
  const [comarques, setComarques] = useState<ParsedComarcaPath[]>([]);
  const [viewBox, setViewBox] = useState<ViewBox>(FALLBACK_VIEWBOX);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [revealReady, setRevealReady] = useState(!playEntrance || reducedMotion);
  const [pinVisible, setPinVisible] = useState(false);
  const [labelVisible, setLabelVisible] = useState(false);
  const [calloutPos, setCalloutPos] = useState({ x: 0, y: 0 });
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [showHint, setShowHint] = useState(true);
  const [transform, setTransform] = useState(() =>
    buildTransform(
      FALLBACK_CENTER.x,
      FALLBACK_CENTER.y,
      DEFAULT_SCALE,
      0,
      0,
      FALLBACK_VIEWBOX,
    ),
  );
  const [fillOpState, setFillOpState] = useState(reducedMotion || !playEntrance ? 1 : 0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cameraGroupRef = useRef<SVGGElement>(null);
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
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; startScale: number } | null>(null);
  const homeCameraRef = useRef<CameraTarget>(regionCamera(selectedZone, FALLBACK_VIEWBOX));
  const panXRef = useRef(0);
  const panYRef = useRef(0);

  const focusX = useMotionValue(FALLBACK_CENTER.x);
  const focusY = useMotionValue(FALLBACK_CENTER.y);
  const scale = useMotionValue(DEFAULT_SCALE);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const lineOpacity = useMotionValue(reducedMotion || !playEntrance ? 1 : 0);
  const fillOpacity = useMotionValue(reducedMotion || !playEntrance ? 1 : 0);

  const regionSlugs = useMemo(
    () => new Set(comarquesForZone(selectedZone).map((entry) => entry.slug)),
    [selectedZone],
  );
  const nearFocusSet = useMemo(() => new Set(nearFocusSlugs), [nearFocusSlugs]);
  const pinSlug = pinComarca && comarcaCentroid(pinComarca) ? pinComarca : null;
  const activeHighlight = highlightId && highlightId !== pinSlug ? highlightId : null;

  const calloutAnchor = useMemo(() => (pinSlug ? comarcaCentroid(pinSlug) : null), [pinSlug]);

  const updateOverlayPositions = useCallback(() => {
    const selectedPos = projectPointToViewport(
      calloutAnchor,
      svgRef.current,
      viewportRef.current,
      cameraGroupRef.current,
    );
    if (selectedPos) {
      setCalloutPos(selectedPos);
    }
    const hoverSlug = hoveredId && hoveredId !== pinSlug ? hoveredId : null;
    const hoverCentroid = hoverSlug ? comarcaCentroid(hoverSlug) : null;
    const nextHoverPos = projectPointToViewport(
      hoverCentroid,
      svgRef.current,
      viewportRef.current,
      cameraGroupRef.current,
    );
    if (nextHoverPos) {
      setHoverPos(nextHoverPos);
    }
  }, [calloutAnchor, hoveredId, pinSlug]);

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
          setViewBox(parseViewBox(map.viewBox));
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
        const target = regionCamera(selectedZone, viewBox);
        focusX.set(target.focusX);
        focusY.set(target.focusY);
        scale.set(target.scale);
        fillOpacity.set(1);
        lineOpacity.set(1);
        setFillOpState(1);
        setRevealReady(true);
        scheduleCallout(Boolean(pinSlug), 0);
        entranceDoneRef.current = true;
        skipNextSwitchRef.current = true;
      }
      return;
    }

    if (reducedMotion) {
      const target = regionCamera(selectedZone, viewBox);
      focusX.set(target.focusX);
      focusY.set(target.focusY);
      scale.set(target.scale);
      lineOpacity.set(1);
      fillOpacity.set(1);
      setFillOpState(1);
      setRevealReady(true);
      scheduleCallout(Boolean(pinSlug), 0);
      entranceDoneRef.current = true;
      skipNextSwitchRef.current = true;
      return;
    }

    const target = regionCamera(selectedZone, viewBox);
    focusX.set(target.focusX + ENTRANCE_OFFSET_X * viewBox.w);
    focusY.set(target.focusY + ENTRANCE_OFFSET_Y * viewBox.h);
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

    scheduleCallout(Boolean(pinSlug), MAP_MOTION.showPinAt);

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

    const next = regionCamera(selectedZone, viewBox);
    const prev = homeCameraRef.current;
    const moveDur = reducedMotion ? 0.3 : switchMoveDuration(distanceNorm(prev, next, viewBox));
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
        scheduleCallout(Boolean(pinSlug), reducedMotion ? 0 : moveDur * 0.25);
      }, refillAt * 1000);
    });

    return () => {
      if (refillTimer) {
        window.clearTimeout(refillTimer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZone]);

  useEffect(() => {
    if (!revealReady) {
      return;
    }
    // Zone switches own camera; pin changes only move/show the name callout.
    if (pinSlug) {
      scheduleCallout(true, reducedMotion ? 0 : 0.12);
    } else {
      scheduleCallout(false);
    }
    updateOverlayPositions();
  }, [pinSlug, revealReady, reducedMotion, scheduleCallout, updateOverlayPositions]);

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
      setTransform(
        buildTransform(focusX.get(), focusY.get(), scale.get(), panX.get(), panY.get(), viewBox),
      );
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
  }, [focusX, focusY, panX, panY, scale, viewBox]);

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
      if (pinTimerRef.current) {
        window.clearTimeout(pinTimerRef.current);
      }
      if (labelTimerRef.current) {
        window.clearTimeout(labelTimerRef.current);
      }
    };
  }, []);

  function zoomTo(nextScale: number) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    scale.set(next);
    homeCameraRef.current = { ...homeCameraRef.current, scale: next };
    setShowHint(false);
  }

  function pinchDistance(): number {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) {
      return 0;
    }
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function onPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }
    setShowHint(false);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewportRef.current?.setPointerCapture(event.pointerId);

    if (pointersRef.current.size >= 2) {
      dragRef.current = null;
      const distance = pinchDistance();
      pinchRef.current = { distance: distance || 1, startScale: scale.get() };
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originPanX: panXRef.current,
      originPanY: panYRef.current,
    };
  }

  function onPointerMove(event: ReactPointerEvent) {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinchRef.current && pointersRef.current.size >= 2) {
      const distance = pinchDistance();
      zoomTo(pinchRef.current.startScale * (distance / pinchRef.current.distance));
      return;
    }

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
    const dx = ((event.clientX - drag.startX) / rect.width) * viewBox.w / currentScale;
    const dy = ((event.clientY - drag.startY) / rect.height) * viewBox.h / currentScale;
    const nextX = drag.originPanX + dx;
    const nextY = drag.originPanY + dy;
    panX.set(nextX);
    panY.set(nextY);
    panXRef.current = nextX;
    panYRef.current = nextY;
  }

  function onPointerUp(event: ReactPointerEvent) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  function onWheel(event: ReactWheelEvent) {
    event.preventDefault();
    zoomTo(scale.get() * (event.deltaY > 0 ? 0.92 : 1.08));
  }

  function onViewportKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const currentScale = scale.get();
    const panStep = (viewBox.w * KEY_PAN_FRACTION) / currentScale;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const dx = event.key === "ArrowLeft" ? panStep : event.key === "ArrowRight" ? -panStep : 0;
      const dy = event.key === "ArrowUp" ? panStep : event.key === "ArrowDown" ? -panStep : 0;
      const nextX = panXRef.current + dx;
      const nextY = panYRef.current + dy;
      panX.set(nextX);
      panY.set(nextY);
      panXRef.current = nextX;
      panYRef.current = nextY;
      setShowHint(false);
      return;
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomTo(currentScale * KEY_ZOOM_FACTOR);
      return;
    }

    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomTo(currentScale / KEY_ZOOM_FACTOR);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onSelect?.("");
    }
  }

  const calloutLabel = pinSlug ? comarcaDisplayName(pinSlug) : null;
  const hoverName =
    hoveredId && hoveredId !== pinSlug ? comarcaDisplayName(hoveredId) : null;

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
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onKeyDown={onViewportKeyDown}
      role="application"
      aria-label="Mapa interactiu de comarques. Fletxes per moure, més i menys per ampliar, Escape per tancar la comarca."
    >
      <svg
        ref={svgRef}
        className="dialect-map-svg"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
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
          {/* Paint selected/hovered last so opaque neighbor strokes cannot cover the outline. */}
          {[...comarques]
            .sort((a, b) => {
              const paintRank = (slug: string) => {
                if (slug === pinSlug) {
                  return 5;
                }
                if (slug === hoveredId) {
                  return 4;
                }
                if (nearFocusSet.has(slug)) {
                  return 3;
                }
                if (regionSlugs.has(slug)) {
                  return 2;
                }
                if (slug === activeHighlight) {
                  return 1;
                }
                return 0;
              };
              return paintRank(a.slug) - paintRank(b.slug);
            })
            .map((comarca) => {
              const inRegion = regionSlugs.has(comarca.slug);
              const isPinned = comarca.slug === pinSlug;
              const isNearFocus = nearFocusSet.has(comarca.slug) && !isPinned;
              const isHovered = comarca.slug === hoveredId && !isPinned;
              const isHighlighted = comarca.slug === activeHighlight;
              return (
                <g
                  key={comarca.id}
                  id={comarca.id}
                  className={[
                    "oracle-comarca-node",
                    inRegion ? "is-in-region" : "",
                    isNearFocus ? "is-near-focus" : "",
                    isPinned ? "is-inspected" : "",
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
                    ["--fill-op" as string]: inRegion || isPinned ? fillOpState : 0,
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

      {calloutLabel && showAffinityCallout ? (
        <ComarcaCallout
          label={calloutLabel}
          sublabel="Il·lustratiu; no indica procedència"
          x={calloutPos.x}
          y={calloutPos.y}
          visible={pinVisible}
          showLabel={labelVisible}
        />
      ) : null}

      {calloutLabel && !showAffinityCallout ? (
        <div
          className="comarca-hover-label"
          style={{
            left: calloutPos.x,
            top: calloutPos.y,
            opacity: labelVisible ? 1 : 0,
          }}
          aria-hidden={!labelVisible}
        >
          {calloutLabel}
        </div>
      ) : null}

      {hoverName ? (
        <div className="comarca-hover-label" style={{ left: hoverPos.x, top: hoverPos.y }}>
          {hoverName}
        </div>
      ) : null}

      {showHint && !reducedMotion ? (
        <p className="dialect-map-hint">Arrossega i amplia</p>
      ) : null}

      <div className="dialect-map-zoom" role="group" aria-label="Zoom del mapa">
        <button
          type="button"
          className="dialect-map-zoom-button"
          aria-label="Amplia"
          onClick={(event) => {
            event.stopPropagation();
            zoomTo(scale.get() * KEY_ZOOM_FACTOR);
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          +
        </button>
        <button
          type="button"
          className="dialect-map-zoom-button"
          aria-label="Redueix"
          onClick={(event) => {
            event.stopPropagation();
            zoomTo(scale.get() / KEY_ZOOM_FACTOR);
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          −
        </button>
      </div>

      {!comarques.length ? (
        <div className="dialect-map-loading" aria-busy="true" aria-label="Carregant el mapa" />
      ) : null}
    </div>
  );
});
