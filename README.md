# Zhouheng Global Finance Mesh

Standalone finance control plane for Pack validation, deterministic decision packets, replay analysis, legal-library grounding, a tamper-evident SQLite audit ledger, and operator governance telemetry.

This repository turns the Zhouheng Global Finance Mesh design into a runnable product baseline instead of a document-only spec.

## What it ships

- standalone web console for runtime control, legal-library operations, decisions, replays, audit history, probe history, operator activity review, and audit integrity checks
- token-based access control with `viewer`, `operator`, `reviewer`, and `admin` roles
- pluggable Ollama brain runtime for local and cloud deployments
- TypeScript rule engine for Pack validation, decision generation, and replay analysis
- legal library store with ingestion, tagging, governed status workflow, search, and citation grounding
- append-only SQLite audit ledger for decision, replay, runtime probe, integrity verification, export batches, and operator activity
- persisted operator activity timeline for RBAC, runtime, legal-library, and release actions
- example Country, Industry, Entity, Control, and Output Packs
- example SaaS annual prepayment event
- optional OpenClaw adapter under `integrations/openclaw/`
- node:test coverage for validation, decisioning, replay, legal library, and audit storage

## Architecture

The standalone control plane is now the primary product surface. OpenClaw remains an optional integration layer, not the product identity.

- Why: this keeps the repo honest about what it is actually building, while still preserving adapter compatibility for existing workflows.
- Trade-off: the first release still runs as one Node process, so long-term connector isolation and hardened persistence remain future work.
- Upside: we can validate finance domain semantics, operator workflows, and auditability before splitting into more services.

See [ADR-001](./docs/ADR-001-standalone-control-plane.md) for the decision record.

## Repository layout

- `src/`: engine, validation, replay, audit-store, audit-ledger, activity-store, and runtime implementations
- `src/server.ts`: browser-accessible control plane
- `web/`: single-page operator console
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

To wire a cloud brain without committing secrets, set environment variables locally:

```bash
export OLLAMA_MODE=cloud
export OLLAMA_API_KEY=your_key_here
export OLLAMA_MODEL=qwen3:8b
npm run dev
```

The UI also lets you enter the API key at runtime; it is not persisted unless you explicitly opt in.

## Access control

The console now supports local token-based RBAC.

- bootstrap the first admin in the Access Control panel or with `FINANCE_MESH_BOOTSTRAP_ADMIN_*` env vars
- authenticate with a bearer token stored in browser session storage
- protect mutation and audit endpoints with `viewer`, `operator`, `reviewer`, and `admin` roles
- stamp decision and replay audit history with the authenticated actor when auth is enabled

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
- this is tamper-evident local storage, not yet immutable off-box enterprise storage

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

## Finance flow

1. `finance_mesh_validate_packs`
   Validates Pack metadata, sources, approvals, rollback coverage, and duplicate rule ids.
2. `finance_mesh_run_decision`
   Loads Packs, evaluates precedence, checks evidence gaps, emits a Decision Packet, and persists the run summary.
3. `finance_mesh_replay`
   Compares baseline and candidate Pack sets across historical events and persists the replay outcome for review.

## Optional OpenClaw integration

If you still need OpenClaw compatibility, load the adapter from `integrations/openclaw/`.

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

## Delivery posture

This repo is intentionally honest about scope.

- included: Pack authoring pattern, validation, deterministic decision generation, replay summary, token-based RBAC, SQLite audit ledger, runtime probe history, operator activity logging, integrity verification, export manifests, audit trace snapshotting, pluggable Ollama brain support, web console, and legal-library grounding
- not yet included: SSO, immutable off-box audit persistence, ERP-side writeback adapters, or full production governance workflows

See [docs/enterprise-readiness.md](./docs/enterprise-readiness.md) for a candid checklist.

## Docs

- [docs/roadmap.md](./docs/roadmap.md)
- [docs/marketing-launch.md](./docs/marketing-launch.md)
- [docs/handoff-to-openclaw-self-operator.md](./docs/handoff-to-openclaw-self-operator.md)
- [docs/long-term-evolution-plan.md](./docs/long-term-evolution-plan.md)
- [docs/audit-operations.md](./docs/audit-operations.md)

## Contribution surface

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CHANGELOG.md](./CHANGELOG.md)
