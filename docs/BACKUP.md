# Backup and restore runbook

This runbook covers the local submission store used by the Accent Oracle API. It
documents an operational procedure; it does not implement cloud backup,
replication, or scheduling in the application.

## What must be backed up

The source data directory is:

```text
data/user_submissions/
├── oracle.db
├── oracle.db-wal       # may exist while SQLite is using WAL
├── oracle.db-shm       # may exist while SQLite is using WAL
└── audio/
    └── <take-uuid>.<suffix>
```

Back up the SQLite database and the complete `audio/` directory as one
application dataset. The database contains analysis-session metadata, one
submission/take row per audio file, scores, final merged results, consent
state, policy version, and session-level feedback; the audio files are
referenced by relative paths in the database.

SQLite sidecar files are not guaranteed to exist with the current connection
configuration, but a deployment must treat `oracle.db-wal` and `oracle.db-shm`
as part of the live database whenever they are present. Do not copy only
`oracle.db` from a live WAL database and assume that it is a complete snapshot.

## Consistent backup procedure

The safest simple procedure is to quiesce writes briefly:

1. Stop or maintenance-drain the uvicorn service so `/analyze`,
   `/analysis-finalize`, `/research-consent`, and `/feedback` cannot write
   during the snapshot.
2. Create a backup staging directory with mode `0700`.
3. Copy `oracle.db`, any `oracle.db-wal` and `oracle.db-shm` sidecars, and the
   entire `audio/` directory into the same staging directory.
4. Generate a manifest containing file names, sizes, and SHA-256 hashes.
5. Encrypt the resulting archive before it leaves the host.
6. Start the API and run the verification checks below.

An online SQLite backup using the SQLite backup API can produce a consistent
database without stopping readers. It does not by itself create a
point-in-time snapshot of the audio directory, so coordinate the database and
audio copy (for example, with a short write pause) if the pair must be
restored exactly.

Example offline snapshot script (adapt paths and the service name to the
deployment):

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077

DATA=/srv/accent-oracle/data/user_submissions
OUT=/srv/accent-oracle-backups
SERVICE=accent-oracle
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
: "${AGE_RECIPIENT:?set AGE_RECIPIENT to the approved backup recipient}"
install -d -m 700 "$OUT"
STAGE="$(mktemp -d "$OUT/.stage-$STAMP.XXXXXX")"
trap 'rm -rf "$STAGE"; systemctl start "$SERVICE"' EXIT

systemctl stop "$SERVICE"

install -d -m 700 "$STAGE/user_submissions/audio"
cp --preserve=mode,timestamps "$DATA/oracle.db" "$STAGE/user_submissions/"
for sidecar in "$DATA/oracle.db-wal" "$DATA/oracle.db-shm"; do
  if [ -e "$sidecar" ]; then
    cp --preserve=mode,timestamps "$sidecar" "$STAGE/user_submissions/"
  fi
done
rsync -a --delete "$DATA/audio/" "$STAGE/user_submissions/audio/"

(cd "$STAGE" && find user_submissions -type f -print0 | sort -z | xargs -0 sha256sum) \
  > "$STAGE/SHA256SUMS"
tar -C "$STAGE" -czf - . \
  | age --encrypt --recipient "$AGE_RECIPIENT" \
      --output "$OUT/accent-oracle-$STAMP.tar.gz.age"
```

Use `flock` around the script so two scheduled runs cannot overlap. If the
service is managed by a supervisor that automatically restarts it, use that
supervisor's maintenance mechanism instead of relying on `systemctl stop`.
The example requires `age` and an approved recipient key; store the matching
decryption identity separately from the backup host. The encrypted archive is
the only persistent output, and the trap removes staging material after the
service is restarted.

## Scheduling example

The following cron entry is an example only. It assumes the script is
installed as `/usr/local/sbin/accent-oracle-backup` and that the backup host
has enough local capacity for the temporary archive:

```cron
17 * * * * root flock -n /run/accent-oracle-backup.lock /usr/local/sbin/accent-oracle-backup >> /var/log/accent-oracle-backup.log 2>&1
```

An hourly schedule gives a nominal one-hour recovery point objective (RPO);
choose a shorter interval if the amount of re-creatable or consented audio
justifies the operational cost. The current repository does not install this
cron job or provide a backup scheduler.

## Encryption and off-box retention

Audio recordings are personal data. Backups contain copies of that data even
when the live database later marks a row deleted. At minimum:

- Encrypt archives before off-box transfer with an organization-controlled
  key (for example, an `age` recipient or a managed KMS key). Keep the key
  outside the backup host and test key recovery separately.
- Restrict the backup directory and restore host to the service operators;
  use `umask 077`, least-privilege credentials, and encrypted transport.
- Keep a documented retention schedule for backup archives. A suggested
  starting point is seven daily, eight weekly, and twelve monthly encrypted
  copies, but the controller must choose a period compatible with the privacy
  policy and deletion obligations.
- Treat deletion requests and retention purges as backup obligations too.
  A soft-delete in the live database does not erase older archives. Record
  which archive generations contain the deleted data and expire them according
  to the approved policy.
- Keep at least one recent backup off the application host, and preferably
  keep a second copy in a separate failure domain. No particular cloud
  provider or transfer tool is required by this repository.

## Restore and verification

Restore to a separate host or an isolated maintenance directory first:

1. Stop uvicorn and preserve the current `data/user_submissions/` directory
   before replacing anything.
2. Decrypt and verify the archive signature or checksum. Confirm that
   `oracle.db`, any matching WAL/SHM sidecars, and `audio/` came from the same
   snapshot.
3. Restore the database and audio directory with ownership and permissions
   appropriate for the uvicorn service. Do not mix sidecars from another
   snapshot. If the backup was produced by the SQLite online backup API, use
   its self-contained database and do not restore unrelated sidecars.
4. Run SQLite checks before startup:

   ```bash
   sqlite3 /srv/accent-oracle/data/user_submissions/oracle.db \
     'PRAGMA integrity_check; PRAGMA foreign_key_check;'
   ```

   `integrity_check` should print `ok`; `foreign_key_check` should print no
   rows. If the `sqlite3` CLI is unavailable, run equivalent checks with
   Python's `sqlite3` module.
5. Check that every non-empty `submissions.audio_path` resolves to an audio
   file in the restored `data/user_submissions/audio/` directory, and that
   there are no unexpected files containing recordings.
6. Start the API and check:

   ```bash
   curl -fsS https://example.com/live
   curl -fsS https://example.com/ready
   curl -fsS https://example.com/version
   curl -fsS https://example.com/health
   ```

   `/ready` checks the classifier files, parseable metadata, and writable
   storage; it does not prove that the first cold HuBERT load will succeed.
7. Run a controlled synthetic analyze/consent/decline smoke test if the
   restored environment permits it. Do not use a real participant's audio for
   a restore test unless that use is documented and authorized.
8. Compare row counts, consent states, and a sample of audio hashes with the
   backup manifest. Record the restore time, snapshot identifier, checks, and
   any missing files.

Never restore an old archive over a live system without reviewing deletion
requests made after that archive. An old restore can reintroduce data that was
already soft-deleted or past its retention period.

## RPO and RTO assumptions

These are planning targets, not guarantees supplied by the code:

- **RPO:** one hour if the example hourly job completes and an off-box copy is
  available. Without an installed schedule, the effective RPO is undefined.
- **RTO:** four hours for a single-host failure, assuming a prepared host,
  recoverable encryption keys, model artifacts available, and an operator who
  can perform the verification steps. Model download, DNS/TLS setup, or
  provider outages can extend this.
- **Priority:** restore privacy and consent state together with audio; do not
  restore audio alone or use a database snapshot with a different audio
  directory.

## Retention and deletion tools

The application keeps pending rows only until the configured pending-consent
TTL is observed by a storage operation. It does not run an independent purge
worker. Operators should schedule or otherwise monitor the retention command:

```bash
python scripts/purge_expired_research.py --dry-run
python scripts/purge_expired_research.py
```

For an individual user request, use:

```bash
python scripts/soft_delete_submission.py <recording-uuid>
```

See the implementation and policy details in
[`AGENTS.md`](../AGENTS.md), [`scripts/purge_expired_research.py`](../scripts/purge_expired_research.py),
and [`scripts/soft_delete_submission.py`](../scripts/soft_delete_submission.py).
