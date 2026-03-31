# Restore Drill Operations

## Purpose

Restore drills prove that the current backup posture is actually recoverable instead of only copyable.

The service restores a selected backup into an isolated directory under `data/restore-drills/<timestamp>-<drillId>/restored/`, validates the bundle, inspects the restored audit ledger, checks identity-state readability, and writes the result back into the main audit chain as a `restore_drill` event.

## Source priority

When you call `POST /api/operations/restores/run` without parameters, the service chooses the newest successful backup source in this order:

1. S3-compatible target
2. mounted-directory target
3. local snapshot fallback

If the drill falls back to a local snapshot, the result is marked `degraded` because off-box recovery was not proven.

## What gets checked

- `manifest.json` exists in the restored snapshot
- every recorded file hash matches the actual restored file
- restored `data/audit/ledger.sqlite` can be opened and the full hash chain recomputes cleanly
- restored `data/runtime/auth-sessions.sqlite` can be opened
- restored `data/runtime/access-control.json` and `data/runtime/access-control.secrets.json` are readable JSON files

## API surface

- `GET /api/operations/restores`
  Returns recent restore-drill summaries for the Governance workspace and system recovery center.
- `POST /api/operations/restores/run`
  Starts a new non-destructive restore drill. Optional body fields:
  - `backupId`
  - `sourceType` as `s3`, `mounted_dir`, or `local_snapshot`
- `GET /api/operations/restores/:id`
  Returns full drill detail, including the individual checks and restored file list.

These endpoints are `admin` only.

## Operational flow

1. Make sure at least one successful backup exists.
2. Open the Governance workspace or call `GET /api/operations/restores` to inspect the latest recovery status.
3. Trigger `POST /api/operations/restores/run`.
4. Wait for the drill to complete, then inspect the returned checks.
5. If the result is `success`, recovery readiness is current.
6. If the result is `degraded`, fix off-box replication or explicitly test the off-box target.
7. If the result is `failure`, do not call the environment recovery-ready until the failing check is fixed.

## Retention and staleness

- `FINANCE_MESH_RESTORE_DRILL_RETENTION_DAYS`
  Controls how long drill directories are kept on disk. Default `7`.
- `FINANCE_MESH_RESTORE_DRILL_WARN_HOURS`
  Controls how long a successful drill can age before health and overview mark recovery readiness stale. Default `168`.

Old drill directories are cleaned before new drills start. Ledger history is never purged by this cleanup.

## Success criteria

A drill is successful only when:

- the chosen backup source is readable
- the manifest is valid
- the restored ledger passes integrity inspection
- identity-state files are readable
- the drill did not need to fall back to a local snapshot

`degraded` means the checks passed but only against a local snapshot.

## Failure patterns to check first

- S3 object prefix missing one or more restored files
- mounted-directory target lagging behind the local snapshot
- copied SQLite file missing expected content because the backup was taken incorrectly
- edited or corrupted `manifest.json`
- broken `access-control.json` or `access-control.secrets.json`
- restored audit ledger hash mismatch

## Boundary with real incident recovery

Restore drills are validation only. They never overwrite the active runtime directory.

For a real incident:

1. restore the desired snapshot into the live `data/` mount
2. restart the service
3. run `POST /api/audit/integrity/verify`
4. revoke sessions if restored identity state crosses the incident window
5. record the incident-handling steps in your external runbook
