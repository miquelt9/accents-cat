/** Build metadata injected at Vite build time (CI / deploy). */

function envTrim(key: "VITE_APP_VERSION" | "VITE_GIT_SHA" | "VITE_BUILD_TIME" | "VITE_SENTRY_RELEASE"): string {
  return (import.meta.env[key] as string | undefined)?.trim() || "";
}

export const buildInfo = {
  version: envTrim("VITE_APP_VERSION") || "0.1.0",
  gitSha: envTrim("VITE_GIT_SHA") || "dev",
  builtAt: envTrim("VITE_BUILD_TIME"),
} as const;

/**
 * Sentry release id: prefer explicit `VITE_SENTRY_RELEASE`, else
 * `version+shortSha` when a real SHA is present, else version alone.
 */
export function sentryRelease(): string {
  const explicit = envTrim("VITE_SENTRY_RELEASE");
  if (explicit) {
    return explicit;
  }
  const { version, gitSha } = buildInfo;
  if (gitSha && gitSha !== "dev") {
    return `${version}+${gitSha.slice(0, 7)}`;
  }
  return version;
}
