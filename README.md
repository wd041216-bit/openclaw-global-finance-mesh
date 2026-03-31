# Zhouheng Global Finance Mesh

![CI](https://github.com/wd041216-bit/zhouheng-global-finance-mesh/actions/workflows/ci.yml/badge.svg)
![Release](https://github.com/wd041216-bit/zhouheng-global-finance-mesh/actions/workflows/release.yml/badge.svg)
[![npm version](https://img.shields.io/npm/v/@wd041216-bit/zhouheng-global-finance-mesh)](https://www.npmjs.com/package/@wd041216-bit/zhouheng-global-finance-mesh)
[![GHCR](https://img.shields.io/badge/GHCR-zhouheng--global--finance--mesh-blue)](https://github.com/wd041216-bit/zhouheng-global-finance-mesh/pkgs/container/zhouheng-global-finance-mesh)

Business-first finance control plane for deterministic decisioning, replay impact analysis, legal grounding, and tamper-evident audit governance.

- 10-second value: run decisions safely, replay rule changes, and keep governance traceable.
- 3-minute first run: desktop package + guided onboarding.
- 10-minute integration: connect one host (OpenClaw / Claude / Manus / Cursor / Cline / Cherry Studio).

中文入口: [README.zh-CN](./README.zh-CN.md)

## Console snapshots

<p align="center">
  <img src="./docs/assets/workbench-apple-ui.png" alt="Business workbench with next actions and summary cards" width="15%" />
  <img src="./docs/assets/decisions-apple-ui.png" alt="Decision center with a three-step workflow" width="15%" />
  <img src="./docs/assets/governance-apple-ui.png" alt="Governance center with summary-first integrity and export status" width="15%" />
  <img src="./docs/assets/system-apple-ui.png" alt="System page with identity and runtime summaries" width="15%" />
  <img src="./docs/assets/recovery-apple-ui.png" alt="Recovery center with backup and restore readiness" width="15%" />
  <img src="./docs/assets/agents-apple-ui.png" alt="Agent Hub with OpenClaw plus Claude/Manus/Cursor/Cline/Cherry Studio setup cards" width="15%" />
</p>

## Why

- Deterministic decision packets and replay drift checks before policy rollout.
- Legal-library grounding and reviewer/admin governance workflow.
- Tamper-evident audit chain with integrity verification and export manifests.
- Desktop onboarding + summary-first web console for non-technical operators.

## Try

```bash
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:3030](http://127.0.0.1:3030), then follow guided onboarding.

Cloud pilot defaults:

```bash
export OLLAMA_MODE=cloud
export OLLAMA_MODEL=kimi-k2.5
export FINANCE_MESH_CLOUD_API_FLAVOR=auto
export OLLAMA_API_KEY=your_key_here
```

## Install

- macOS outputs: `.pkg`, `.dmg`, `.zip`
- Windows outputs: `.exe` (NSIS) + `.zip` fallback
- first desktop launch always opens:
  - `getting-started.html?mode=admin&entry=desktop`

Build commands:

```bash
npm run build:macos-installer
npm run build:windows-package
```

## Connect Agents

- OpenClaw: native plugin path under `integrations/openclaw/`
- Claude / Manus / Cursor / Cline / Cherry Studio: shared MCP entrypoint at `integrations/mcp/server.ts`

Verification:

```bash
npm run mcp:serve
npm run smoke:mcp
npm run smoke:openclaw
npm run doctor:hosts
```

## Pilot

- external pilot baseline: single-instance self-hosting
- runtime gate: `verificationStatus=fully_usable` and `goLiveReady=true`
- recovery gate: backup target configured + restore drill completed

Key runbooks:

- [cloud-runtime-operations](./docs/cloud-runtime-operations.md)
- [external-pilot-runbook](./docs/external-pilot-runbook.md)
- [v0.4.0-launch-checklist](./docs/v0.4.0-launch-checklist.md)

## Download

Release assets are published with checksums:

- `zhouheng-finance-mesh-0.4.0-macos.pkg`
- `zhouheng-finance-mesh-0.4.0-macos.dmg`
- `zhouheng-finance-mesh-0.4.0-macos.zip`
- `zhouheng-finance-mesh-0.4.0-windows.exe`
- `zhouheng-finance-mesh-0.4.0-windows.zip`
- `SHA256SUMS`

See [GitHub Releases](https://github.com/wd041216-bit/zhouheng-global-finance-mesh/releases).
Live page: [wd041216-bit.github.io/zhouheng-global-finance-mesh](https://wd041216-bit.github.io/zhouheng-global-finance-mesh/).

## Architecture

The standalone control plane is now the primary product surface. OpenClaw remains an optional integration layer, not the product identity.

- Why: this keeps the repo honest about what it is actually building, while still preserving adapter compatibility for existing workflows.
- Trade-off: the first release still runs as one Node process, so long-term connector isolation and hardened persistence remain future work.
- Upside: we can validate finance domain semantics, operator workflows, and auditability before splitting into more services.

See [ADR-001](./docs/ADR-001-standalone-control-plane.md) for the decision record.

## Repository layout

- `src/`: engine, validation, replay, audit-store, audit-ledger, activity-store, and runtime implementations
- `src/server.ts`: browser-accessible control plane
- `web/`: multi-page operator console and shared UI shell modules
- `data/legal-library/library.json`: starter legal library corpus
- `data/audit/ledger.sqlite`: source-of-truth audit ledger
- `data/audit/runs.json`: legacy audit import source retained for one-time migration/backups
- `data/audit/activity.json`: legacy activity import source retained for one-time migration/backups
- `data/audit/exports/`: generated NDJSON exports and manifest files
- `examples/packs/`: example Pack files
- `examples/events/`: example event payloads
- `integrations/openclaw/`: optional OpenClaw adapter, manifest, and bundled skill
- `tests/`: regression tests
- `docs/`: architecture, launch, and handoff docs

## Quick start

```bash
npm install
npm test
npm run dev
```

Then open [http://127.0.0.1:3030](http://127.0.0.1:3030).

The landing experience is now a brand homepage plus dedicated product pages. Non-technical operators can stay in `首页` and `业务工作台`; raw JSON, session ids, and ledger metadata stay behind advanced details.

To wire a cloud brain without committing secrets, set environment variables locally:

```bash
export OLLAMA_MODE=cloud
export OLLAMA_API_KEY=your_key_here
export OLLAMA_MODEL=kimi-k2.5
export FINANCE_MESH_CLOUD_API_FLAVOR=auto
npm run dev
```

The UI also lets you enter the API key at runtime; it is not persisted unless you explicitly opt in.

Cloud mode now supports three protocol strategies:

- `auto`: probe both Ollama-native and OpenAI-compatible catalog/inference paths, then prefer the first working pair
- `ollama_native`: force `/api/tags` and `/api/chat`
- `openai_compatible`: force `/v1/models` and `/v1/chat/completions`

The current external-pilot default is `Ollama Cloud + kimi-k2.5`. OpenAI-compatible gateways remain supported, but they are no longer a hard blocker for the current pilot go-live path.

Minimal cloud verification flow:

```bash
curl -s http://127.0.0.1:3030/api/runtime/config
curl -s -X POST http://127.0.0.1:3030/api/runtime/probe
npm run smoke:cloud
npm run doctor:cloud
npm run verify:cloud-provider -- --out output/cloud-verification.json
```

Expected outcomes:

- `listModelsOk=true` and `inferenceOk=true`: cloud inference is operational
- `listModelsOk=true` and `inferenceOk=false`: catalog access exists, but inference is still blocked
- `errorKind=unauthorized`: the key or account lacks the required permission
- `errorKind=endpoint_not_supported`: switch `FINANCE_MESH_CLOUD_API_FLAVOR` or confirm the provider surface

For the current pilot, the target end-state is:

- provider: `Ollama Cloud`
- model: `kimi-k2.5`
- `verificationStatus=fully_usable`
- `goLiveReady=true`
- `validatedFlavor=ollama_native`

Catalog access is not the same as inference access. Do not treat a successful model listing as proof that cloud reasoning is enabled.

The system page now also builds a cloud doctor report with:

- provider guess and confidence
- recommended protocol and validated protocol
- model visibility and suggested replacement model names
- copy-ready catalog and inference `curl` commands
- an escalation note you can send to the provider when catalog works but inference is still blocked
- a standardized verification status for pilot use: `fully_usable`, `catalog_only_entitlement_blocked`, `cloud_unauthorized`, `protocol_mismatch`, `model_visibility_gap`, or `network_or_tls_failure`
- a go-live gate with `verifiedModel`, `validatedFlavor`, `goLiveReady`, `goLiveBlockers`, and `requiresProviderAction`

See [docs/cloud-runtime-operations.md](./docs/cloud-runtime-operations.md) for the cloud runtime runbook.
See [docs/external-pilot-runbook.md](./docs/external-pilot-runbook.md) for the single-instance external pilot path.

## macOS one-click package

If you want to try the product like a local app instead of running `npm run dev`, the repo now includes a macOS desktop packager.

Build it with:

```bash
npm run build:macos-installer
```

This produces:

- `dist/macos/zhouheng-finance-mesh-<version>-macos.pkg`
- `dist/macos/zhouheng-finance-mesh-<version>-macos.dmg`
- `dist/macos/zhouheng-finance-mesh-<version>-macos.zip`
- a release folder containing `Zhouheng Finance Mesh.app` plus helper scripts

Recommended install path:

- double-click `zhouheng-finance-mesh-<version>-macos.pkg`
- install the app into `/Applications`
- launch `Zhouheng Finance Mesh.app`

The desktop app now runs as a menu bar controller, keeps user state under `~/Library/Application Support/Zhouheng Finance Mesh`, opens `getting-started.html?mode=admin&entry=desktop` on first launch, and defaults to:

- `OLLAMA_MODE=cloud`
- `OLLAMA_MODEL=kimi-k2.5`
- `FINANCE_MESH_CLOUD_API_FLAVOR=auto`

The package now bundles the official Node.js 22.22.2 macOS runtime, so users do not need to preinstall Node.
For sharing with other users, prefer the generated `.pkg`, `.dmg`, or `.zip`; if you build inside an iCloud-synced folder, the raw `.app` in `dist/` can pick up local Finder metadata after the build.

See [docs/macos-desktop-package.md](./docs/macos-desktop-package.md) for packaging, install, and first-launch details.

## Windows desktop package

The repo now also includes a Windows desktop packager.

Build it with:

```bash
npm run build:windows-package
```

This produces:

- `dist/windows/zhouheng-finance-mesh-<version>-windows.exe`
- `dist/windows/zhouheng-finance-mesh-<version>-windows.zip`
- a release folder with installer / start / stop scripts

The Windows package bundles the official Node.js 22.22.2 runtime, installs into `%LOCALAPPDATA%\Programs\Zhouheng Finance Mesh`, stores user data under `%LOCALAPPDATA%\Zhouheng Finance Mesh`, and launches a tray controller with onboarding / start / stop / open-console actions.

Recommended install path:

- run `.exe` first (NSIS one-click installer)
- use `.zip` as fallback when `.exe` is blocked by local policy

See [docs/windows-desktop-package.md](./docs/windows-desktop-package.md) for packaging and install details.

## Identity and access

The product now ships with an enterprise beta identity baseline.

- bootstrap the first admin in the Access Control panel or with `FINANCE_MESH_BOOTSTRAP_ADMIN_*` env vars
- use a break-glass local token to mint a server session when `FINANCE_MESH_ALLOW_LOCAL_TOKENS=true`
- enable OIDC with `FINANCE_MESH_BASE_URL`, `FINANCE_MESH_OIDC_ISSUER`, `FINANCE_MESH_OIDC_CLIENT_ID`, and `FINANCE_MESH_OIDC_CLIENT_SECRET`
- bind OIDC users to platform roles with exact `issuer + subject` or verified-email matching
- protect cookie-authenticated writes with `x-finance-mesh-csrf`
- inspect and revoke active sessions from the Access Control panel or `/api/access-control/sessions`

Minimal OIDC setup looks like this:

```bash
export FINANCE_MESH_AUTH_ENABLED=true
export FINANCE_MESH_BASE_URL=https://finance-mesh.example.com
export FINANCE_MESH_OIDC_ISSUER=https://id.example.com
export FINANCE_MESH_OIDC_CLIENT_ID=finance-mesh-console
export FINANCE_MESH_OIDC_CLIENT_SECRET=replace_me
export FINANCE_MESH_OIDC_SCOPES="openid profile email"
export FINANCE_MESH_ALLOW_LOCAL_TOKENS=true
npm run dev
```

See [docs/identity-operations.md](./docs/identity-operations.md) for full bootstrap, OIDC, session-revoke, and CSRF troubleshooting steps.

## Multi-page console

The console is no longer a single overloaded screen.

- `index.html` is the brand homepage with environment snapshot and entry routing
- `workbench.html` is the business-first starting point with recommended actions sourced from `/api/dashboard/overview`
- `decisions.html` and `replays.html` now use explicit three-step flows instead of raw operator forms
- `library.html` is search-first, with governance actions moved behind reviewer/admin-only secondary panels
  - `governance.html`, `recovery.html`, and `system.html` keep audit governance, recovery operations, and admin/runtime controls separate, with summary-first dashboards before any forms
  - `system.html` isolates identity, session, runtime, and observability controls behind lighter first-screen summaries
- `agents.html` gives non-technical and technical users a single place to understand how Zhouheng plugs into external hosts

This keeps business work readable, while preserving advanced details for reviewers and administrators.

## External pilot workflow

For a small external pilot, use this order:

1. Copy `.env.pilot.example` to `.env`.
2. Fill in a real `OLLAMA_API_KEY` for `Ollama Cloud`.
3. Start the single-instance Docker deployment.
4. Complete admin bootstrap and login from `系统设置`.
5. Verify runtime with `npm run verify:cloud-provider` and confirm `kimi-k2.5` is fully usable.
6. Run `npm run review:pilot` and confirm the runtime gate passes.
7. Capture backup + restore success before inviting external users.

Current pilot review status lives in [docs/pilot-functional-review-2026-03-31.md](./docs/pilot-functional-review-2026-03-31.md).

## Agent compatibility

Zhouheng now has a unified adapter registry instead of a one-off OpenClaw-only integration story.

- `integrations/openclaw/` remains the native OpenClaw plugin adapter
- `integrations/mcp/server.ts` is the shared local-first MCP entrypoint
- `integrations/claude/` contains Claude connector docs and example MCP config
- `integrations/manus/` contains Manus connector docs and example MCP config
- `integrations/cursor/` contains Cursor connector docs and example MCP config
- `integrations/cline/` contains Cline connector docs and example MCP config
- `integrations/cherry-studio/` contains Cherry Studio connector docs and example MCP config
- `npm run mcp:serve` starts the shared MCP connector directly
- `npm run smoke:mcp` validates that the MCP server lists all five tools and can execute structured decision/legal-library calls locally
- `npm run smoke:openclaw` loads the native OpenClaw adapter in a fixture host and verifies three tools plus prompt guidance
- `npm run doctor:hosts` runs the shared host doctor: config-template checks, docs checks, MCP smoke, and OpenClaw fixture smoke

Supported tool surfaces today:

- pack validation
- decision run
- replay run
- legal library search
- audit integrity read

All five shared MCP tools now return:

- a short human-readable summary that hosts can display directly
- stable `structuredContent`
- an explicit `outputSchema`

This keeps Claude/Manus/Cursor/Cline/Cherry Studio on one shared contract, while OpenClaw continues to use its native plugin surface with artifact drift checked against the same contract.

## Legal library governance

Legal-library documents now carry lifecycle state.

- new documents start as `draft`
- reviewers can promote documents to `reviewed` or `approved`, or retire them
- default search grounding for agent context only uses `reviewed` and `approved` documents
- the seeded example legal corpus is pre-marked as `approved` so the repo still works out of the box

## Audit history

Every decision, replay, runtime probe, integrity verification, export batch, and operator governance event now lands in `data/audit/ledger.sqlite`.

- the web console shows decision/replay history, probe history, operator activity, and a dedicated audit integrity panel
- legacy `runs.json` and `activity.json` files are migrated once on first boot if they exist, then kept as backup artifacts instead of active storage
- the ledger survives restarts, supports whole-chain verification, and can export NDJSON slices with signed manifests
- the ledger can also be snapshotted and replicated to mounted-directory or S3-compatible targets
- this is tamper-evident storage with durability support, not yet immutable archival storage

## Operator activity

Privileged actions are part of the same audit chain.

- bootstrap admin, access-policy changes, operator issuance, runtime updates, legal-library governance actions, probe runs, decisions, and replays all generate operator activity entries
- integrity verification and export batches are ledger-native events surfaced through the audit integrity panel and export detail views
- the web console exposes a separate operator activity panel so admins can inspect governance actions without digging through raw files
- activity events are actor-stamped when auth is enabled and still persist in auth-disabled local development mode

## Integrity and export operations

- `GET /api/audit/integrity` exposes the latest chain state, migration summary, staleness, and latest export metadata
- `POST /api/audit/integrity/verify` replays the ledger hash chain and seals the verification result back into the ledger
- `POST /api/audit/exports` writes an NDJSON slice plus JSON manifest under `data/audit/exports/`
- reviewers can inspect integrity/export status; admins can trigger verification and new exports

## Backup and observability

- `GET /api/operations/health` provides runtime, ledger, legal-library, and backup-target health in one response
- `GET /api/metrics` exposes Prometheus text metrics for HTTP traffic, runs, sessions, integrity verification, and backups
- `POST /api/operations/backups/run` creates a snapshot bundle under `data/backups/` and replicates it to configured targets
- `GET /api/operations/restores`, `POST /api/operations/restores/run`, and `GET /api/operations/restores/:id` drive isolated recovery drills from S3, mounted-directory, or local snapshot sources
- `FINANCE_MESH_BACKUP_LOCAL_DIR` enables mounted-directory replication
- `FINANCE_MESH_BACKUP_S3_*` enables S3-compatible object replication
- `FINANCE_MESH_RESTORE_DRILL_RETENTION_DAYS` controls how long drill directories are kept under `data/restore-drills/`
- `FINANCE_MESH_RESTORE_DRILL_WARN_HOURS` controls when recovery readiness is marked stale in health and dashboard summaries
- `FINANCE_MESH_LOG_FORMAT=json` enables structured logs for containerized or aggregator environments

Restore drills are non-destructive. They materialize a backup into `data/restore-drills/<timestamp>-<drillId>/restored/`, verify `manifest.json`, re-check the restored ledger hash chain, and confirm the restored identity-state files can be read before reporting readiness.

## Deployment baseline

- `Dockerfile` and `docker-compose.yml` provide a single-instance container baseline
- `deploy/kubernetes/` contains ConfigMap, Secret example, Deployment, Service, PVC, and Ingress example manifests
- the deployment posture is intentionally stateful and single-replica; it is a beta baseline, not an HA claim

## CI and release baseline

- `.github/workflows/ci.yml` runs `npm ci`, `npm test`, `npm run verify:server`, `npm run verify:manifests`, `docker build`, `npm run smoke:restore`, and `npm run smoke:ui` on pull requests and `main`
- `.github/workflows/release.yml` only publishes on `workflow_dispatch` or a semver tag such as `v0.4.0`
- `npm run release:check -- --tag v0.4.0` verifies that the git tag, `package.json` version, and `CHANGELOG.md` heading all match before release publish starts
- CI provisions a disposable kind cluster before `npm run verify:manifests`, because `kubectl` dry-run still needs API discovery for built-in resource mapping
- release publish targets are `ghcr.io/wd041216-bit/zhouheng-global-finance-mesh` for container images and the public npm registry for the package

## Finance flow

1. `finance_mesh_validate_packs`
   Validates Pack metadata, sources, approvals, rollback coverage, and duplicate rule ids.
2. `finance_mesh_run_decision`
   Loads Packs, evaluates precedence, checks evidence gaps, emits a Decision Packet, and persists the run summary.
3. `finance_mesh_replay`
   Compares baseline and candidate Pack sets across historical events and persists the replay outcome for review.

## Optional host integrations

If you want Zhouheng to be used by external agent hosts instead of only through the web console:

```json
{
  "plugins": {
    "load": {
      "paths": ["/absolute/path/to/zhouheng-global-finance-mesh/integrations/openclaw"]
    },
    "entries": ["zhouheng-global-finance-mesh"]
  }
}
```

For MCP-aware hosts, use the shared connector instead:

```bash
npm run mcp:serve
```

See:

- [integrations/mcp/README.md](./integrations/mcp/README.md)
- [integrations/claude/README.md](./integrations/claude/README.md)
- [integrations/manus/README.md](./integrations/manus/README.md)
- [integrations/cursor/README.md](./integrations/cursor/README.md)
- [integrations/cline/README.md](./integrations/cline/README.md)
- [integrations/cherry-studio/README.md](./integrations/cherry-studio/README.md)

## Delivery posture

This repo is intentionally honest about scope.

- included: Pack authoring pattern, validation, deterministic decision generation, replay summary, hybrid OIDC/local identity, cookie sessions with CSRF, SQLite audit ledger, backup replication, runtime probe history, operator activity logging, integrity verification, export manifests, deployment/observability baseline, pluggable Ollama brain support, web console, and legal-library grounding
- included: recovery drills, restore-readiness summaries, CI verification, and semver-gated release workflows
- not yet included: SCIM or group sync, immutable archival audit persistence, HA session replication, ERP-side writeback adapters, or full production governance workflows

See [docs/enterprise-readiness.md](./docs/enterprise-readiness.md) for a candid checklist.

## Docs

- [docs/identity-operations.md](./docs/identity-operations.md)
- [docs/cloud-runtime-operations.md](./docs/cloud-runtime-operations.md)
- [docs/restore-drill-operations.md](./docs/restore-drill-operations.md)
- [docs/deployment-baseline.md](./docs/deployment-baseline.md)
- [docs/host-integration-matrix.md](./docs/host-integration-matrix.md)
- [docs/v0.4.0-launch-checklist.md](./docs/v0.4.0-launch-checklist.md)
- [docs/roadmap.md](./docs/roadmap.md)
- [docs/marketing-launch.md](./docs/marketing-launch.md)
- [docs/handoff-to-openclaw-self-operator.md](./docs/handoff-to-openclaw-self-operator.md)
- [docs/long-term-evolution-plan.md](./docs/long-term-evolution-plan.md)
- [docs/audit-operations.md](./docs/audit-operations.md)
- [docs/checkpoint-2026-03-31-enterprise-beta-identity.md](./docs/checkpoint-2026-03-31-enterprise-beta-identity.md)
- [docs/checkpoint-2026-03-31-runtime-ci-cloud-diagnostics.md](./docs/checkpoint-2026-03-31-runtime-ci-cloud-diagnostics.md)
- [docs/checkpoint-2026-03-31-cloud-doctor-report.md](./docs/checkpoint-2026-03-31-cloud-doctor-report.md)
- [docs/checkpoint-2026-03-31-console-backup-observability.md](./docs/checkpoint-2026-03-31-console-backup-observability.md)
- [docs/checkpoint-2026-03-31-recovery-ci-release.md](./docs/checkpoint-2026-03-31-recovery-ci-release.md)
- [docs/checkpoint-2026-03-31-apple-ui-agent-hub.md](./docs/checkpoint-2026-03-31-apple-ui-agent-hub.md)

## Contribution surface

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CHANGELOG.md](./CHANGELOG.md)
- [SECURITY.md](./SECURITY.md)
- [SUPPORT.md](./SUPPORT.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
