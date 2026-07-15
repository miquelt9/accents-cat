export interface ParsedComarcaPath {
  id: string;
  slug: string;
  transform?: string;
  parts: Array<{ d: string }>;
}

export interface ParsedOracleMap {
  viewBox: string;
  comarques: ParsedComarcaPath[];
}

const MAP_URL = `${import.meta.env.BASE_URL}map-oracle-linework.svg`;

function localName(el: Element): string {
  return el.localName || el.tagName.replace(/^.*:/, "");
}

function collectParts(el: Element): Array<{ d: string }> {
  const parts: Array<{ d: string }> = [];
  const tag = localName(el);
  if (tag === "path") {
    const d = el.getAttribute("d");
    if (d) {
      parts.push({ d });
    }
    return parts;
  }
  if (tag === "polygon") {
    const points = el.getAttribute("points");
    if (points) {
      const nums = points.trim().split(/[\s,]+/).map(Number);
      if (nums.length >= 4) {
        let d = `M ${nums[0]} ${nums[1]}`;
        for (let i = 2; i < nums.length; i += 2) {
          d += ` L ${nums[i]} ${nums[i + 1]}`;
        }
        d += " Z";
        parts.push({ d });
      }
    }
    return parts;
  }
  for (const child of Array.from(el.children)) {
    parts.push(...collectParts(child));
  }
  return parts;
}

export function parseOracleMapSvg(svgText: string): ParsedOracleMap {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;
  const viewBox = svg.getAttribute("viewBox") ?? "170 100 1000 1000";
  const regions = doc.getElementById("dialect-regions");
  const comarques: ParsedComarcaPath[] = [];

  if (!regions) {
    return { viewBox, comarques };
  }

  const walk = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      const id = child.getAttribute("id") ?? "";
      if (id.startsWith("comarca-")) {
        const slug = id.slice("comarca-".length);
        const transform = child.getAttribute("transform") ?? undefined;
        const parts = collectParts(child);
        if (parts.length > 0) {
          comarques.push({ id, slug, transform, parts });
        }
        continue;
      }
      if (localName(child) === "g") {
        walk(child);
      }
    }
  };

  walk(regions);
  return { viewBox, comarques };
}

export async function loadOracleMap(): Promise<ParsedOracleMap> {
  const response = await fetch(MAP_URL);
  if (!response.ok) {
    throw new Error(`No s'ha pogut carregar el mapa (${response.status})`);
  }
  const text = await response.text();
  return parseOracleMapSvg(text);
}
