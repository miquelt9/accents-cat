/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACCENT_ORACLE_MODE?: string;
  readonly VITE_ACCENT_ORACLE_API_URL?: string;
  readonly VITE_ACCENT_ORACLE_DEV?: string;
  /** Real inbox for privacy / deletion requests (required before public launch). */
  readonly VITE_PRIVACY_EMAIL?: string;
  /** Natural-person controller name shown in the privacy policy. */
  readonly VITE_CONTROLLER_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
