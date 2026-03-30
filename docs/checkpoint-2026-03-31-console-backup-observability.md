# Checkpoint: Console, Backup, and Observability Baseline

Date: 2026-03-31

## Delivered in this checkpoint

- Rebuilt the browser console into four Chinese-first workspaces:
  - `工作台`
  - `依据库`
  - `治理中心`
  - `系统设置`
- Added `GET /api/dashboard/overview` as the default summary contract for the new console shell.
- Added `BackupReplicationStore` with:
  - local snapshot creation under `data/backups/`
  - mounted-directory replication
  - S3-compatible replication
  - backup job history persisted into the audit ledger as `backup_replication`
- Added `GET /api/operations/health`, `GET /api/metrics`, and backup APIs under `/api/operations/backups`.
- Added structured request logging and Prometheus-friendly metrics.
- Added Docker and Kubernetes single-instance deployment baselines.
- Captured refreshed console screenshots:
  - `docs/assets/workbench-enterprise-beta.png`
  - `docs/assets/governance-enterprise-beta.png`
  - `docs/assets/system-enterprise-beta.png`

## Validation

- `npm test`
- `node --check web/app.js`
- real HTTP verification for:
  - `/api/dashboard/overview`
  - `/api/operations/health`
  - `/api/metrics`
- Playwright screenshot smoke for desktop workbench, governance, and system pages
- small-viewport Chromium screenshot smoke for the workbench responsive layout

## Known next steps

- automate off-box backup restore drills
- add a documented CI pipeline for image publish and manifest validation
- add auth-enabled end-to-end browser smoke for OIDC and session revoke flows
