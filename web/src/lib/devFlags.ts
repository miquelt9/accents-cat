/** Build-time and runtime switches for diagnostic UI (not for end users). */

export const DEV_TOOLS_STORAGE_KEY = "accent-oracle-dev";
export const MODE_OVERRIDE_STORAGE_KEY = "accent-oracle-mode-override";

export type AccentOracleMode = "api" | "mock-fail" | "mock-success";

const MODE_CYCLE: AccentOracleMode[] = ["api", "mock-fail", "mock-success"];

function readStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function parseMode(value: string | null): AccentOracleMode | null {
  if (value === "api" || value === "mock-fail" || value === "mock-success") {
    return value;
  }
  // Legacy override from the two-way mock/API toggle.
  if (value === "mock") {
    return "mock-fail";
  }
  return null;
}

/** Apply `?dev=1` / `?dev=0` to localStorage, then strip the query param. */
export function syncDevFlagFromUrl(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (!url.searchParams.has("dev")) {
    return;
  }

  const value = url.searchParams.get("dev");
  if (value === "1" || value === "true") {
    writeStorage(DEV_TOOLS_STORAGE_KEY, "1");
  } else if (value === "0" || value === "false") {
    writeStorage(DEV_TOOLS_STORAGE_KEY, null);
  }

  url.searchParams.delete("dev");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

export function isDevToolsEnabled(): boolean {
  const envFlag = import.meta.env.VITE_ACCENT_ORACLE_DEV;
  if (envFlag === "1" || envFlag === "true") {
    return true;
  }

  return readStorage(DEV_TOOLS_STORAGE_KEY) === "1";
}

export function getEnvAccentOracleMode(): AccentOracleMode {
  return import.meta.env.VITE_ACCENT_ORACLE_MODE === "api" ? "api" : "mock-fail";
}

export function getModeOverride(): AccentOracleMode | null {
  return parseMode(readStorage(MODE_OVERRIDE_STORAGE_KEY));
}

export function setModeOverride(mode: AccentOracleMode): void {
  writeStorage(MODE_OVERRIDE_STORAGE_KEY, mode);
}

export function resolveAccentOracleMode(): AccentOracleMode {
  if (isDevToolsEnabled()) {
    const override = getModeOverride();
    if (override) {
      return override;
    }
  }

  return getEnvAccentOracleMode();
}

export function isMockMode(mode: AccentOracleMode): boolean {
  return mode === "mock-fail" || mode === "mock-success";
}

export function isApiMode(mode: AccentOracleMode): boolean {
  return mode === "api";
}

export function cycleAccentOracleMode(current: AccentOracleMode): AccentOracleMode {
  const index = MODE_CYCLE.indexOf(current);
  return MODE_CYCLE[(index + 1) % MODE_CYCLE.length];
}

export function accentOracleModeLabel(mode: AccentOracleMode): string {
  if (mode === "api") {
    return "API";
  }
  if (mode === "mock-fail") {
    return "mock fail";
  }
  return "mock success";
}
