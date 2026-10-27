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
 * Sentry release id shared with the backend: explicit release, else the full
 * git SHA, else the app version.
 */
export function releaseFromParts(version: string, gitSha: string, explicit = ""): string {
  const release = explicit.trim();
  if (release) {
    return release;
  }
  const sha = gitSha.trim();
  if (sha && sha !== "dev") {
    return sha;
  }
  return version.trim() || "0.1.0";
}

export function sentryRelease(): string {
  return releaseFromParts(buildInfo.version, buildInfo.gitSha, envTrim("VITE_SENTRY_RELEASE"));
}
