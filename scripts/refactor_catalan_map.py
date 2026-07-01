#!/usr/bin/env python3
"""Refactor map-paisos-catalans.svg into dialect groups and emit web metadata."""

from __future__ import annotations

import copy
import json
import re
import shutil
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SVG = ROOT / "map-paisos-catalans.svg"
BACKUP_SVG = ROOT / "map-paisos-catalans.svg.bak"
OUTPUT_SVG = ROOT / "map-paisos-catalans.svg"
PUBLIC_SVG = ROOT / "web" / "public" / "map-paisos-catalans.svg"
CONFIG_PATH = ROOT / "scripts" / "comarca_dialect_map.json"
META_TS = ROOT / "web" / "src" / "lib" / "comarcaMapMeta.ts"

SVG_NS = "http://www.w3.org/2000/svg"
INK_NS = "http://www.inkscape.org/namespaces/inkscape"
XLINK_NS = "http://www.w3.org/1999/xlink"

VIEWBOX = "170 100 1000 1000"
MAP_STROKE_WIDTH = "0.5"


@dataclass
class RegionMeta:
    id: str
    slug: str
    display_name: str
    dialect_group: str
    macro_dialect: str
    centroid_x: float
    centroid_y: float
    path_d: str
    element_tag: str = "path"
    group_transform: str | None = None


@dataclass
class LandShape:
    element: ET.Element
    slug: str
    dialect_group: str
    macro_dialect: str
    display_name: str
    group_transform: tuple[float, float, float, float, float, float] | None = None
    synthetic: bool = False
    clip_path_d: str | None = None


def parse_matrix(transform: str | None) -> tuple[float, float, float, float, float, float]:
    if not transform:
        return (1, 0, 0, 1, 0, 0)
    if "matrix" in transform:
        nums = [float(n) for n in re.findall(r"-?\d+\.?\d*", transform)]
        return tuple(nums[:6])  # type: ignore[return-value]
    if "translate" in transform:
        nums = [float(n) for n in re.findall(r"-?\d+\.?\d*", transform)]
        tx = nums[0] if nums else 0.0
        ty = nums[1] if len(nums) > 1 else 0.0
        return (1, 0, 0, 1, tx, ty)
    return (1, 0, 0, 1, 0, 0)


def combine_matrix(
    outer: tuple[float, float, float, float, float, float],
    inner: tuple[float, float, float, float, float, float],
) -> tuple[float, float, float, float, float, float]:
    a1, b1, c1, d1, e1, f1 = outer
    a2, b2, c2, d2, e2, f2 = inner
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def transform_point(
    x: float,
    y: float,
    matrix: tuple[float, float, float, float, float, float],
) -> tuple[float, float]:
    a, b, c, d, e, f = matrix
    return a * x + c * y + e, b * x + d * y + f


PATH_TOKEN_RE = re.compile(
    r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?"
)

COMMAND_ARG_COUNTS = {
    "M": 2,
    "L": 2,
    "H": 1,
    "V": 1,
    "C": 6,
    "S": 4,
    "Q": 4,
    "T": 2,
    "A": 7,
    "Z": 0,
}


def path_absolute_points(d: str) -> list[tuple[float, float]]:
    tokens = PATH_TOKEN_RE.findall(d)
    if not tokens:
        return []

    points: list[tuple[float, float]] = []
    index = 0
    x = y = 0.0
    start_x = start_y = 0.0
    last_control: tuple[float, float] | None = None
    command = "M"

    def read_number() -> float:
        nonlocal index
        value = float(tokens[index])
        index += 1
        return value

    def add_point(px: float, py: float) -> None:
        points.append((px, py))

    while index < len(tokens):
        token = tokens[index]
        if token.isalpha():
            command = token
            index += 1
        elif command == "":
            break

        relative = command.islower()
        cmd = command.upper()

        if cmd == "Z":
            x, y = start_x, start_y
            add_point(x, y)
            last_control = None
            continue

        arg_count = COMMAND_ARG_COUNTS[cmd]
        while True:
            if index >= len(tokens) or tokens[index].isalpha():
                break
            if index + arg_count > len(tokens):
                break

            if cmd == "M":
                x = read_number()
                y = read_number()
                if relative:
                    x += points[-1][0] if points else 0.0
                    y += points[-1][1] if points else 0.0
                start_x, start_y = x, y
                add_point(x, y)
                command = "m" if relative else "L"
                last_control = None
            elif cmd == "L":
                x = read_number()
                y = read_number()
                if relative:
                    x += points[-1][0]
                    y += points[-1][1]
                add_point(x, y)
                last_control = None
            elif cmd == "H":
                x = read_number()
                if relative:
                    x += points[-1][0]
                add_point(x, y)
                last_control = None
            elif cmd == "V":
                y = read_number()
                if relative:
                    y += points[-1][1]
                add_point(x, y)
                last_control = None
            elif cmd == "C":
                c1x, c1y = read_number(), read_number()
                c2x, c2y = read_number(), read_number()
                x, y = read_number(), read_number()
                if relative:
                    ox, oy = points[-1]
                    c1x += ox
                    c1y += oy
                    c2x += ox
                    c2y += oy
                    x += ox
                    y += oy
                add_point(c1x, c1y)
                add_point(c2x, c2y)
                add_point(x, y)
                last_control = (c2x, c2y)
            elif cmd == "S":
                c2x, c2y = read_number(), read_number()
                x, y = read_number(), read_number()
                ox, oy = points[-1]
                if relative:
                    c2x += ox
                    c2y += oy
                    x += ox
                    y += oy
                if last_control is not None:
                    c1x = 2 * ox - last_control[0]
                    c1y = 2 * oy - last_control[1]
                    add_point(c1x, c1y)
                add_point(c2x, c2y)
                add_point(x, y)
                last_control = (c2x, c2y)
            elif cmd == "Q":
                c1x, c1y = read_number(), read_number()
                x, y = read_number(), read_number()
                if relative:
                    ox, oy = points[-1]
                    c1x += ox
                    c1y += oy
                    x += ox
                    y += oy
                add_point(c1x, c1y)
                add_point(x, y)
                last_control = (c1x, c1y)
            elif cmd == "T":
                x, y = read_number(), read_number()
                ox, oy = points[-1]
                if relative:
                    x += ox
                    y += oy
                if last_control is not None:
                    c1x = 2 * ox - last_control[0]
                    c1y = 2 * oy - last_control[1]
                    add_point(c1x, c1y)
                    last_control = (c1x, c1y)
                add_point(x, y)
            elif cmd == "A":
                read_number()
                read_number()
                read_number()
                read_number()
                read_number()
                x = read_number()
                y = read_number()
                if relative:
                    x += points[-1][0]
                    y += points[-1][1]
                add_point(x, y)
                last_control = None
            else:
                break

            if cmd != "M" or command in {"L", "l"}:
                if tokens[index:index + 1] and not tokens[index].isalpha():
                    continue
                break

    return points


def bbox_from_geometry(d: str | None, points: str | None) -> tuple[float, float, float, float] | None:
    if d:
        path_points = path_absolute_points(d)
        if not path_points:
            return None
        xs = [point[0] for point in path_points]
        ys = [point[1] for point in path_points]
        return min(xs), min(ys), max(xs), max(ys)
    if points:
        nums = [float(n) for n in re.findall(r"-?\d+\.?\d*", points)]
    else:
        return None
    if len(nums) < 2:
        return None
    xs = nums[0::2]
    ys = nums[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def centroid_from_geometry(d: str | None, points: str | None) -> tuple[float, float] | None:
    bbox = bbox_from_geometry(d, points)
    if not bbox:
        return None
    return (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2


def assign_valencia_zone(cx: float, cy: float, zones: list[dict]) -> dict:
    matches = [
        zone
        for zone in zones
        if zone["bounds"]["xmin"] <= cx <= zone["bounds"]["xmax"]
        and zone["bounds"]["ymin"] <= cy <= zone["bounds"]["ymax"]
    ]
    if matches:
        return matches[0]
    return zones[1]


def intersect_bounds(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> tuple[float, float, float, float] | None:
    xmin = max(a[0], b[0])
    ymin = max(a[1], b[1])
    xmax = min(a[2], b[2])
    ymax = min(a[3], b[3])
    if xmax <= xmin or ymax <= ymin:
        return None
    return xmin, ymin, xmax, ymax


def rect_path(xmin: float, ymin: float, xmax: float, ymax: float) -> str:
    return f"M {xmin},{ymin} H {xmax} V {ymax} H {xmin} Z"


def path_area(d: str | None, points: str | None) -> float:
    bbox = bbox_from_geometry(d, points)
    if not bbox:
        return 0.0
    return (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])


def zone_bounds_tuple(zone: dict) -> tuple[float, float, float, float]:
    bounds = zone["bounds"]
    return bounds["xmin"], bounds["ymin"], bounds["xmax"], bounds["ymax"]


def make_synthetic_path(d: str) -> ET.Element:
    return ET.Element(f"{{{SVG_NS}}}path", {"d": d})


def add_valencia_zone_rects(
    land_bbox: tuple[float, float, float, float],
    config: dict,
    add_land: callable,
    zone_ids_seen: set[str],
) -> None:
    for zone in config["valencia_zones"]:
        zone_id = zone["id"]
        if zone_id in zone_ids_seen:
            continue
        intersection = intersect_bounds(land_bbox, zone_bounds_tuple(zone))
        if intersection is None:
            continue
        suffix = zone_id.replace("ca-valencia-", "")
        slug = f"valencia-{suffix}"
        display = config["display_names"].get(slug, suffix.title())
        element = make_synthetic_path(rect_path(*intersection))
        add_land(element, slug, zone_id, zone["macro_dialect"], display, synthetic=True)
        zone_ids_seen.add(zone_id)


def slug_to_dialect(slug: str, config: dict) -> tuple[str, str] | None:
    for group_id, group in config["dialect_groups"].items():
        if slug in group["comarques"]:
            return group_id, group["macro_dialect"]
    return None


PRESENTATION_ATTRS = (
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-miterlimit",
    "stroke-dasharray",
    "stroke-opacity",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
    "display",
)


def label_to_deco_id(label: str) -> str:
    return "deco-" + re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def ensure_stroke_only_border(el: ET.Element) -> None:
    """Border paths are closed shapes; without fill=none they default to black."""
    tag = el.tag.split("}")[-1]
    if tag in {"path", "polygon", "rect", "circle", "ellipse"}:
        el.attrib["fill"] = "none"


STROKE_ONLY_DECO_IDS = frozenset(
    {
        "deco-alguer-minimap",
    }
)


def finalize_decoration_element(el: ET.Element, subgroup_id: str) -> None:
    deco_id = el.attrib.get("id", "")
    if subgroup_id == "deco-borders" or deco_id in STROKE_ONLY_DECO_IDS:
        ensure_stroke_only_border(el)
    el.attrib.pop("stroke-width", None)


def geometry_key(el: ET.Element) -> str | None:
    tag = el.tag.split("}")[-1]
    if tag == "path":
        return el.get("d")
    if tag == "polygon":
        return el.get("points")
    return None


def is_useless_element(el: ET.Element) -> bool:
    tag = el.tag.split("}")[-1]
    if tag == "image":
        href = el.get("href") or el.get(f"{{{XLINK_NS}}}href")
        return not href
    if tag in {"path", "polygon", "rect", "circle", "ellipse", "line", "polyline"}:
        return geometry_key(el) is None and not el.get("width")
    return False


def strip_presentation(el: ET.Element) -> None:
    style = el.attrib.get("style", "")
    if style:
        for token in (
            r"fill:[^;]+;?",
            r"fill-opacity:[^;]+;?",
            r"stroke:[^;]+;?",
            r"stroke-width:[^;]+;?",
            r"stroke-miterlimit:[^;]+;?",
            r"stroke-dasharray:[^;]+;?",
            r"stroke-opacity:[^;]+;?",
            r"display:[^;]+;?",
        ):
            style = re.sub(token, "", style)
        style = style.strip().strip(";")
        if style:
            el.attrib["style"] = style
        else:
            el.attrib.pop("style", None)
    for attr in PRESENTATION_ATTRS:
        el.attrib.pop(attr, None)
    el.attrib.pop("enable-background", None)


def sanitize_decoration_tree(
    el: ET.Element,
    skip_labels: set[str],
    ink_label: str,
) -> ET.Element | None:
    if is_useless_element(el):
        return None

    clone = copy.deepcopy(el)
    label = clone.get(ink_label) or clone.attrib.get("inkscape:label")
    if label in skip_labels:
        return None

    for attr in list(clone.attrib):
        local_name = attr.rsplit("}", 1)[-1]
        if (
            "inkscape" in attr
            or "sodipodi" in attr
            or local_name == "label"
            or local_name == "enable-background"
        ):
            del clone.attrib[attr]
            continue
        if local_name in {"href", "label"} and attr.startswith("{"):
            value = clone.attrib[attr]
            del clone.attrib[attr]
            clone.attrib[local_name] = value

    if label:
        clone.attrib["id"] = label_to_deco_id(label)

    strip_presentation(clone)

    tag = clone.tag.split("}")[-1]
    if tag in {"g", "svg"}:
        new_children: list[ET.Element] = []
        for child in list(clone):
            child_label = child.get(ink_label) or child.attrib.get("inkscape:label")
            if child_label in skip_labels:
                continue
            cleaned = sanitize_decoration_tree(child, skip_labels, ink_label)
            if cleaned is not None:
                new_children.append(cleaned)
        for child in list(clone):
            clone.remove(child)
        for child in new_children:
            clone.append(child)
        if tag == "g" and not list(clone):
            return None

    return clone


def clean_element(el: ET.Element, skip_labels: set[str] | None = None) -> ET.Element:
    ink_label = f"{{{INK_NS}}}label"
    if skip_labels is not None:
        cleaned = sanitize_decoration_tree(el, skip_labels, ink_label)
        if cleaned is None:
            return ET.Element(f"{{{SVG_NS}}}g")
        return cleaned

    clone = copy.deepcopy(el)
    for attr in list(clone.attrib):
        local_name = attr.rsplit("}", 1)[-1]
        if (
            "inkscape" in attr
            or "sodipodi" in attr
            or local_name == "label"
            or local_name == "enable-background"
        ):
            del clone.attrib[attr]
            continue
        if local_name in {"href", "label"} and attr.startswith("{"):
            value = clone.attrib[attr]
            del clone.attrib[attr]
            clone.attrib[local_name] = value
    strip_presentation(clone)
    return clone


def prepare_region_element(clone: ET.Element, region_id: str) -> ET.Element:
    clone.attrib["id"] = region_id
    clone.attrib["class"] = "dialect-region"
    clone.attrib.pop(f"{{{INK_NS}}}label", None)
    return clone


def matrix_to_str(matrix: tuple[float, float, float, float, float, float]) -> str:
    a, b, c, d, e, f = matrix
    return f"matrix({a},{b},{c},{d},{e},{f})"


def is_hidden_element(el: ET.Element) -> bool:
    style = el.attrib.get("style", "")
    return "display:none" in style.replace(" ", "")


# Inkscape layers marked display:none that we still want in the output.
VISIBLE_HIDDEN_DECORATIONS = frozenset({"ponent"})


def has_hidden_decoration_group_ancestor(
    el: ET.Element,
    root: ET.Element,
    decoration_labels: set[str],
    ink_label: str,
) -> bool:
    parent_map = {child: parent for parent in root.iter() for child in parent}
    current = parent_map.get(el)
    while current is not None and current is not root:
        label = current.get(ink_label)
        if label in decoration_labels and is_hidden_element(current):
            return True
        current = parent_map.get(current)
    return False


def has_labeled_decoration_ancestor(el: ET.Element, root: ET.Element, decoration_labels: set[str], ink_label: str) -> bool:
    parent_map = {child: parent for parent in root.iter() for child in parent}
    current = parent_map.get(el)
    while current is not None and current is not root:
        if is_hidden_element(current):
            current = parent_map.get(current)
            continue
        label = current.get(ink_label)
        if label in decoration_labels:
            return True
        current = parent_map.get(current)
    return False


def is_inkscape_source(root: ET.Element) -> bool:
    ink_label = f"{{{INK_NS}}}label"
    return any(el.get(ink_label) == "catalunya-comarques" for el in root.iter())


def collect_land_shapes_from_refactored(root: ET.Element, config: dict) -> list[LandShape]:
    parent_map = {child: parent for parent in root.iter() for child in parent}
    macro_for_group = {
        group_id: group["macro_dialect"] for group_id, group in config["dialect_groups"].items()
    }
    for zone in config["valencia_zones"]:
        macro_for_group[zone["id"]] = zone["macro_dialect"]

    land_shapes: list[LandShape] = []
    for node in root.iter():
        if node.get("class") != "dialect-region":
            continue
        region_id = node.get("id") or ""
        if not region_id.startswith("comarca-"):
            continue
        slug = region_id.removeprefix("comarca-")
        group_el = parent_map.get(node)
        while group_el is not None and not (group_el.get("id") or "").startswith("ca-"):
            group_el = parent_map.get(group_el)
        group_id = group_el.get("id") if group_el is not None else "ca-central"
        macro = macro_for_group.get(group_id, "central")
        display = config["display_names"].get(slug, slug.replace("-", " ").title())
        transform_parent = parent_map.get(node)
        matrix = (
            parse_matrix(transform_parent.get("transform"))
            if transform_parent is not None
            and transform_parent.tag.split("}")[-1] == "g"
            and transform_parent.get("transform")
            else (1, 0, 0, 1, 0, 0)
        )
        synthetic = slug.startswith("valencia-")
        land_shapes.append(
            LandShape(
                element=clean_element(node),
                slug=slug,
                dialect_group=group_id,
                macro_dialect=macro,
                display_name=display,
                group_transform=matrix if matrix != (1, 0, 0, 1, 0, 0) else None,
                synthetic=synthetic,
            )
        )
    return land_shapes


def collect_decoration_elements(root: ET.Element, config: dict, skip_labels: set[str]) -> list[tuple[str, ET.Element]]:
    ink_label = f"{{{INK_NS}}}label"
    excluded = set(config.get("excluded_decorations", []))
    decoration_labels = set(config["decoration_labels"]) - excluded
    decoration_by_label: dict[str, ET.Element] = {}
    seen_geometry: set[str] = set()

    def should_skip_decoration(el: ET.Element) -> bool:
        label = el.get(ink_label) or el.attrib.get("inkscape:label")
        if label in skip_labels:
            return True
        if is_hidden_element(el) and label not in VISIBLE_HIDDEN_DECORATIONS:
            return True
        return False

    def add_decoration(label: str, el: ET.Element) -> None:
        if label in decoration_by_label:
            return
        cleaned = clean_element(el, skip_labels)
        if is_useless_element(cleaned) or (cleaned.tag.split("}")[-1] == "g" and not list(cleaned)):
            return
        key = geometry_key(cleaned)
        if key and key in seen_geometry:
            return
        if key:
            seen_geometry.add(key)
        decoration_by_label[label] = cleaned

    for el in root.iter():
        label = el.get(ink_label)
        if label not in decoration_labels or should_skip_decoration(el):
            continue
        if has_labeled_decoration_ancestor(el, root, decoration_labels, ink_label):
            continue
        if has_hidden_decoration_group_ancestor(el, root, decoration_labels, ink_label):
            continue
        add_decoration(label, el)

    refactored_deco = root.find(".//*[@id='map-decoration']")
    if refactored_deco is not None and not is_inkscape_source(root) and not decoration_by_label:
        for layer in refactored_deco:
            for child in layer:
                child_id = child.get("id", "")
                label = child_id.removeprefix("deco-").replace("-", "-")
                add_decoration(label or child_id, child)

    ordered_labels = config["decoration_labels"]
    return [(label, decoration_by_label[label]) for label in ordered_labels if label in decoration_by_label]


def organize_decoration(labeled_elements: list[tuple[str, ET.Element]], config: dict) -> list[ET.Element]:
    groups_config = config.get("decoration_groups", {})
    subgroup_order = list(groups_config.keys()) + ["deco-misc"]
    label_to_subgroup: dict[str, str] = {}
    for subgroup_id, labels in groups_config.items():
        for label in labels:
            label_to_subgroup[label] = subgroup_id

    buckets: dict[str, list[ET.Element]] = {group_id: [] for group_id in subgroup_order}
    for label, element in labeled_elements:
        subgroup_id = label_to_subgroup.get(label, "deco-misc")
        buckets.setdefault(subgroup_id, []).append(element)

    organized: list[ET.Element] = []
    for subgroup_id in subgroup_order:
        children = buckets.get(subgroup_id, [])
        if not children:
            continue
        group = ET.Element(
            f"{{{SVG_NS}}}g",
            {"id": subgroup_id, "class": "map-decoration-layer"},
        )
        for child in children:
            finalize_decoration_element(child, subgroup_id)
            group.append(child)
        organized.append(group)
    return organized


def collect_land_shapes_from_inkscape(root: ET.Element, config: dict) -> list[LandShape]:
    ink_label = f"{{{INK_NS}}}label"
    land_shapes: list[LandShape] = []
    comarques_matrix = parse_matrix(config["comarques_transform"])

    def add_land(
        el: ET.Element,
        slug: str,
        dialect_group: str,
        macro: str,
        display_name: str,
        group_transform: tuple[float, float, float, float, float, float] | None = None,
        synthetic: bool = False,
        clip_path_d: str | None = None,
    ) -> None:
        land_shapes.append(
            LandShape(
                element=clean_element(el),
                slug=slug,
                dialect_group=dialect_group,
                macro_dialect=macro,
                display_name=display_name,
                group_transform=group_transform,
                synthetic=synthetic,
                clip_path_d=clip_path_d,
            )
        )

    comarques_group = next((e for e in root.iter() if e.get(ink_label) == "catalunya-comarques"), None)
    if comarques_group is not None:
        for child in comarques_group:
            if child.tag.split("}")[-1] != "path":
                continue
            slug = child.get(ink_label)
            if not slug:
                continue
            mapped = slug_to_dialect(slug, config)
            if not mapped:
                continue
            group_id, macro = mapped
            display = config["display_names"].get(slug, slug.replace("-", " ").title())
            add_land(child, slug, group_id, macro, display, comarques_matrix)

    nord_group = next((e for e in root.iter() if e.get(ink_label) == "catalunya-nord"), None)
    if nord_group is not None:
        for index, child in enumerate(nord_group):
            if child.tag.split("}")[-1] != "path":
                continue
            child_transform = parse_matrix(child.get("transform"))
            identity = (1, 0, 0, 1, 0, 0)
            # Paths in the catalunya-nord group use mixed spaces: the main
            # polygon is already in map coordinates, while the second piece
            # carries its own translate(170,100). Never apply a blanket offset.
            matrix = child_transform if child_transform != identity else None
            slug = "catalunya-nord" if index == 0 else f"catalunya-nord-{index + 1}"
            display = config["display_names"]["catalunya-nord"]
            add_land(child, slug, "ca-northern", "northern", display, matrix)

    balear_group = next((e for e in root.iter() if e.get(ink_label) == "illes-balears"), None)
    if balear_group is not None:
        for child in balear_group:
            if child.tag.split("}")[-1] != "path":
                continue
            slug = child.get(ink_label)
            if not slug:
                continue
            display = config["display_names"].get(slug, slug.title())
            add_land(child, slug, "ca-balear", "balearic", display)

    valencia_paths: list[ET.Element] = []
    valencia_group = next(
        (e for e in root.iter() if e.get(ink_label) == "valencia" and e.tag.split("}")[-1] == "g"),
        None,
    )
    if valencia_group is not None:
        for child in valencia_group:
            if child.tag.split("}")[-1] == "path":
                valencia_paths.append(child)
    for el in root.iter():
        if el.get(ink_label) == "valencia" and el.tag.split("}")[-1] == "path":
            valencia_paths.append(el)

    main_valencia = max(valencia_paths, key=lambda el: path_area(el.get("d"), el.get("points")))
    add_land(
        main_valencia,
        "valencia",
        "ca-valencia",
        "valencian",
        config["display_names"].get("valencia", "País Valencià"),
    )

    for el in root.iter():
        label = el.get(ink_label)
        if label == "andorra" and el.tag.split("}")[-1] == "path":
            add_land(el, "andorra", "ca-nwestern", "northwestern", config["display_names"]["andorra"])
        if label == "ardemuz" and el.tag.split("}")[-1] == "path":
            add_land(el, "ardemuz", "ca-nwestern", "northwestern", config["display_names"]["ardemuz"])

    return land_shapes


def build_skip_labels(config: dict) -> set[str]:
    skip_labels = {"catalunya-comarques", "catalunya-nord", "illes-balears", "valencia", "andorra", "ardemuz"}
    for group in config["dialect_groups"].values():
        skip_labels.update(group["comarques"])
    return skip_labels


def collect_land_shapes(
    root: ET.Element,
    config: dict,
) -> tuple[list[LandShape], list[tuple[str, ET.Element]]]:
    skip_labels = build_skip_labels(config)
    if is_inkscape_source(root):
        land_shapes = collect_land_shapes_from_inkscape(root, config)
        decoration = collect_decoration_elements(root, config, skip_labels)
    else:
        land_shapes = collect_land_shapes_from_refactored(root, config)
        decoration = collect_decoration_elements(root, config, skip_labels)
    return land_shapes, decoration


def build_svg(
    land_shapes: list[LandShape],
    labeled_decoration: list[tuple[str, ET.Element]],
    config: dict,
) -> ET.Element:
    svg = ET.Element(
        f"{{{SVG_NS}}}svg",
        {
            "version": "1.1",
            "viewBox": VIEWBOX,
            "width": "1000",
            "height": "1000",
        },
    )

    defs = ET.SubElement(svg, f"{{{SVG_NS}}}defs")
    style = ET.SubElement(defs, f"{{{SVG_NS}}}style")
    style.text = f"""
.dialect-region {{
  fill: #e6e6e6;
  stroke: #1a1a1a;
  stroke-width: {MAP_STROKE_WIDTH};
  stroke-linejoin: round;
}}
.map-label {{
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 10px;
  font-weight: 700;
  fill: #2a3a42;
  pointer-events: none;
}}
.map-label.island {{
  font-size: 11px;
}}
.map-decoration-layer {{
  pointer-events: none;
}}
.map-decoration-layer path,
.map-decoration-layer polygon {{
  stroke-width: {MAP_STROKE_WIDTH};
  stroke-linejoin: round;
}}
#deco-sea .deco-sea,
#deco-sea rect {{
  fill: #d4e8f2;
  stroke: none;
}}
#deco-background path,
#deco-background polygon {{
  fill: #a8a8a8;
  stroke: #ffffff;
}}
#deco-borders path,
#deco-borders polygon {{
  fill: none;
  stroke: #666666;
}}
#deco-alguer #deco-alguer-island,
#deco-alguer #deco-alguer-ciutat,
#deco-alguer #deco-alguer {{
  fill: #c8c8c8;
  stroke: #444444;
}}
#deco-alguer #deco-alguer-minimap {{
  fill: none;
  stroke: #444444;
}}
#deco-compass,
#deco-scale {{
  display: none;
}}
""".strip()

    deco = ET.SubElement(svg, f"{{{SVG_NS}}}g", {"id": "map-decoration"})
    for layer in organize_decoration(labeled_decoration, config):
        deco.append(layer)

    regions_root = ET.SubElement(svg, f"{{{SVG_NS}}}g", {"id": "dialect-regions"})
    group_order = [
        "ca-northern",
        "ca-nwestern",
        "ca-central",
        "ca-valencia",
        "ca-balear",
    ]
    groups: dict[str, ET.Element] = {}
    for group_id in group_order:
        groups[group_id] = ET.SubElement(
            regions_root,
            f"{{{SVG_NS}}}g",
            {"id": group_id, "class": "dialect-region-group"},
        )

    for shape in land_shapes:
        parent = groups[shape.dialect_group]
        region_id = f"comarca-{shape.slug}"
        clone = prepare_region_element(shape.element, region_id)
        if shape.group_transform and shape.group_transform != (1, 0, 0, 1, 0, 0):
            clone.attrib.pop("transform", None)
            wrapper = ET.SubElement(
                parent,
                f"{{{SVG_NS}}}g",
                {"transform": matrix_to_str(shape.group_transform)},
            )
            wrapper.append(clone)
        else:
            parent.append(clone)

    ET.SubElement(svg, f"{{{SVG_NS}}}g", {"id": "map-labels"})
    return svg


def build_metadata(land_shapes: list[LandShape]) -> list[RegionMeta]:
    metas: list[RegionMeta] = []
    for shape in land_shapes:
        d = shape.element.get("d")
        points = shape.element.get("points")
        local_centroid = centroid_from_geometry(d, points)
        if not local_centroid:
            continue
        matrix = shape.group_transform or (1, 0, 0, 1, 0, 0)
        cx, cy = transform_point(local_centroid[0], local_centroid[1], matrix)
        tag = shape.element.tag.split("}")[-1]
        path_value = d or points or ""
        metas.append(
            RegionMeta(
                id=f"comarca-{shape.slug}",
                slug=shape.slug,
                display_name=shape.display_name,
                dialect_group=shape.dialect_group,
                macro_dialect=shape.macro_dialect,
                centroid_x=round(cx, 2),
                centroid_y=round(cy, 2),
                path_d=path_value,
                element_tag=tag,
                group_transform=(
                    matrix_to_str(matrix)
                    if matrix != (1, 0, 0, 1, 0, 0)
                    else None
                ),
            )
        )
    return metas


def collect_clip_paths(land_shapes: list[LandShape]) -> list[tuple[str, str | None]]:
    clip_paths: list[tuple[str, str | None]] = []
    seen: set[str] = set()
    for shape in land_shapes:
        if shape.clip_path_d and shape.clip_path_d not in seen:
            clip_paths.append((shape.clip_path_d, None))
            seen.add(shape.clip_path_d)
    for shape in land_shapes:
        if shape.synthetic:
            continue
        d = shape.element.get("d") or shape.element.get("points") or ""
        if not d or d in seen:
            continue
        transform = (
            matrix_to_str(shape.group_transform)
            if shape.group_transform and shape.group_transform != (1, 0, 0, 1, 0, 0)
            else None
        )
        clip_paths.append((d, transform))
        seen.add(d)
    return clip_paths


def emit_meta_ts(metas: list[RegionMeta]) -> None:
    lines = [
        "// Generated by scripts/refactor_catalan_map.py — do not edit manually.",
        'import type { DialectZone } from "./accentOracleClient";',
        "",
        "export interface ComarcaMapEntry {",
        "  id: string;",
        "  slug: string;",
        "  dialectGroup: string;",
        "  macroDialect: DialectZone;",
        "  centroidX: number;",
        "  centroidY: number;",
        "}",
        "",
        "export const COMARCA_MAP_META: ComarcaMapEntry[] = [",
    ]
    for meta in metas:
        lines.append(
            f'  {{ id: "{meta.id}", slug: "{meta.slug}", '
            f'dialectGroup: "{meta.dialect_group}", macroDialect: "{meta.macro_dialect}", '
            f"centroidX: {meta.centroid_x}, centroidY: {meta.centroid_y} }},"
        )
    lines.append("];")
    lines.append("")
    META_TS.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_svg_file(svg: ET.Element, path: Path) -> None:
    indent_xml(svg)
    content = ET.tostring(svg, encoding="unicode", short_empty_elements=False)
    content = re.sub(r"<ns\d+:", "<", content)
    content = re.sub(r"</ns\d+:", "</", content)
    content = re.sub(r'\sxmlns:ns\d+="[^"]*"', "", content)
    content = re.sub(r'\sns\d+:[^=]+="[^"]*"', "", content)
    content = re.sub(
        r'(<svg\b[^>]*?)\sxmlns="http://www.w3.org/2000/svg"([^>]*?)\sxmlns="http://www.w3.org/2000/svg"',
        r'\1 xmlns="http://www.w3.org/2000/svg"\2',
        content,
        count=1,
    )
    content = re.sub(r'\sxmlns:inkscape="[^"]*"', "", content)
    content = content.replace("ns1:href=", "href=")
    if not re.search(r"<svg\b[^>]*\sxmlns=", content):
        content = content.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
    path.write_text(f'<?xml version="1.0" encoding="utf-8"?>\n{content}\n', encoding="utf-8")
    ET.parse(path)


def indent_xml(elem: ET.Element, level: int = 0) -> None:
    indent = "\n" + level * "  "
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = indent + "  "
        for child in elem:
            indent_xml(child, level + 1)
        if not child.tail or not child.tail.strip():
            child.tail = indent
    if level and (not elem.tail or not elem.tail.strip()):
        elem.tail = indent


def verify_groups(svg: ET.Element) -> dict[str, int]:
    counts: dict[str, int] = {}
    for group_id in [
        "ca-central",
        "ca-nwestern",
        "ca-northern",
        "ca-valencia",
        "ca-balear",
    ]:
        group = svg.find(f".//*[@id='{group_id}']")
        if group is None:
            counts[group_id] = 0
            continue
        counts[group_id] = len([c for c in group.iter() if c.tag.split("}")[-1] in {"path", "polygon"}])
    return counts


def main() -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if not SOURCE_SVG.exists():
        raise SystemExit(f"Missing source SVG: {SOURCE_SVG}")

    if not BACKUP_SVG.exists():
        shutil.copy2(SOURCE_SVG, BACKUP_SVG)

    parse_path = BACKUP_SVG if BACKUP_SVG.exists() else SOURCE_SVG
    ET.register_namespace("inkscape", INK_NS)
    root = ET.parse(parse_path).getroot()
    land_shapes, labeled_decoration = collect_land_shapes(root, config)
    svg = build_svg(land_shapes, labeled_decoration, config)
    metas = build_metadata(land_shapes)

    labels_root = svg.find(f".//*[@id='map-labels']")
    labeled_slugs: set[str] = set()
    if labels_root is not None:
        for meta in metas:
            if meta.slug in labeled_slugs:
                continue
            if meta.slug.startswith("valencia-") and "-" in meta.slug[9:]:
                continue
            labeled_slugs.add(meta.slug)
            label_class = "map-label island" if meta.dialect_group == "ca-balear" else "map-label"
            text = ET.SubElement(
                labels_root,
                f"{{{SVG_NS}}}text",
                {
                    "class": label_class,
                    "x": str(meta.centroid_x),
                    "y": str(meta.centroid_y),
                    "text-anchor": "middle",
                    "dominant-baseline": "middle",
                },
            )
            text.text = meta.display_name

    write_svg_file(svg, OUTPUT_SVG)

    PUBLIC_SVG.parent.mkdir(parents=True, exist_ok=True)
    write_svg_file(svg, PUBLIC_SVG)
    emit_meta_ts(metas)

    counts = verify_groups(svg)
    print("Refactored map written to:", OUTPUT_SVG)
    print("Public copy:", PUBLIC_SVG)
    print("Metadata:", META_TS)
    print("\nDialect group path counts:")
    for group_id, count in counts.items():
        status = "OK" if count > 0 else "EMPTY"
        print(f"  {group_id}: {count} [{status}]")
    print(f"\nTotal comarca regions: {len(metas)}")


if __name__ == "__main__":
    main()
