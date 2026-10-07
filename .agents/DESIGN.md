# Design

User-facing copy is Catalan. The product shows how speech sounds relative to five macro-dialect areas. The map is an illustrative affinity, never a claim about origin or identity.

## Copy

Keep strings in Catalan unless the task is an explicit translation. Results, the map callout, feedback, and the privacy text describe acoustic similarity (`similitud acústica`). The focus pin is an illustrative comarca affinity. A comarca reaches the server only when the user declares one.

Legal text lives in `web/src/lib/legalDocs.ts`. Match that framing in any new results or consent copy.

## Map

The results stage is linework with a macro-region highlight and a score-weighted focus pin (`ResultsMapStage`, `DialectMap`). The ranking sidebar shows the model scores. The map frames that distribution.

Leave the heatmap, linework, palette, and pin behavior alone unless the task asks for a visual change. Tokens live in `web/src/index.css` (accent `#257cac`, warm paper background, map-stage variables). Use those tokens. A second palette or a different map metaphor is out of scope.

Generated geometry (`web/public/map-oracle-linework.svg`, `web/src/lib/comarcaMapMeta.ts`) is rebuilt with `scripts/build_comarca_map.py`. Do not hand-edit those outputs.
