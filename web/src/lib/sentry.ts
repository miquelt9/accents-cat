import * as Sentry from "@sentry/react";
import { sentryRelease } from "./buildInfo";
import { resolveAccentOracleMode } from "./devFlags";

const APP_VERSION = sentryRelease();

function truthy(value: unknown): boolean {
  return value === "1" || value === "true" || value === true;
}

function sentryEnvironment(): string {
  const env = (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined)?.trim();
  return env || "development";
}

/** Init when DSN is set and not blocked for local development. */
export function shouldInitSentry(): boolean {
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
  if (!dsn) {
    return false;
  }
  const env = sentryEnvironment();
  if (env === "development" && !truthy(import.meta.env.VITE_SENTRY_ENABLE_DEV)) {
    return false;
  }
  return true;
}

const SENSITIVE_KEY =
  /(recording|consent|comarca|audio|prompt|transcript|filename|notes|score|ip_address|user_agent|email|phone)/i;

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.url && event.request.url.includes("?")) {
      event.request.url = event.request.url.split("?")[0];
    }
    if (event.request.query_string) {
      event.request.query_string = "";
    }
  }

  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      if (SENSITIVE_KEY.test(key)) {
        event.extra[key] = "[Filtered]";
      }
    }
  }

  if (event.tags) {
    for (const key of Object.keys(event.tags)) {
      if (SENSITIVE_KEY.test(key) && key !== "prompt_id") {
        delete event.tags[key];
      }
    }
  }

  delete event.user;
  return event;
}

/** Call as early as possible (before React render). */
export function initSentry(): boolean {
  if (!shouldInitSentry()) {
    return false;
  }

  const dsn = (import.meta.env.VITE_SENTRY_DSN as string).trim();

  Sentry.init({
    dsn,
    environment: sentryEnvironment(),
    release: APP_VERSION,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    beforeSend(event) {
      return scrubEvent(event);
    },
  });

  Sentry.setTag("app", "accent-oracle");
  Sentry.setTag("app_version", APP_VERSION);
  Sentry.setTag("api_mode", resolveAccentOracleMode());

  return true;
}

export { Sentry };
