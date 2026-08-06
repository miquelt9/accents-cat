/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACCENT_ORACLE_MODE?: string;
  readonly VITE_ACCENT_ORACLE_API_URL?: string;
  readonly VITE_ACCENT_ORACLE_DEV?: string;
  /** Real inbox for privacy / deletion requests (required before public launch). */
  readonly VITE_PRIVACY_EMAIL?: string;
  /** Natural-person controller name shown in the privacy policy. */
  readonly VITE_CONTROLLER_NAME?: string;
  /** Public site URL for share-card promo footer (defaults to window.location.host). */
  readonly VITE_PUBLIC_SITE_URL?: string;
  /** Semver / app version for Sentry release and /version alignment. */
  readonly VITE_APP_VERSION?: string;
  /** Git commit SHA injected at build time. */
  readonly VITE_GIT_SHA?: string;
  /** ISO build timestamp injected at build time. */
  readonly VITE_BUILD_TIME?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_RELEASE?: string;
  readonly VITE_SENTRY_ENABLE_DEV?: string;
  /** PostHog Cloud EU project key (omit to disable). */
  readonly VITE_POSTHOG_KEY?: string;
  /** Default https://eu.i.posthog.com */
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
