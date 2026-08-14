import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { comarcaNameMatchesQuery } from "../lib/comarcaDisplay";
import {
  COMARCA_MAP_META,
  COMARCA_REGION_LABELS,
  COMARCA_REGION_ORDER,
  type ComarcaMapEntry,
} from "../lib/comarcaMapMeta";

const MAX_COMARQUES = 12;

export interface ComarcaPickerProps {
  disabled?: boolean;
  selectedSlugs: string[];
  onChange: (slugs: string[]) => void;
}

function groupByRegion(entries: ComarcaMapEntry[]): { region: string; items: ComarcaMapEntry[] }[] {
  const byRegion = new Map<string, ComarcaMapEntry[]>();
  for (const entry of entries) {
    const bucket = byRegion.get(entry.region);
    if (bucket) {
      bucket.push(entry);
    } else {
      byRegion.set(entry.region, [entry]);
    }
  }

  const groups: { region: string; items: ComarcaMapEntry[] }[] = [];
  for (const region of COMARCA_REGION_ORDER) {
    const items = byRegion.get(region);
    if (!items?.length) {
      continue;
    }
    groups.push({
      region,
      items: [...items].sort((a, b) => a.name.localeCompare(b.name, "ca")),
    });
  }

  for (const [region, items] of byRegion) {
    if (COMARCA_REGION_ORDER.includes(region)) {
      continue;
    }
    groups.push({
      region,
      items: [...items].sort((a, b) => a.name.localeCompare(b.name, "ca")),
    });
  }

  return groups;
}

export function ComarcaPicker({
  disabled = false,
  selectedSlugs,
  onChange,
}: ComarcaPickerProps) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedSet = useMemo(() => new Set(selectedSlugs), [selectedSlugs]);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return COMARCA_MAP_META;
    }
    return COMARCA_MAP_META.filter((entry) =>
      comarcaNameMatchesQuery(entry.name, query, entry.slug),
    );
  }, [query]);

  const groups = useMemo(() => groupByRegion(filtered), [filtered]);
  const flatOptions = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const safeActiveIndex =
    flatOptions.length === 0 ? -1 : Math.min(activeIndex, flatOptions.length - 1);

  useEffect(() => {
    if (safeActiveIndex < 0) {
      return;
    }
    document
      .getElementById(`${baseId}-option-${safeActiveIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [baseId, safeActiveIndex]);

  function toggleComarca(slug: string) {
    if (selectedSet.has(slug)) {
      onChange(selectedSlugs.filter((item) => item !== slug));
      return;
    }
    if (selectedSlugs.length >= MAX_COMARQUES) {
      return;
    }
    onChange([...selectedSlugs, slug]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (flatOptions.length === 0) {
        return;
      }
      setActiveIndex((current) => {
        const next = current < 0 ? 0 : Math.min(current + 1, flatOptions.length - 1);
        return next;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (flatOptions.length === 0) {
        return;
      }
      setActiveIndex((current) => {
        if (current <= 0) {
          return 0;
        }
        return current - 1;
      });
      return;
    }

    // Enter toggles the highlighted option; Space types into the query
    // (many comarca names include spaces, e.g. «Baix Llobregat»).
    if (event.key === "Enter") {
      event.preventDefault();
      if (safeActiveIndex < 0) {
        return;
      }
      const entry = flatOptions[safeActiveIndex];
      if (entry) {
        toggleComarca(entry.slug);
      }
      return;
    }

    if (event.key === "Escape") {
      if (query) {
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
        setActiveIndex(0);
      }
    }
  }

  const optionIndexBySlug = useMemo(() => {
    const map = new Map<string, number>();
    flatOptions.forEach((entry, index) => {
      map.set(entry.slug, index);
    });
    return map;
  }, [flatOptions]);

  const selectedLabels = useMemo(() => {
    return selectedSlugs
      .map((slug) => COMARCA_MAP_META.find((entry) => entry.slug === slug)?.name ?? slug)
      .filter(Boolean);
  }, [selectedSlugs]);

  return (
    <div className="comarca-picker">
      <label className="comarca-picker-label" htmlFor={`${baseId}-input`}>
        Cerca i marca una o més comarques
      </label>
      <input
        id={`${baseId}-input`}
        className="comarca-picker-input"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded="true"
        aria-activedescendant={
          safeActiveIndex >= 0 ? `${baseId}-option-${safeActiveIndex}` : undefined
        }
        autoComplete="off"
        disabled={disabled}
        placeholder="Escriu el nom…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />

      {selectedLabels.length > 0 && (
        <p className="comarca-picker-selected" aria-live="polite">
          Seleccionades: {selectedLabels.join(", ")}
        </p>
      )}
      {selectedSlugs.length >= MAX_COMARQUES && (
        <p className="comarca-picker-cap" role="status">
          Màxim 12 comarques
        </p>
      )}

      <div
        id={listboxId}
        className="comarca-picker-list"
        role="listbox"
        aria-label="Comarques"
        aria-multiselectable="true"
      >
        {groups.length === 0 ? (
          <p className="comarca-picker-empty" role="status" aria-live="polite">
            Cap comarca coincideix amb la cerca.
          </p>
        ) : (
          groups.map((group) => {
            const regionLabel = COMARCA_REGION_LABELS[group.region] ?? group.region;
            return (
              <div key={group.region} className="comarca-picker-group">
                <p className="comarca-picker-group-label" id={`${baseId}-region-${group.region}`}>
                  {regionLabel}
                </p>
                <ul
                  className="comarca-picker-group-list"
                  role="group"
                  aria-labelledby={`${baseId}-region-${group.region}`}
                >
                  {group.items.map((entry) => {
                    const index = optionIndexBySlug.get(entry.slug) ?? -1;
                    const isActive = index === safeActiveIndex;
                    const isSelected = selectedSet.has(entry.slug);
                    const atCap = !isSelected && selectedSlugs.length >= MAX_COMARQUES;
                    return (
                      <li key={entry.slug} role="presentation">
                        <button
                          id={`${baseId}-option-${index}`}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`comarca-picker-option${isActive ? " is-active" : ""}${
                            isSelected ? " is-checked" : ""
                          }`}
                          disabled={disabled || atCap}
                          onMouseEnter={() => {
                            if (index >= 0) {
                              setActiveIndex(index);
                            }
                          }}
                          onClick={() => toggleComarca(entry.slug)}
                        >
                          <span className="comarca-picker-check" aria-hidden="true">
                            {isSelected ? "✓" : ""}
                          </span>
                          <span>{entry.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
