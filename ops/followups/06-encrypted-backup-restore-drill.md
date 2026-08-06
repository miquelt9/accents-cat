# Task 06 — Encrypted submission backup, scheduling, and restore drill

Status: `pending`  
Priority: high  
When: before accepting production recordings, after changing storage or
hosting, and at the cadence chosen by the service owner for restore drills

## Goal

Install an operator-owned backup job for SQLite plus audio, encrypt every
off-host copy, and prove that an isolated restore preserves consent state and
audio integrity.

## Prerequisites

- A production service owner and a documented maintenance/stop procedure
- The actual `data/user_submissions/` path and service account
- An approved encryption method and recoverable key held outside the backup host
- An off-host destination, retention policy, and failure-notification route
- An isolated restore host or directory that cannot overwrite production
- `age`, `rsync`, `tar`, `sha256sum`, `flock`, and SQLite verification support,
  or approved equivalents

Do not put recipients, identities, tokens, backup archives, or decryption keys
in this repository.

## Read first

- [`docs/BACKUP.md`](../../docs/BACKUP.md), in full
- [`docs/PRODUCTION_CHECKLIST.md`](../../docs/PRODUCTION_CHECKLIST.md),
  sections 7–9
- [`docs/PRODUCTION_READINESS.md`](../../docs/PRODUCTION_READINESS.md),
  “Data protection and operations”
- [`docs/PRIVACY_AUDIT.md`](../../docs/PRIVACY_AUDIT.md), “Storage and consent”
  and the pre-launch checklist
- [`README.md`](../../README.md), “Production Deployment” and storage notes
- [`AGENTS.md`](../../AGENTS.md), submission retention and deletion rules
- [`backend/storage.py`](../../backend/storage.py), database/audio layout and
  deletion behavior
- [`scripts/purge_expired_research.py`](../../scripts/purge_expired_research.py)
  and [`scripts/soft_delete_submission.py`](../../scripts/soft_delete_submission.py)

## Runbook

1. Install a root-owned backup command on the deployment host by adapting the
   offline snapshot procedure in [`docs/BACKUP.md`](../../docs/BACKUP.md).
   Use a `0700` staging directory and `umask 077`. Quiesce writes by stopping
   or maintenance-draining uvicorn, then copy `oracle.db`, any matching
   `oracle.db-wal` and `oracle.db-shm`, and the complete `audio/` directory as
   one snapshot.
2. Generate a sorted SHA-256 manifest before archiving. Encrypt the archive
   before it leaves the host with the approved organization-controlled key.
   Keep plaintext staging material on the same encrypted host only long enough
   to create and verify the archive; remove it in a failure-safe trap.
3. Add `flock` so backup runs cannot overlap. Schedule the job with the
   deployment’s approved scheduler. An hourly example is in
   [`docs/BACKUP.md`](../../docs/BACKUP.md), but record the actual frequency
   and do not claim its example RPO/RTO until measured.
4. Transfer the encrypted archive to the approved off-host destination over
   encrypted transport. Restrict backup and restore access to the smallest
   operator group. Alert on non-zero exit, missing archive, failed encryption,
   checksum mismatch, or stale last-success time.
5. Define archive expiry and deletion handling. A live soft-delete does not
   erase older encrypted copies; record how the operator identifies affected
   generations and expires them under the approved privacy policy.
6. Perform a restore drill in isolation:
   - preserve the current restore target rather than overwriting it;
   - decrypt and verify the archive and manifest;
   - restore the database and matching audio snapshot together;
   - run `PRAGMA integrity_check` and `PRAGMA foreign_key_check`;
   - verify every non-empty `submissions.audio_path` resolves to an audio file,
     and compare representative audio hashes with the manifest;
   - start the API with the restored model and storage, then check `/live`,
     `/ready`, `/version`, and `/health`;
   - use only synthetic data for any analyze/consent/decline smoke test.
7. Record the snapshot identifier, backup duration, restore duration, checks,
   failures, measured RPO/RTO, key-recovery result, and follow-up owner in the
   deployment record. Review the drill at the cadence set by the owner.

## Privacy constraints

- SQLite and audio are one personal-data dataset; never back up audio without
  the matching consent/deletion state.
- Encrypt before off-host transfer and keep decryption keys separate from
  archives. Do not send backup contents to analytics, Sentry, Grafana, or
  Better Stack.
- Restrict filesystem, archive, restore-host, and log access. Backup logs may
  contain job status and snapshot IDs, but not audio, database rows,
  filenames, recording IDs, or key material.
- A restore can reintroduce rows deleted after the snapshot. Review deletion
  requests and retention purges before restoring an old archive.
- Training exports must still filter
  `research_consent=1 AND deleted_at IS NULL`.

## Acceptance criteria

- [ ] A serialized, non-overlapping backup job captures the database, any
      SQLite sidecars, and all audio together.
- [ ] Archives are encrypted before leaving the host; key recovery has been
      tested separately and no secret is committed.
- [ ] Off-host retention, access control, deletion-aware expiry, and failure
      alerting are documented and active.
- [ ] An isolated restore passes SQLite integrity/foreign-key checks and audio
      hash/path verification.
- [ ] Restored `/live`, `/ready`, `/version`, and `/health` checks pass.
- [ ] Actual schedule, measured restore time, and evidence are recorded; no
      unmeasured RPO/RTO is presented as a guarantee.

## Out of scope

- Implementing an application backup API or background worker
- Changing the live retention policy: [`07-retention-purge-scheduling.md`](07-retention-purge-scheduling.md)
- Hosting-provider-specific infrastructure not selected by the operator
