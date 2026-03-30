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
2. Restart the service.
3. Run `POST /api/audit/integrity/verify`.
4. If required, compare the restored ledger against the latest export manifest in `data/audit/exports/`.

## Operational notes

- The ledger is append-only from the application perspective. There is no purge path in the current product.
- Integrity verification and export batches are themselves written back into the ledger, so verification and backup operations are auditable events.
- The current design is tamper-evident on a single-node SQLite deployment. It is not a substitute for immutable external archival storage.
- If a restored environment also restores browser sessions, revoke old sessions and run an integrity verification before reopening operator access.
