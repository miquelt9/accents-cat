# Task 03 — Sentry releases + web source maps

Status: `pending`  
Priority: medium (launch polish)  
Depends on: Sentry projects + DSNs already configured in deploy env

## Goal

Make production Sentry events actionable:

1. Consistent **release** strings on frontend and backend
2. Upload **Vite source maps** for the React app so stack traces resolve to TypeScript source

## Context (already done)

- Backend: `SENTRY_RELEASE` / `ORACLE_APP_VERSION` via [`backend/observability.py`](../../backend/observability.py)
- Frontend: `VITE_SENTRY_RELEASE` via [`web/src/lib/sentry.ts`](../../web/src/lib/sentry.ts)
- Privacy scrubbers and error-only Session Replay already enabled
- Sentry org used earlier: `acme-inc-fa` (DE) — confirm current project slugs before changing anything

## Prerequisites

- Sentry auth token with `project:releases` (or equivalent) — store only in CI secrets / local gitignored env, never commit
- Confirm FE and BE Sentry project slugs (create React project if still missing)
- Decide release scheme: prefer git SHA (`abc1234`) or semver from `web/package.json` (`0.1.0+abc1234`)

## Agent plan

1. Document the chosen release scheme in README Observability (one paragraph).
2. Backend deploy: ensure process env sets `SENTRY_RELEASE` (or `ORACLE_APP_VERSION`) to the same release id as the web build.
3. Frontend build:
   - Enable Vite source maps for production **only if** maps are uploaded to Sentry and **not** publicly served (delete from `dist/` after upload, or use hidden source maps + upload plugin).
   - Prefer official `@sentry/vite-plugin` (or `sentry-cli` releases) over custom scripts.
4. Wire CI or a small `scripts/sentry_release.sh` that:
   - creates/finishes a Sentry release
   - uploads maps for `web/dist`
   - associates commits if trivial
5. Keep `sendDefaultPii: false` and existing `beforeSend` scrubbers untouched.
6. Verify with a deliberate production-like error: stack frames show original `.tsx` paths in Sentry.

## Acceptance criteria

- [ ] FE and BE events share the same `release` value for a given deploy
- [ ] Web error stacks resolve to source (not only minified bundles)
- [ ] Source maps are not anonymously downloadable from the public site
- [ ] Auth tokens only in secrets; README documents the flow without secrets
- [ ] Privacy scrubbers still pass unit tests

## Constraints

- Official Sentry tooling only
- Minimal deps; no analytics expansion
- Do not raise `tracesSampleRate` above 0.10 without an explicit ask
- Never upload audio, bodies, or recording IDs (already scrubbed — do not regress)

## Out of scope

- Continuous profiling
- Changing Session Replay sample rates
- Mobile native Sentry
