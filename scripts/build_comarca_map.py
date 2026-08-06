#!/usr/bin/env python3
"""Build the oracle comarca map artifacts from the comarcal source SVG.

Reads ``web/public/mapa-comarcal-accents.svg`` plus ``scripts/comarca_dialect_map.json``
and writes:

- ``web/public/map-oracle-linework.svg`` — interactive results map, normalised to the
  schema ``web/src/lib/parseOracleMap.ts`` expects
  (``#dialect-regions`` > ``g.oracle-region-group`` > ``g#comarca-<slug>`` > ``path``).
- ``web/src/lib/comarcaMapMeta.ts`` — slug / name / region / dialect + centroids.
- ``backend/comarques.py`` — server-side comarca allowlist.

Group transforms are baked into the emitted geometry, so every path in the output is
expressed in root user units and the root viewBox tightly bounds the drawn map. Source
shapes absent from the JSON are dropped: the background rect, the decorative separator
and every Aragonese comarca outside the Franja de Ponent.

Usage: ``python scripts/build_comarca_map.py``
"""

from __future__ import annotations

import json
import math
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SVG = ROOT / "web" / "public" / "mapa-comarcal-accents.svg"
CONFIG_JSON = ROOT / "scripts" / "comarca_dialect_map.json"
OUTPUT_SVG = ROOT / "web" / "public" / "map-oracle-linework.svg"
OUTPUT_META_TS = ROOT / "web" / "src" / "lib" / "comarcaMapMeta.ts"
OUTPUT_COMARQUES_PY = ROOT / "backend" / "comarques.py"

SVG_NS = "http://www.w3.org/2000/svg"
GENERATED_BY = "scripts/build_comarca_map.py"
MACRO_DIALECTS = ("balearic", "central", "northern", "northwestern", "valencian")
# Margin around the drawn map, in user units. Wide enough that DialectMap's default
# (nothing selected) camera, which overscans by 5%, still shows the whole map.
VIEWBOX_PADDING = 30.0
COORD_DECIMALS = 3
LINEWORK_STROKE_WIDTH = "1.2"

ET.register_namespace("", SVG_NS)

Matrix = tuple[float, float, float, float, float, float]
Point = tuple[float, float]
IDENTITY: Matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)

NUMBER_RE = re.compile(r"[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?")
TRANSFORM_RE = re.compile(r"(matrix|translate|scale|rotate)\s*\(([^)]*)\)")
PATH_COMMANDS = "MmLlHhVvCcSsQqTtAaZz"


# --------------------------------------------------------------------------- geometry


@dataclass
class SubPath:
    """One `M …` run: an absolute start point plus absolute segments."""

    start: Point
    segments: list[tuple] = field(default_factory=list)
    closed: bool = False


def parse_matrix(value: str | None) -> Matrix:
    matrix = IDENTITY
    if not value:
        return matrix
    for name, raw_args in TRANSFORM_RE.findall(value):
        args = [float(n) for n in NUMBER_RE.findall(raw_args)]
        if name == "matrix" and len(args) == 6:
            step: Matrix = (args[0], args[1], args[2], args[3], args[4], args[5])
        elif name == "translate" and args:
            step = (1.0, 0.0, 0.0, 1.0, args[0], args[1] if len(args) > 1 else 0.0)
        elif name == "scale" and args:
            sy = args[1] if len(args) > 1 else args[0]
            step = (args[0], 0.0, 0.0, sy, 0.0, 0.0)
        elif name == "rotate" and len(args) == 1:
            rad = math.radians(args[0])
            step = (math.cos(rad), math.sin(rad), -math.sin(rad), math.cos(rad), 0.0, 0.0)
        else:
            raise SystemExit(f"Unsupported transform: {value!r}")
        matrix = multiply(matrix, step)
    return matrix


def multiply(m: Matrix, n: Matrix) -> Matrix:
    a1, b1, c1, d1, e1, f1 = m
    a2, b2, c2, d2, e2, f2 = n
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def apply_matrix(m: Matrix, point: Point) -> Point:
    a, b, c, d, e, f = m
    x, y = point
    return (a * x + c * y + e, b * x + d * y + f)


def tokenize_path(d: str) -> list:
    tokens: list = []
    index = 0
    while index < len(d):
        char = d[index]
        if char in PATH_COMMANDS:
            tokens.append(char)
            index += 1
            continue
        match = NUMBER_RE.match(d, index)
        if match and match.group():
            tokens.append(float(match.group()))
            index = match.end()
            continue
        index += 1
    return tokens


def parse_path_data(d: str) -> list[SubPath]:
    """Flatten a `d` attribute into absolute sub-paths of L / C / Q segments."""
    tokens = tokenize_path(d)
    subpaths: list[SubPath] = []
    current: SubPath | None = None
    point: Point = (0.0, 0.0)
    command = ""
    last_cubic_control: Point | None = None
    last_quad_control: Point | None = None
    index = 0

    def take(count: int) -> list[float]:
        nonlocal index
        values = tokens[index : index + count]
        if len(values) != count or any(isinstance(v, str) for v in values):
            raise SystemExit(f"Malformed path data near token {index}: {d[:60]!r}…")
        index += count
        return [float(v) for v in values]

    while index < len(tokens):
        token = tokens[index]
        if isinstance(token, str):
            command = token
            index += 1
            if command in "Zz":
                if current is not None:
                    current.closed = True
                    point = current.start
                    current = None
                continue
        elif command in ("M", "m"):
            command = "L" if command == "M" else "l"
        elif not command:
            raise SystemExit(f"Path data starts without a command: {d[:60]!r}…")

        relative = command.islower()
        upper = command.upper()
        ox, oy = point if relative else (0.0, 0.0)

        if upper == "M":
            x, y = take(2)
            point = (x + ox, y + oy)
            current = SubPath(start=point)
            subpaths.append(current)
            last_cubic_control = last_quad_control = None
            continue

        if current is None:
            # Drawing resumed after a `Z`: start a new sub-path at the closure point.
            current = SubPath(start=point)
            subpaths.append(current)

        if upper in ("L", "T"):
            if upper == "L":
                x, y = take(2)
                point = (x + ox, y + oy)
                current.segments.append(("L", point))
                last_cubic_control = last_quad_control = None
            else:
                control = _reflect(point, last_quad_control)
                x, y = take(2)
                point = (x + ox, y + oy)
                current.segments.append(("Q", control, point))
                last_quad_control = control
                last_cubic_control = None
        elif upper == "H":
            (x,) = take(1)
            point = (x + ox, point[1])
            current.segments.append(("L", point))
            last_cubic_control = last_quad_control = None
        elif upper == "V":
            (y,) = take(1)
            point = (point[0], y + oy)
            current.segments.append(("L", point))
            last_cubic_control = last_quad_control = None
        elif upper in ("C", "S"):
            if upper == "C":
                x1, y1, x2, y2, x, y = take(6)
                c1 = (x1 + ox, y1 + oy)
            else:
                c1 = _reflect(point, last_cubic_control)
                x2, y2, x, y = take(4)
            c2 = (x2 + ox, y2 + oy)
            point = (x + ox, y + oy)
            current.segments.append(("C", c1, c2, point))
            last_cubic_control = c2
            last_quad_control = None
        elif upper == "Q":
            x1, y1, x, y = take(4)
            control = (x1 + ox, y1 + oy)
            point = (x + ox, y + oy)
            current.segments.append(("Q", control, point))
            last_quad_control = control
            last_cubic_control = None
        elif upper == "A":
            raise SystemExit("Elliptical arcs are not supported by this builder")
        else:
            raise SystemExit(f"Unknown path command {command!r} in {d[:60]!r}…")

    return [sub for sub in subpaths if sub.segments]


def _reflect(point: Point, control: Point | None) -> Point:
    if control is None:
        return point
    return (2 * point[0] - control[0], 2 * point[1] - control[1])


def parse_points(points: str, closed: bool) -> list[SubPath]:
    numbers = [float(n) for n in NUMBER_RE.findall(points)]
    if len(numbers) < 4:
        return []
    coords = [(numbers[i], numbers[i + 1]) for i in range(0, len(numbers) - 1, 2)]
    sub = SubPath(start=coords[0], closed=closed)
    sub.segments = [("L", pt) for pt in coords[1:]]
    return [sub]


def transform_subpaths(subpaths: list[SubPath], matrix: Matrix) -> list[SubPath]:
    if matrix == IDENTITY:
        return subpaths
    out: list[SubPath] = []
    for sub in subpaths:
        moved = SubPath(start=apply_matrix(matrix, sub.start), closed=sub.closed)
        moved.segments = [
            (seg[0], *(apply_matrix(matrix, pt) for pt in seg[1:])) for seg in sub.segments
        ]
        out.append(moved)
    return out


def format_number(value: float) -> str:
    text = f"{value:.{COORD_DECIMALS}f}".rstrip("0").rstrip(".")
    return "0" if text in ("", "-0") else text


def subpaths_to_d(subpaths: list[SubPath]) -> str:
    parts: list[str] = []
    for sub in subpaths:
        parts.append(f"M {format_number(sub.start[0])} {format_number(sub.start[1])}")
        for segment in sub.segments:
            coords = " ".join(format_number(v) for pt in segment[1:] for v in pt)
            parts.append(f"{segment[0]} {coords}")
        if sub.closed:
            parts.append("Z")
    return " ".join(parts)


def _cubic_extrema(p0: float, p1: float, p2: float, p3: float) -> list[float]:
    """Parameters in (0, 1) where a cubic Bézier component has a local extremum."""
    # B'(t) / 3 = a·t² + b·t + c
    a = -p0 + 3 * p1 - 3 * p2 + p3
    b = 2 * (p0 - 2 * p1 + p2)
    c = p1 - p0
    if abs(a) < 1e-12:
        if abs(b) < 1e-12:
            return []
        roots = [-c / b]
    else:
        disc = b * b - 4 * a * c
        if disc < 0:
            return []
        sqrt_disc = math.sqrt(disc)
        roots = [(-b + sqrt_disc) / (2 * a), (-b - sqrt_disc) / (2 * a)]
    return [t for t in roots if 0 < t < 1]


def _cubic_at(p0: float, p1: float, p2: float, p3: float, t: float) -> float:
    u = 1 - t
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3


def bbox(subpaths: list[SubPath]) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    for sub in subpaths:
        cursor = sub.start
        xs.append(cursor[0])
        ys.append(cursor[1])
        for segment in sub.segments:
            end = segment[-1]
            xs.append(end[0])
            ys.append(end[1])
            if segment[0] == "C":
                _, c1, c2, end = segment
                for axis, values in ((0, xs), (1, ys)):
                    p0, p1, p2, p3 = cursor[axis], c1[axis], c2[axis], end[axis]
                    for t in _cubic_extrema(p0, p1, p2, p3):
                        values.append(_cubic_at(p0, p1, p2, p3, t))
            elif segment[0] == "Q":
                _, control, end = segment
                for axis, values in ((0, xs), (1, ys)):
                    p0, p1, p2 = cursor[axis], control[axis], end[axis]
                    denom = p0 - 2 * p1 + p2
                    if abs(denom) > 1e-12:
                        t = (p0 - p1) / denom
                        if 0 < t < 1:
                            u = 1 - t
                            values.append(u * u * p0 + 2 * u * t * p1 + t * t * p2)
            cursor = end
    return min(xs), min(ys), max(xs), max(ys)


def flatten(subpaths: list[SubPath], samples: int = 12) -> list[list[Point]]:
    rings: list[list[Point]] = []
    for sub in subpaths:
        cursor = sub.start
        ring = [cursor]
        for segment in sub.segments:
            if segment[0] == "L":
                ring.append(segment[1])
            elif segment[0] == "C":
                _, c1, c2, end = segment
                for step in range(1, samples + 1):
                    t = step / samples
                    ring.append(
                        (
                            _cubic_at(cursor[0], c1[0], c2[0], end[0], t),
                            _cubic_at(cursor[1], c1[1], c2[1], end[1], t),
                        )
                    )
            else:
                _, control, end = segment
                for step in range(1, samples + 1):
                    t = step / samples
                    u = 1 - t
                    ring.append(
                        (
                            u * u * cursor[0] + 2 * u * t * control[0] + t * t * end[0],
                            u * u * cursor[1] + 2 * u * t * control[1] + t * t * end[1],
                        )
                    )
            cursor = segment[-1]
        if len(ring) >= 3:
            rings.append(ring)
    return rings


def centroid(subpaths: list[SubPath]) -> Point:
    """Area-weighted centroid; each ring counts as its own island."""
    total_area = 0.0
    acc_x = 0.0
    acc_y = 0.0
    for ring in flatten(subpaths):
        area = 0.0
        cx = 0.0
        cy = 0.0
        for i in range(len(ring)):
            x0, y0 = ring[i]
            x1, y1 = ring[(i + 1) % len(ring)]
            cross = x0 * y1 - x1 * y0
            area += cross
            cx += (x0 + x1) * cross
            cy += (y0 + y1) * cross
        if abs(area) < 1e-9:
            continue
        weight = abs(area / 2)
        total_area += weight
        acc_x += weight * (cx / (3 * area))
        acc_y += weight * (cy / (3 * area))
    if total_area == 0:
        x0, y0, x1, y1 = bbox(subpaths)
        return ((x0 + x1) / 2, (y0 + y1) / 2)
    return (acc_x / total_area, acc_y / total_area)


# ------------------------------------------------------------------------ extraction


@dataclass
class Comarca:
    slug: str
    name: str
    region: str
    macro_dialect: str
    dialect_group: str
    source_ids: list[str] = field(default_factory=list)
    subpaths: list[SubPath] = field(default_factory=list)


def local_tag(el: ET.Element) -> str:
    return el.tag.rsplit("}", 1)[-1]


def element_subpaths(el: ET.Element) -> list[SubPath]:
    tag = local_tag(el)
    if tag == "path":
        return parse_path_data(el.get("d") or "")
    if tag in ("polygon", "polyline"):
        return parse_points(el.get("points") or "", closed=tag == "polygon")
    raise SystemExit(f"Element {el.get('id')!r} is a <{tag}>, not a drawable shape")


def load_config() -> dict:
    config = json.loads(CONFIG_JSON.read_text(encoding="utf-8"))
    for key in ("regions", "dialect_groups", "shapes"):
        if key not in config:
            raise SystemExit(f"{CONFIG_JSON} is missing the {key!r} key")
    return config


def collect_comarques(config: dict) -> tuple[dict[str, Comarca], list[str]]:
    shapes: dict[str, dict] = config["shapes"]
    dialect_groups: dict[str, str] = config["dialect_groups"]
    region_order = [region["id"] for region in config["regions"]]

    root = ET.parse(SOURCE_SVG).getroot()
    comarques: dict[str, Comarca] = {}
    dropped: list[str] = []
    seen: set[str] = set()

    def walk(el: ET.Element, matrix: Matrix) -> None:
        matrix = multiply(matrix, parse_matrix(el.get("transform")))
        tag = local_tag(el)
        element_id = el.get("id") or ""
        entry = shapes.get(element_id) if element_id else None

        if entry is not None:
            if element_id in seen:
                raise SystemExit(f"Duplicate source id in the SVG: {element_id!r}")
            seen.add(element_id)
            if entry["macroDialect"] not in MACRO_DIALECTS:
                raise SystemExit(
                    f"{element_id!r} has unknown macroDialect {entry['macroDialect']!r}"
                )
            if entry["region"] not in region_order:
                raise SystemExit(f"{element_id!r} has unknown region {entry['region']!r}")
            comarca = comarques.setdefault(
                entry["slug"],
                Comarca(
                    slug=entry["slug"],
                    name=entry["name"],
                    region=entry["region"],
                    macro_dialect=entry["macroDialect"],
                    dialect_group=dialect_groups[entry["macroDialect"]],
                ),
            )
            if (entry["name"], entry["region"], entry["macroDialect"]) != (
                comarca.name,
                comarca.region,
                comarca.macro_dialect,
            ):
                raise SystemExit(
                    f"{element_id!r} disagrees with the other shapes of {entry['slug']!r}"
                )
            comarca.source_ids.append(element_id)
            comarca.subpaths.extend(transform_subpaths(element_subpaths(el), matrix))
            return

        if tag in ("path", "polygon", "polyline"):
            dropped.append(element_id or f"<{tag}>")
            return
        if tag in ("defs", "namedview", "metadata", "style"):
            return
        if tag == "rect":
            dropped.append(element_id or "<rect>")
            return

        for child in el:
            walk(child, matrix)

    walk(root, IDENTITY)

    missing = sorted(set(shapes) - seen)
    if missing:
        raise SystemExit(f"Source ids in the JSON but not in the SVG: {', '.join(missing)}")

    order = {region: index for index, region in enumerate(region_order)}
    ordered = dict(
        sorted(comarques.items(), key=lambda item: (order[item[1].region], item[0]))
    )
    return ordered, dropped


# --------------------------------------------------------------------------- emitters


def indent_xml(el: ET.Element, level: int = 0) -> None:
    pad = "\n" + level * "  "
    if len(el):
        if not el.text or not el.text.strip():
            el.text = pad + "  "
        for child in el:
            indent_xml(child, level + 1)
        if not child.tail or not child.tail.strip():
            child.tail = pad
    if level and (not el.tail or not el.tail.strip()):
        el.tail = pad


def build_svg(comarques: dict[str, Comarca], view_box: tuple[float, float, float, float]) -> ET.Element:
    x, y, width, height = view_box
    svg = ET.Element(
        f"{{{SVG_NS}}}svg",
        {
            "version": "1.1",
            "viewBox": f"{format_number(x)} {format_number(y)} "
            f"{format_number(width)} {format_number(height)}",
            "width": format_number(width),
            "height": format_number(height),
            "role": "img",
            "aria-label": "Mapa comarcal de les àrees de parla catalana",
        },
    )
    svg.append(ET.Comment(f" Generated by {GENERATED_BY} — do not edit by hand. "))

    defs = ET.SubElement(svg, f"{{{SVG_NS}}}defs")
    style = ET.SubElement(defs, f"{{{SVG_NS}}}style")
    style.text = (
        ".oracle-comarca-shape {\n"
        "  fill: none;\n"
        "  stroke: #1f2933;\n"
        f"  stroke-width: {LINEWORK_STROKE_WIDTH};\n"
        "  stroke-linejoin: round;\n"
        "  stroke-linecap: round;\n"
        "  vector-effect: non-scaling-stroke;\n"
        "}"
    )

    regions = ET.SubElement(
        svg, f"{{{SVG_NS}}}g", {"id": "dialect-regions", "class": "oracle-regions"}
    )
    groups: dict[str, ET.Element] = {}
    for comarca in comarques.values():
        group = groups.get(comarca.dialect_group)
        if group is None:
            group = ET.SubElement(
                regions,
                f"{{{SVG_NS}}}g",
                {"id": comarca.dialect_group, "class": "oracle-region-group"},
            )
            groups[comarca.dialect_group] = group
        node = ET.SubElement(
            group,
            f"{{{SVG_NS}}}g",
            {
                "id": f"comarca-{comarca.slug}",
                "class": "oracle-comarca",
                "data-name": comarca.name,
                "data-region": comarca.region,
            },
        )
        ET.SubElement(
            node,
            f"{{{SVG_NS}}}path",
            {"class": "oracle-comarca-shape", "d": subpaths_to_d(comarca.subpaths)},
        )
    return svg


def write_svg(svg: ET.Element, path: Path) -> None:
    indent_xml(svg)
    content = ET.tostring(svg, encoding="unicode", short_empty_elements=False)
    if not re.search(r"<svg\b[^>]*\sxmlns=", content):
        content = content.replace("<svg ", f'<svg xmlns="{SVG_NS}" ', 1)
    path.write_text(f'<?xml version="1.0" encoding="utf-8"?>\n{content}\n', encoding="utf-8")
    ET.parse(path)


def write_meta_ts(config: dict, comarques: dict[str, Comarca]) -> None:
    regions = config["regions"]
    lines = [
        f"// Generated by {GENERATED_BY} — do not edit by hand.",
        'import type { DialectZone } from "./accentOracleClient";',
        "",
        "export interface ComarcaMapEntry {",
        "  id: string;",
        "  slug: string;",
        "  name: string;",
        "  region: string;",
        "  dialectGroup: string;",
        "  macroDialect: DialectZone;",
        "  centroidX: number;",
        "  centroidY: number;",
        "}",
        "",
        "export const COMARCA_REGION_ORDER: string[] = [",
    ]
    lines += [f'  "{region["id"]}",' for region in regions]
    lines += [
        "];",
        "",
        "export const COMARCA_REGION_LABELS: Record<string, string> = {",
    ]
    lines += [f'  "{region["id"]}": "{region["label"]}",' for region in regions]
    lines += [
        "};",
        "",
        "export const COMARCA_MAP_META: ComarcaMapEntry[] = [",
    ]
    for comarca in comarques.values():
        cx, cy = centroid(comarca.subpaths)
        lines.append(
            f'  {{ id: "comarca-{comarca.slug}", slug: "{comarca.slug}", '
            f'name: "{escape_ts(comarca.name)}", region: "{comarca.region}", '
            f'dialectGroup: "{comarca.dialect_group}", '
            f'macroDialect: "{comarca.macro_dialect}", '
            f"centroidX: {cx:.2f}, centroidY: {cy:.2f} }},"
        )
    lines += ["];", ""]
    OUTPUT_META_TS.write_text("\n".join(lines), encoding="utf-8")


def escape_ts(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def write_comarques_py(comarques: dict[str, Comarca]) -> None:
    by_slug = dict(sorted(comarques.items()))
    lines = [
        f'"""Generated by {GENERATED_BY} — do not edit by hand.',
        "",
        "Canonical comarca slugs for validating self-declared comarques server-side.",
        '"""',
        "",
        "from __future__ import annotations",
        "",
        "COMARCA_MACRO_DIALECTS: dict[str, str] = {",
    ]
    lines += [f'    "{slug}": "{c.macro_dialect}",' for slug, c in by_slug.items()]
    lines += ["}", "", "COMARCA_NAMES: dict[str, str] = {"]
    lines += [f'    "{slug}": "{escape_ts(c.name)}",' for slug, c in by_slug.items()]
    lines += ["}", "", "COMARCA_REGIONS: dict[str, str] = {"]
    lines += [f'    "{slug}": "{c.region}",' for slug, c in by_slug.items()]
    lines += [
        "}",
        "",
        "COMARCA_SLUGS: frozenset[str] = frozenset(COMARCA_MACRO_DIALECTS)",
        "",
    ]
    OUTPUT_COMARQUES_PY.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    config = load_config()
    comarques, dropped = collect_comarques(config)
    if not comarques:
        raise SystemExit("No comarca shapes extracted — check the source SVG ids")

    boxes = [bbox(c.subpaths) for c in comarques.values()]
    view_box = (
        min(b[0] for b in boxes) - VIEWBOX_PADDING,
        min(b[1] for b in boxes) - VIEWBOX_PADDING,
        max(b[2] for b in boxes) - min(b[0] for b in boxes) + 2 * VIEWBOX_PADDING,
        max(b[3] for b in boxes) - min(b[1] for b in boxes) + 2 * VIEWBOX_PADDING,
    )

    write_svg(build_svg(comarques, view_box), OUTPUT_SVG)
    write_meta_ts(config, comarques)
    write_comarques_py(comarques)

    per_region: dict[str, int] = {}
    for comarca in comarques.values():
        per_region[comarca.region] = per_region.get(comarca.region, 0) + 1

    print(f"Source: {SOURCE_SVG.relative_to(ROOT)}")
    print(f"Comarques: {len(comarques)} from {sum(len(c.source_ids) for c in comarques.values())} shapes")
    for region in config["regions"]:
        print(f"  {region['id']:<15} {per_region.get(region['id'], 0)}")
    print("viewBox: " + " ".join(format_number(v) for v in view_box))
    print(f"Dropped source shapes ({len(dropped)}): {', '.join(sorted(dropped))}")
    for path in (OUTPUT_SVG, OUTPUT_META_TS, OUTPUT_COMARQUES_PY):
        print(f"Wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
