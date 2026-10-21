import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { sentrySourcemapUpload } from "./src/lib/sentryBuild";

export default defineConfig(({ command }) => {
  const upload = command === "build" ? sentrySourcemapUpload(process.env) : null;
  if (command === "build" && process.env.SENTRY_AUTH_TOKEN?.trim() && !upload) {
    console.warn(
      "Sentry source map upload skipped: set SENTRY_ORG and SENTRY_PROJECT with SENTRY_AUTH_TOKEN.",
    );
  }
  const sentryPlugins = upload
    ? sentryVitePlugin({
        authToken: upload.authToken,
        org: upload.org,
        project: upload.project,
        telemetry: false,
        release: { name: upload.release },
        sourcemaps: {
          assets: "./dist/**",
          filesToDeleteAfterUpload: ["./dist/**/*.map"],
        },
      })
    : [];

  return {
    plugins: [react(), basicSsl(), ...sentryPlugins],
    build: {
      // Hidden maps are generated for Sentry and are not referenced from the bundles.
      sourcemap: "hidden",
    },
    server: {
      // Proxy keeps API same-origin under HTTPS (avoids mixed content on phone LAN).
      proxy: {
        "/analyze": "http://127.0.0.1:8000",
        "/analysis-finalize": "http://127.0.0.1:8000",
        "/feedback": "http://127.0.0.1:8000",
        "/research-consent": "http://127.0.0.1:8000",
        "/health": "http://127.0.0.1:8000",
        "/live": "http://127.0.0.1:8000",
        "/ready": "http://127.0.0.1:8000",
        "/version": "http://127.0.0.1:8000",
        "/telemetry": "http://127.0.0.1:8000",
        "/sentry-debug": "http://127.0.0.1:8000",
      },
    },
    test: {
      environment: "happy-dom",
    },
  };
});
