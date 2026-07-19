import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    // Proxy keeps API same-origin under HTTPS (avoids mixed content on phone LAN).
    proxy: {
      "/analyze": "http://127.0.0.1:8000",
      "/feedback": "http://127.0.0.1:8000",
      "/research-consent": "http://127.0.0.1:8000",
      "/client-info": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "happy-dom",
  },
});
