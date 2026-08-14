import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppErrorFallback } from "./components/AppErrorFallback";
import { initPostHog } from "./lib/posthog";
import { initSentry, Sentry } from "./lib/sentry";
import App from "./App";
import "./index.css";

initSentry();
initPostHog();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={AppErrorFallback}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
