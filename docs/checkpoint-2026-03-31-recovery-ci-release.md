# Checkpoint: Recovery Drills, CI, and Release Baseline

Date: 2026-03-31

## Delivered in this checkpoint

- Added `RestoreDrillStore` with isolated restore paths under `data/restore-drills/`.
- Added restore drill APIs:
  - `GET /api/operations/restores`
  - `POST /api/operations/restores/run`
  - `GET /api/operations/restores/:id`
- Added restore-readiness summaries to:
  - `GET /api/dashboard/overview`
  - `GET /api/operations/health`
  - the Governance workspace
  - the System workspace recovery center
- Extended audit ledger event coverage with `restore_drill`.
- Upgraded backup replication so S3-compatible targets support download for recovery validation.
- Hardened snapshotting for SQLite files by using `VACUUM INTO` during backup creation.
- Added CI/release scripts:
  - `npm run verify:server`
  - `npm run verify:manifests`
  - `npm run smoke:restore`
  - `npm run smoke:ui`
  - `npm run release:check`
- Added GitHub Actions workflows for CI and tag-gated release publishing to GHCR and npm.
- Added disposable kind-cluster provisioning in CI/release so `kubectl` dry-run validation works without a pre-existing cluster.

## Validation

- `npm test`
- `npm run verify:server`
- `npm run smoke:restore`
- `npm run release:check -- --tag v0.3.0`
- `npm run smoke:ui`
- `npm run verify:manifests`

## Notes

- Restore drills are non-destructive and never overwrite the active `data/` directory.
- A `degraded` recovery result means the drill succeeded only from a local snapshot and did not prove the off-box target.
- Release publish remains intentionally gated behind `workflow_dispatch` or a semver tag.
