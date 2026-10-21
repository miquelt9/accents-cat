/** Decide whether a production build uploads hidden source maps to Sentry. */

export type SentrySourcemapUpload = {
  authToken: string;
  org: string;
  project: string;
  release: string | undefined;
};

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Upload only when the auth token, org, and project are all set.
 * A missing token skips the plugin. A token without org/project also skips
 * so the Pages build still succeeds; the workflow logs that skip.
 */
export function sentrySourcemapUpload(
  env: Record<string, string | undefined>,
): SentrySourcemapUpload | null {
  const authToken = trim(env.SENTRY_AUTH_TOKEN);
  if (!authToken) {
    return null;
  }
  const org = trim(env.SENTRY_ORG);
  const project = trim(env.SENTRY_PROJECT);
  if (!org || !project) {
    return null;
  }
  const explicit = trim(env.VITE_SENTRY_RELEASE) || trim(env.SENTRY_RELEASE);
  const sha = trim(env.VITE_GIT_SHA);
  const release = explicit || (sha && sha !== "dev" ? sha : undefined);
  return { authToken, org, project, release };
}
