# Audit Operations

## Source of truth

- Active audit storage lives in `data/audit/ledger.sqlite`.
- Legacy `data/audit/runs.json` and `data/audit/activity.json` are only migration sources and backup artifacts.
- Export bundles are written to `data/audit/exports/` unless `FINANCE_MESH_AUDIT_EXPORT_DIR` overrides the target directory.

## Environment settings

- `FINANCE_MESH_ENVIRONMENT`: audit environment label. Default `local`.
- `FINANCE_MESH_TEAM_SCOPE`: team or shared beta scope label. Default `default`.
- `FINANCE_MESH_AUDIT_EXPORT_DIR`: export output directory. Default `data/audit/exports`.
- `FINANCE_MESH_AUDIT_VERIFY_WARN_HOURS`: how long an integrity verification can age before the API marks it stale. Default `24`.
- `FINANCE_MESH_BACKUP_LOCAL_DIR`: mounted-directory replication target for off-box snapshots.
- `FINANCE_MESH_BACKUP_INTERVAL_MINUTES`: optional in-process scheduler interval for automatic backup runs.
- `FINANCE_MESH_BACKUP_S3_*`: S3-compatible replication target settings for snapshot upload.

Audit APIs are normally exercised from an authenticated reviewer/admin browser session or an admin break-glass token that mints a session first. See [identity-operations.md](./identity-operations.md) for login and CSRF details.

## Verification workflow

1. Trigger `POST /api/audit/integrity/verify` as an admin.
2. Confirm `GET /api/audit/integrity` reports `status: "verified"` and `mismatchCount: 0`.
3. If the status is `mismatch`, inspect the latest integrity verification entry and identify the first mismatched sequence.

## Export workflow

1. Trigger `POST /api/audit/exports` as an admin.
2. Collect the generated NDJSON data file and JSON manifest from `data/audit/exports/`.
3. Verify the manifest SHA-256 and data SHA-256 match the API response or UI detail view before distributing the export.

## Restore workflow

1. Restore `data/audit/ledger.sqlite` from backup.
2. Restore `data/runtime/auth-sessions.sqlite`, `data/runtime/access-control.json`, and `data/runtime/access-control.secrets.json` if the recovery scope includes identity state.
3. Restart the service.
4. Run `POST /api/audit/integrity/verify`.
5. Compare the restored ledger against the latest export manifest in `data/audit/exports/`.
6. If the restored environment also reused session state, revoke sessions that should not survive the incident window.

## Backup workflow

1. Check `GET /api/operations/backups` for configured targets and the latest job result.
2. Trigger `POST /api/operations/backups/run` as an admin when you need an immediate snapshot.
3. Confirm the backup job status in the Governance workspace or via `GET /api/operations/backups/:id`.
4. If using S3-compatible storage, verify that the uploaded object prefix contains both `manifest.json` and the copied audit/runtime files.
5. Run integrity verification after restore drills, not only after incident recovery.

## Operational notes

- The ledger is append-only from the application perspective. There is no purge path in the current product.
- Integrity verification and export batches are themselves written back into the ledger, so verification and backup operations are auditable events.
- Backup replication events are also ledger-native, so manual and scheduled backup runs remain attributable.
- The current design is tamper-evident on a single-node SQLite deployment. Mounted-directory and S3-compatible replication improve durability, but this is still not immutable archival storage.
- If a restored environment also restores browser sessions, revoke old sessions and run an integrity verification before reopening operator access.
