/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACCENT_ORACLE_MODE?: string;
  readonly VITE_ACCENT_ORACLE_API_URL?: string;
  readonly VITE_ACCENT_ORACLE_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
