#!/usr/bin/env python3
"""Build a BoldVoice-style linework SVG from the refactored comarca map.

Reads web/public/map-paisos-catalans.svg (or root map-paisos-catalans.svg),
strips decorations/labels, and writes a void-stage linework asset with the
same comarca-{slug} IDs for the interactive results map.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_CANDIDATES = [
    ROOT / "web" / "public" / "map-paisos-catalans.svg",
    ROOT / "map-paisos-catalans.svg",
]
OUTPUT_SVG = ROOT / "web" / "public" / "map-oracle-linework.svg"
ROOT_OUTPUT_SVG = ROOT / "map-oracle-linework.svg"

SVG_NS = "http://www.w3.org/2000/svg"
VIEWBOX = "170 100 1000 1000"
LINEWORK_STROKE_WIDTH = "1.4"

ET.register_namespace("", SVG_NS)


def local_tag(el: ET.Element) -> str:
    return el.tag.rsplit("}", 1)[-1]


def find_source() -> Path:
    for path in SOURCE_CANDIDATES:
        if path.exists():
            return path
    raise SystemExit("Missing source map SVG (web/public or root map-paisos-catalans.svg)")


def strip_presentation(el: ET.Element) -> None:
    for attr in (
        "fill",
        "fill-opacity",
        "stroke",
        "stroke-width",
        "stroke-opacity",
        "stroke-miterlimit",
        "stroke-dasharray",
        "stroke-linecap",
        "stroke-linejoin",
        "style",
        "opacity",
        "filter",
    ):
        el.attrib.pop(attr, None)


def clone_region_tree(el: ET.Element) -> ET.Element:
    """Deep-copy a comarca node (path or g), keeping geometry + id/class only."""
    tag = local_tag(el)
    clone = ET.Element(f"{{{SVG_NS}}}{tag}")

    for key in ("id", "class", "d", "points", "transform"):
        if key in el.attrib:
            clone.attrib[key] = el.attrib[key]

    if tag in {"path", "polygon"}:
        strip_presentation(clone)
        clone.attrib["class"] = "oracle-comarca"
        if "id" in clone.attrib and not clone.attrib["id"].startswith("comarca-"):
            clone.attrib.pop("id", None)
            clone.attrib["class"] = "oracle-comarca-part"
    elif tag == "g":
        clone.attrib["class"] = "oracle-comarca"
        for child in el:
            child_tag = local_tag(child)
            if child_tag in {"path", "polygon", "g"}:
                clone.append(clone_region_tree(child))

    return clone


def build_linework_svg(source_root: ET.Element) -> ET.Element:
    regions = source_root.find(".//*[@id='dialect-regions']")
    if regions is None:
        raise SystemExit("Source SVG missing #dialect-regions")

    svg = ET.Element(
        f"{{{SVG_NS}}}svg",
        {
            "version": "1.1",
            "viewBox": VIEWBOX,
            "width": "1000",
            "height": "1000",
            "role": "img",
            "aria-label": "Mapa linework de les àrees de parla catalana",
        },
    )

    defs = ET.SubElement(svg, f"{{{SVG_NS}}}defs")
    style = ET.SubElement(defs, f"{{{SVG_NS}}}style")
    style.text = f"""
.oracle-comarca {{
  fill: none;
  stroke: currentColor;
  stroke-width: {LINEWORK_STROKE_WIDTH};
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}}
.oracle-comarca-part {{
  fill: none;
  stroke: inherit;
  stroke-width: inherit;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}}
""".strip()

    glow = ET.SubElement(
        defs,
        f"{{{SVG_NS}}}filter",
        {"id": "oracle-selection-glow", "x": "-40%", "y": "-40%", "width": "180%", "height": "180%"},
    )
    ET.SubElement(
        glow,
        f"{{{SVG_NS}}}feGaussianBlur",
        {"in": "SourceGraphic", "stdDeviation": "3.5", "result": "blur"},
    )
    merge = ET.SubElement(glow, f"{{{SVG_NS}}}feMerge")
    ET.SubElement(merge, f"{{{SVG_NS}}}feMergeNode", {"in": "blur"})
    ET.SubElement(merge, f"{{{SVG_NS}}}feMergeNode", {"in": "SourceGraphic"})

    regions_out = ET.SubElement(
        svg, f"{{{SVG_NS}}}g", {"id": "dialect-regions", "class": "oracle-regions"}
    )

    group_order = ["ca-northern", "ca-nwestern", "ca-central", "ca-valencia", "ca-balear"]
    groups: dict[str, ET.Element] = {}
    for group_id in group_order:
        groups[group_id] = ET.SubElement(
            regions_out,
            f"{{{SVG_NS}}}g",
            {"id": group_id, "class": "oracle-region-group"},
        )

    count = 0
    for source_group in regions:
        if local_tag(source_group) != "g":
            continue
        group_id = source_group.get("id") or ""
        parent = groups.get(group_id, regions_out)

        for child in source_group:
            region_id = child.get("id") or ""
            if region_id.startswith("comarca-"):
                parent.append(clone_region_tree(child))
                count += 1
                continue

            if local_tag(child) == "g":
                transform = child.get("transform")
                for nested in child:
                    nested_id = nested.get("id") or ""
                    if not nested_id.startswith("comarca-"):
                        continue
                    out = clone_region_tree(nested)
                    if transform:
                        wrapper = ET.SubElement(
                            parent,
                            f"{{{SVG_NS}}}g",
                            {
                                "id": nested_id,
                                "class": "oracle-comarca",
                                "transform": transform,
                            },
                        )
                        out.attrib.pop("id", None)
                        out.attrib["class"] = "oracle-comarca-part"
                        wrapper.append(out)
                    else:
                        parent.append(out)
                    count += 1

    if count == 0:
        raise SystemExit("No comarca regions extracted for linework SVG")

    return svg


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


def write_svg(svg: ET.Element, path: Path) -> None:
    indent_xml(svg)
    content = ET.tostring(svg, encoding="unicode", short_empty_elements=False)
    content = re.sub(r"<ns\d+:", "<", content)
    content = re.sub(r"</ns\d+:", "</", content)
    content = re.sub(r'\sxmlns:ns\d+="[^"]*"', "", content)
    if not re.search(r"<svg\b[^>]*\sxmlns=", content):
        content = content.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'<?xml version="1.0" encoding="utf-8"?>\n{content}\n', encoding="utf-8")
    ET.parse(path)


def main() -> None:
    import subprocess
    import sys

    source_path = find_source()
    root = ET.parse(source_path).getroot()
    svg = build_linework_svg(root)
    write_svg(svg, OUTPUT_SVG)
    write_svg(svg, ROOT_OUTPUT_SVG)

    region_count = len(
        [el for el in svg.iter() if (el.get("id") or "").startswith("comarca-")]
    )
    print(f"Source: {source_path}")
    print(f"Linework SVG: {OUTPUT_SVG}")
    print(f"Root copy: {ROOT_OUTPUT_SVG}")
    print(f"Comarca regions: {region_count}")

    snap = ROOT / "scripts" / "snap_oracle_communities.py"
    print("Snapping communities…")
    subprocess.check_call([sys.executable, str(snap)], cwd=ROOT)


if __name__ == "__main__":
    main()
