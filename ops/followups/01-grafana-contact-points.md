# Task 01 — Grafana alert contact points (email only)

Status: `pending`  
Priority: medium  
Depends on: live Grafana Cloud stack (already used); alert rules already exist in folder `Accent Oracle`

## Goal

Ensure the three Accent Oracle alert rules can notify via **email only**. No SMS, voice, push, OnCall paging, or Slack unless the human explicitly asks later.

## Context (already done)

- Dashboard: [Accent Oracle — Operations](https://bigdahlia593.grafana.net/d/accent-oracle-operations) (`uid: accent-oracle-operations`)
- Folder UID: `ffudveos2n94wb`
- Alert group: `accent-oracle`
  - Backend error rate spike
  - Inference latency spike
  - Application unavailable
- In-repo notes: [`ops/grafana/README.md`](../grafana/README.md)
- Rules were created **without** notification settings (by design in v1)

## Prerequisites

- Grafana Cloud access (MCP `user-grafana` or UI)
- A destination email the human confirms (do not guess personal addresses from git config unless they provide it)
- Confirm whether a Grafana contact point / email integration already exists

## Agent plan

1. List existing Grafana contact points / notification policies (`alerting_manage_routing` or UI-equivalent).
2. If no email contact point exists, create one named e.g. `accent-oracle-email` with the address the human provides.
3. Attach a notification policy (or rule `notification_settings.receiver`) so the three `accent-oracle` rules route to that email contact point only.
4. Document the contact point name + policy in [`ops/grafana/README.md`](../grafana/README.md).
5. Do **not** enable SMS, phone, Slack, PagerDuty, or Grafana OnCall for these rules.
6. Optional smoke: pause-safe test notification if Grafana supports it without firing production noise; otherwise note manual “Send test” in UI.

## Acceptance criteria

- [ ] Email contact point exists and is documented
- [ ] All three Accent Oracle alerts route to that email receiver
- [ ] No SMS / call / push / OnCall integrations added for these alerts
- [ ] `ops/grafana/README.md` updated

## Constraints

- No secrets in git
- Minimal change: routing only, do not redesign alert thresholds unless broken
- Prefer Grafana MCP tools over raw API when available

## Out of scope

- Changing PromQL thresholds
- Better Stack (see task 02)
- Sentry alert rules
