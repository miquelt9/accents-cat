import posthog from "posthog-js";

let initialized = false;

function posthogKey(): string {
  return (import.meta.env.VITE_POSTHOG_KEY as string | undefined)?.trim() || "";
}

function posthogHost(): string {
  return (
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.trim() ||
    "https://eu.i.posthog.com"
  );
}

/** Init when project key is set. Cookieless, no autocapture, no session replay. */
export function initPostHog(): boolean {
  const key = posthogKey();
  if (!key || initialized) {
    return initialized;
  }

  posthog.init(key, {
    api_host: posthogHost(),
    persistence: "memory",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    ip: false,
    person_profiles: "identified_only",
    // Never attach URL query strings (could leak ids).
    sanitize_properties: (props) => {
      if (props.$current_url && typeof props.$current_url === "string") {
        props.$current_url = props.$current_url.split("?")[0];
      }
      return props;
    },
  });

  initialized = true;
  return true;
}

export function shouldInitPostHog(): boolean {
  return Boolean(posthogKey());
}

/**
 * Capture an allowlisted UI event name only — no properties.
 * Never pass recording IDs, comarca, consent payloads, audio, or scores.
 */
export function capturePostHogEvent(event: string): void {
  if (!initialized && !initPostHog()) {
    return;
  }
  try {
    posthog.capture(event);
  } catch {
    // Analytics must not affect UX.
  }
}
