# Task 07 — Pending-consent and research-retention purge scheduling

Status: `pending`  
Priority: high  
When: before accepting production recordings, and whenever TTL/retention
settings, service ownership, or the scheduler changes

## Goal

Turn the repository’s purge functions into reliable operator-scheduled jobs.
Pending audio must not wait for a later request, and research-consented rows
must be purged at the approved retention boundary.

## Why this is still missing

`backend.storage.purge_expired_pending()` is invoked by storage activity, not
by an independent worker. An idle service can therefore retain expired
pending audio beyond its nominal TTL. The research-retention CLI exists, but
the repository does not install or monitor a scheduler for it.

## Prerequisites

- A data/privacy owner and a host/service owner
- The production repository checkout, service account, and virtualenv Python
- The actual `data/user_submissions/` location used by uvicorn
- Approved values for `ORACLE_PENDING_CONSENT_TTL_SECONDS` and
  `ORACLE_RESEARCH_RETENTION_YEARS`
- A scheduler (systemd timer, cron, or equivalent), a non-overlap lock, and a
  failure-alert route
- Coordination with backup/restore maintenance so purge and snapshot jobs do
  not race

## Read first

- [`docs/PRODUCTION_CHECKLIST.md`](../../docs/PRODUCTION_CHECKLIST.md),
  sections 7–9
- [`docs/PRODUCTION_READINESS.md`](../../docs/PRODUCTION_READINESS.md),
  “Data protection and operations”
- [`docs/PRIVACY_AUDIT.md`](../../docs/PRIVACY_AUDIT.md), “Storage and consent”
  and the pre-launch checklist
- [`docs/BACKUP.md`](../../docs/BACKUP.md), especially retention/deletion and
  the purge commands
- [`README.md`](../../README.md), pending/consent and production sections
- [`AGENTS.md`](../../AGENTS.md), `/analyze` storage, consent, and deletion
  rules
- [`backend/storage.py`](../../backend/storage.py), `purge_expired_pending`,
  `purge_expired_research_consent`, and soft-delete behavior
- [`scripts/purge_expired_research.py`](../../scripts/purge_expired_research.py)
- [`scripts/soft_delete_submission.py`](../../scripts/soft_delete_submission.py)

## Runbook

1. Confirm and record the deployed TTL and research-retention values. The
   pending TTL is bounded to at least 60 seconds by the storage module; the
   default is 1,800 seconds. Research retention defaults to three years and
   uses `consent_at`, falling back to `created_at`.
2. Install a scheduler command under the service’s approved virtualenv and
   run it from the repository root so it imports the same configuration and
   writes the same database. The pending purge has no standalone CLI; its
   operation can be invoked explicitly with:

   ```bash
   cd <REPO_ROOT>
   <VENV_PYTHON> -c \
     'from backend import storage; print(f"Purged {storage.purge_expired_pending()} pending submission(s).")'
   ```

   Schedule it frequently enough that the observed pending lifetime meets the
   privacy policy, rather than relying on new API traffic.
3. Schedule the research-retention command at the approved cadence:

   ```bash
   cd <REPO_ROOT>
   <VENV_PYTHON> scripts/purge_expired_research.py --dry-run
   <VENV_PYTHON> scripts/purge_expired_research.py
   ```

   Run `--dry-run` as a preflight; schedule only the second command for the
   recurring purge.
   Use a production scheduler’s environment file for the same
   `ORACLE_RESEARCH_RETENTION_YEARS` value as uvicorn. Use `flock` or an
   equivalent lock around each job, and coordinate the lock/maintenance
   window with the backup job.
4. Before enabling deletion, run the pending and research commands in
   `--dry-run`/staging mode where available. Record the database path, cutoff,
   count, command exit status, and scheduler identity. Never use a real
   participant’s recording to create a test fixture.
5. Verify the pending path with synthetic staging data: create a pending
   submission, let or set its `pending_expires_at` past the configured
   boundary, run the scheduled command while the API is idle, and confirm the
   audio file is removed, the submission is tombstoned/scrubbed, and linked
   feedback follows the documented pending-cleanup unlinking behavior.
6. Verify research retention with a synthetic consented row past the cutoff.
   Run the dry run, execute the purge, and confirm full soft-delete behavior.
   Confirm a current consented row is not selected. Record the output and
   row/audio checks.
7. Alert on a failed command, a missed schedule, an unexpectedly growing
   pending count, or a purge result inconsistent with the expected fixture.
   Review job logs for absence of audio, filenames, prompt text, comarca,
   consent payloads, recording IDs, and user identifiers.
8. Add the owner, cadence, measured execution time, last-success evidence,
   and escalation procedure to the deployment record. Re-run after any
   retention-policy or backup change.

## Privacy constraints

- Pending audio is personal data before research consent. The TTL is a
  deletion boundary, not merely a UX hint.
- Research purge must select only
  `research_consent=1 AND deleted_at IS NULL` rows at the configured cutoff.
- Preserve the documented distinction: pending decline/TTL cleanup keeps
  calibration feedback while unlinking it; operator/research soft-delete
  clears linked feedback fields.
- Keep purge logs operational and aggregate. Do not print database rows,
  audio paths, prompt text, comarca, recording IDs, or request data.
- Coordinate with encrypted-backup retention: live deletion does not erase
  older archives. Follow [`06-encrypted-backup-restore-drill.md`](06-encrypted-backup-restore-drill.md)
  for archive expiry.

## Acceptance criteria

- [ ] Pending purge runs on a schedule even when the API receives no traffic.
- [ ] Research-retention purge runs on a documented schedule with the same
      retention environment as the service.
- [ ] Jobs cannot overlap with themselves or an incompatible backup window.
- [ ] Failure, missed-run, and anomalous-count alerts have an owner.
- [ ] Synthetic pending and consented fixtures prove the intended audio,
      tombstone, feedback, and cutoff behavior.
- [ ] Dry-run/live output, owner, cadence, and last-success evidence are
      recorded without sensitive values.

## Out of scope

- Adding an application background worker or authenticated deletion API
- Changing the approved retention period or legal basis
- Implementing encrypted backups:
  [`06-encrypted-backup-restore-drill.md`](06-encrypted-backup-restore-drill.md)
