#!/usr/bin/env python3
"""Snap floating communities toward Catalonia for cleaner linework joins.

Run after scripts/build_oracle_linework_map.py (also invoked by that script):

  python3 scripts/build_oracle_linework_map.py
  python3 scripts/snap_oracle_communities.py

Steps:
1. Idempotently nudge Catalunya-Nord / Andorra / València into Catalonia
   (shapely nearest-points + slight overshoot so facing strokes sit closer)
2. Refresh centroids in comarcaMapMeta.ts
"""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

from shapely.geometry import Polygon, box
from shapely.ops import nearest_points, unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parents[1]
SVG_PATH = ROOT / "web" / "public" / "map-oracle-linework.svg"
META_TS = ROOT / "web" / "src" / "lib" / "comarcaMapMeta.ts"

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

TOKEN = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?")
ISLANDS = {"mallorca", "menorca", "eivissa", "formentera", "cabrera"}
FLOATING = ("catalunya-nord", "catalunya-nord-2", "andorra", "valencia")
SNAP_ATTR = "data-oracle-snap"
# Close remaining gap, then push a little past so double-strokes coincide.
JOIN_EPS = 0.35
OVERSHOOT = 1.15

# Facing-border corridors (SVG user units). Nearest-points outside these
# bands can pull a community toward the wrong Catalonia edge.
JOIN_BANDS: dict[str, tuple[float, float, float, float]] = {
    # x0, y0, x1, y1
    "catalunya-nord": (600.0, 180.0, 780.0, 250.0),
    "andorra": (540.0, 160.0, 620.0, 230.0),
    "valencia": (350.0, 500.0, 430.0, 590.0),
}


def local_tag(el: ET.Element) -> str:
    return el.tag.rsplit("}", 1)[-1]


def parse_matrix(transform: str | None) -> tuple[float, float, float, float, float, float]:
    if not transform:
        return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    nums = [float(n) for n in re.findall(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?", transform)]
    if "matrix" in transform:
        return tuple(nums[:6])  # type: ignore[return-value]
    if "translate" in transform:
        return (1.0, 0.0, 0.0, 1.0, nums[0], nums[1] if len(nums) > 1 else 0.0)
    return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def mul(
    a: tuple[float, float, float, float, float, float],
    b: tuple[float, float, float, float, float, float],
) -> tuple[float, float, float, float, float, float]:
    a1, b1, c1, d1, e1, f1 = a
    a2, b2, c2, d2, e2, f2 = b
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def apply(m: tuple[float, float, float, float, float, float], x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = m
    return a * x + c * y + e, b * x + d * y + f


def ancestor_matrix(el: ET.Element, parent_map: dict[ET.Element, ET.Element]) -> tuple[float, float, float, float, float, float]:
    m = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    chain: list[ET.Element] = []
    cur: ET.Element | None = el
    while cur is not None:
        chain.append(cur)
        cur = parent_map.get(cur)
    for node in reversed(chain):
        m = mul(m, parse_matrix(node.get("transform")))
    return m


def densify_path(
    d: str,
    matrix: tuple[float, float, float, float, float, float],
    step: float = 2.0,
) -> list[tuple[float, float]]:
    tokens = TOKEN.findall(d)
    if not tokens:
        return []
    out: list[tuple[float, float]] = []
    i = 0
    x = y = sx = sy = 0.0
    cmd = "M"
    last: tuple[float, float] | None = None

    def num() -> float:
        nonlocal i
        v = float(tokens[i])
        i += 1
        return v

    def emit(nx: float, ny: float) -> None:
        nonlocal last
        p = apply(matrix, nx, ny)
        if last is None:
            out.append(p)
        else:
            dist = math.hypot(p[0] - last[0], p[1] - last[1])
            n = max(1, int(dist / step))
            for k in range(1, n + 1):
                t = k / n
                out.append((last[0] + (p[0] - last[0]) * t, last[1] + (p[1] - last[1]) * t))
        last = p

    while i < len(tokens):
        tok = tokens[i]
        if tok.isalpha():
            cmd = tok
            i += 1
        rel = cmd.islower()
        C = cmd.upper()
        if C == "Z":
            emit(sx, sy)
            last = None
            continue
        if C == "M":
            x = num() + (x if rel else 0.0)
            y = num() + (y if rel else 0.0)
            sx, sy = x, y
            last = None
            emit(x, y)
            cmd = "l" if rel else "L"
            continue
        if C == "L":
            x = num() + (x if rel else 0.0)
            y = num() + (y if rel else 0.0)
            emit(x, y)
            continue
        if C == "H":
            x = num() + (x if rel else 0.0)
            emit(x, y)
            continue
        if C == "V":
            y = num() + (y if rel else 0.0)
            emit(x, y)
            continue
        if C == "C":
            x1 = num() + (x if rel else 0.0)
            y1 = num() + (y if rel else 0.0)
            x2 = num() + (x if rel else 0.0)
            y2 = num() + (y if rel else 0.0)
            x3 = num() + (x if rel else 0.0)
            y3 = num() + (y if rel else 0.0)
            for k in range(1, 8):
                t = k / 7
                mt = 1 - t
                bx = mt**3 * x + 3 * mt**2 * t * x1 + 3 * mt * t**2 * x2 + t**3 * x3
                by = mt**3 * y + 3 * mt**2 * t * y1 + 3 * mt * t**2 * y2 + t**3 * y3
                emit(bx, by)
            x, y = x3, y3
            continue
        if C in "SQ":
            for _ in range(2 if C == "S" else 1):
                num()
                num()
            x = num() + (x if rel else 0.0)
            y = num() + (y if rel else 0.0)
            emit(x, y)
            continue
        if C == "T":
            x = num() + (x if rel else 0.0)
            y = num() + (y if rel else 0.0)
            emit(x, y)
            continue
        if C == "A":
            for _ in range(5):
                num()
            x = num() + (x if rel else 0.0)
            y = num() + (y if rel else 0.0)
            emit(x, y)
            continue
        break
    return out


def collect(root: ET.Element) -> tuple[dict[str, ET.Element], dict[str, list[tuple[float, float]]], dict[ET.Element, ET.Element]]:
    parent_map = {c: p for p in root.iter() for c in p}
    els: dict[str, ET.Element] = {}
    polys: dict[str, list[tuple[float, float]]] = {}
    for el in root.iter():
        eid = el.get("id") or ""
        if not eid.startswith("comarca-"):
            continue
        slug = eid[len("comarca-") :]
        els[slug] = el
        paths = [el] if local_tag(el) == "path" else [c for c in el.iter() if local_tag(c) == "path"]
        pts: list[tuple[float, float]] = []
        for p in paths:
            pts.extend(densify_path(p.get("d") or "", ancestor_matrix(p, parent_map)))
        polys[slug] = pts
    return els, polys, parent_map


def prepend_translate(el: ET.Element, dx: float, dy: float) -> None:
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        return
    existing = parse_matrix(el.get("transform"))
    a, b, c, d, e, f = mul((1.0, 0.0, 0.0, 1.0, dx, dy), existing)
    el.set("transform", f"matrix({a},{b},{c},{d},{e},{f})")


def read_snap(el: ET.Element) -> tuple[float, float]:
    raw = el.get(SNAP_ATTR)
    if not raw:
        return 0.0, 0.0
    try:
        dx_s, dy_s = raw.split(",", 1)
        return float(dx_s), float(dy_s)
    except ValueError:
        return 0.0, 0.0


def apply_snap(el: ET.Element, dx: float, dy: float) -> None:
    """Replace previous snap translation (idempotent across re-runs)."""
    old_dx, old_dy = read_snap(el)
    prepend_translate(el, -old_dx, -old_dy)
    prepend_translate(el, dx, dy)
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        el.attrib.pop(SNAP_ATTR, None)
    else:
        el.set(SNAP_ATTR, f"{dx:.4f},{dy:.4f}")


def pts_to_poly(pts: list[tuple[float, float]]) -> Polygon | None:
    cleaned: list[tuple[float, float]] = []
    for pt in pts:
        if not cleaned or math.hypot(pt[0] - cleaned[-1][0], pt[1] - cleaned[-1][1]) > 0.5:
            cleaned.append(pt)
    if len(cleaned) < 4:
        return None
    if cleaned[0] != cleaned[-1]:
        cleaned.append(cleaned[0])
    try:
        poly = make_valid(Polygon(cleaned))
    except Exception:
        return None
    if poly.is_empty:
        return None
    if poly.geom_type == "Polygon" and poly.area > 5:
        return poly  # type: ignore[return-value]
    if poly.geom_type == "MultiPolygon":
        geoms = [g for g in poly.geoms if g.area > 5]
        if not geoms:
            return None
        return max(geoms, key=lambda g: g.area)  # type: ignore[return-value]
    return None


def _band_clip(geom, key: str):
    band = JOIN_BANDS.get(key)
    if band is None:
        return geom
    clipped = geom.intersection(box(*band))
    return clipped if not clipped.is_empty else geom


def compute_translates(
    polys: dict[str, list[tuple[float, float]]],
) -> dict[str, tuple[float, float]]:
    floating_set = set(FLOATING)
    cat_shapes = [
        shape
        for slug, pts in polys.items()
        if slug not in ISLANDS | floating_set
        for shape in [pts_to_poly(pts)]
        if shape is not None
    ]
    if not cat_shapes:
        return {}
    catalonia = unary_union(cat_shapes)

    out: dict[str, tuple[float, float]] = {}
    # Share one translation for both nord pieces.
    nord_pts = polys.get("catalunya-nord", []) + polys.get("catalunya-nord-2", [])
    targets: dict[str, list[tuple[float, float]]] = {
        "catalunya-nord": nord_pts,
        "andorra": polys.get("andorra", []),
        "valencia": polys.get("valencia", []),
    }

    for key, pts in targets.items():
        shape = pts_to_poly(pts)
        if shape is None:
            out[key] = (0.0, 0.0)
            continue

        # Measure / pull only along the known facing border corridor.
        local_float = _band_clip(shape, key)
        local_cat = _band_clip(catalonia, key)
        dist = float(local_float.distance(local_cat))
        overlap = float(local_float.intersection(local_cat).area) if local_float.intersects(local_cat) else 0.0

        # Already a solid join in the corridor — leave alone.
        if dist <= JOIN_EPS and overlap >= 15.0:
            out[key] = (0.0, 0.0)
            continue

        a, b = nearest_points(local_float, local_cat)
        dx = b.x - a.x
        dy = b.y - a.y
        length = math.hypot(dx, dy)
        # Andorra sits in a small notch — prefer a firmer seat.
        overshoot = OVERSHOOT * (1.7 if key == "andorra" else 1.0)
        if length < 1e-6:
            # Touching at a point but thin overlap — nudge along band center toward Catalonia.
            if key == "catalunya-nord":
                out[key] = (0.0, overshoot)
            elif key == "andorra":
                out[key] = (0.15 * overshoot, overshoot)
            elif key == "valencia":
                out[key] = (overshoot * 0.35, -overshoot)
            else:
                out[key] = (0.0, 0.0)
            continue
        ux, uy = dx / length, dy / length
        # Close remaining gap (if any), then slight overshoot so facing strokes coincide.
        travel = max(0.0, dist) + overshoot
        # Valencia's facing corridor can be ~15–20px; others stay modest.
        travel_cap = 22.0 if key == "valencia" else 6.0
        travel = min(travel, travel_cap)
        out[key] = (ux * travel, uy * travel)

    # Mirror nord translation onto the secondary piece.
    out["catalunya-nord-2"] = out.get("catalunya-nord", (0.0, 0.0))
    return out


def strip_silhouette(root: ET.Element) -> None:
    """Remove legacy #oracle-silhouette underlay if present."""
    under = root.find(".//*[@id='mainland-underlay']")
    if under is not None:
        parent = {c: p for p in root.iter() for c in p}.get(under)
        if parent is not None:
            parent.remove(under)
        return
    existing = root.find(".//*[@id='oracle-silhouette']")
    if existing is not None:
        parent = {c: p for p in root.iter() for c in p}.get(existing)
        if parent is not None:
            parent.remove(existing)


def update_centroids(polys: dict[str, list[tuple[float, float]]]) -> None:
    text = META_TS.read_text(encoding="utf-8")

    def repl(match: re.Match[str]) -> str:
        slug = match.group(2)
        pts = polys.get(slug)
        if not pts:
            return match.group(0)
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        return (
            f'{{ id: "{match.group(1)}", slug: "{slug}", dialectGroup: "{match.group(3)}", '
            f'macroDialect: "{match.group(4)}", centroidX: {cx:.2f}, centroidY: {cy:.2f} }}'
        )

    updated = re.sub(
        r'\{\s*id:\s*"(comarca-[^"]+)",\s*slug:\s*"([^"]+)",\s*'
        r'dialectGroup:\s*"([^"]+)",\s*macroDialect:\s*"([^"]+)",\s*'
        r"centroidX:\s*[-\d.]+,\s*centroidY:\s*[-\d.]+\s*\}",
        repl,
        text,
    )
    META_TS.write_text(updated, encoding="utf-8")


def write_svg(root: ET.Element, path: Path) -> None:
    def indent(elem: ET.Element, level: int = 0) -> None:
        pad = "\n" + level * "  "
        if len(elem):
            if not elem.text or not elem.text.strip():
                elem.text = pad + "  "
            for child in elem:
                indent(child, level + 1)
            if not child.tail or not child.tail.strip():
                child.tail = pad
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = pad

    indent(root)
    content = ET.tostring(root, encoding="unicode", short_empty_elements=False)
    content = re.sub(r"<ns\d+:", "<", content)
    content = re.sub(r"</ns\d+:", "</", content)
    content = re.sub(r'\sxmlns:ns\d+="[^"]*"', "", content)
    if not re.search(r"<svg\b[^>]*\sxmlns=", content):
        content = content.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
    path.write_text(f'<?xml version="1.0" encoding="utf-8"?>\n{content}\n', encoding="utf-8")


def main() -> None:
    if not SVG_PATH.exists():
        raise SystemExit(f"Missing {SVG_PATH} — run build_oracle_linework_map.py first")

    root = ET.parse(SVG_PATH).getroot()
    els, polys, _parent_map = collect(root)

    # Undo any prior snap before measuring, so deltas are absolute from the baked build.
    for slug in FLOATING:
        if slug in els:
            old = read_snap(els[slug])
            if old != (0.0, 0.0):
                prepend_translate(els[slug], -old[0], -old[1])
                els[slug].attrib.pop(SNAP_ATTR, None)

    _, polys, _ = collect(root)
    translates = compute_translates(polys)
    for slug, (dx, dy) in translates.items():
        if slug in els:
            apply_snap(els[slug], dx, dy)
            print(f"  {slug}: snap ({dx:.2f}, {dy:.2f})")

    strip_silhouette(root)

    write_svg(root, SVG_PATH)

    _, polys, _ = collect(root)
    update_centroids(polys)
    print(f"Wrote {SVG_PATH}")
    print(f"Updated {META_TS}")


if __name__ == "__main__":
    main()
