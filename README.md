# Zhouheng Global Finance Mesh

Standalone finance control plane for Pack validation, deterministic decision packets, replay analysis, legal-library grounding, and persistent audit history.

This repository turns the Zhouheng Global Finance Mesh design into a runnable product baseline instead of a document-only spec.

## What it ships

- standalone web console for runtime control, legal-library operations, decisions, replays, and audit history
- pluggable Ollama brain runtime for local and cloud deployments
- TypeScript rule engine for Pack validation, decision generation, and replay analysis
- legal library store with ingestion, tagging, search, and citation grounding
- persistent local audit history for decision and replay runs
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

- `src/`: engine, validation, replay, audit-store, and runtime implementations
- `src/server.ts`: browser-accessible control plane
- `web/`: single-page operator console
- `data/legal-library/library.json`: starter legal library corpus
- `data/audit/runs.json`: persisted decision and replay history
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

## Audit history

Every example decision and replay run is persisted to `data/audit/runs.json`.

- the web console shows the most recent runs and the full stored payload for each run
- the history survives restarts, so demos and debugging sessions remain inspectable
- this is a practical MVP audit trail, not yet immutable enterprise-grade storage

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

- included: Pack authoring pattern, validation, deterministic decision generation, replay summary, audit history, audit trace snapshotting, pluggable Ollama brain support, web console, and legal-library grounding
- not yet included: auth and RBAC, immutable audit persistence, ERP-side writeback adapters, SSO, or full production governance workflows

See [docs/enterprise-readiness.md](./docs/enterprise-readiness.md) for a candid checklist.

## Docs

- [docs/roadmap.md](./docs/roadmap.md)
- [docs/marketing-launch.md](./docs/marketing-launch.md)
- [docs/handoff-to-openclaw-self-operator.md](./docs/handoff-to-openclaw-self-operator.md)
- [docs/long-term-evolution-plan.md](./docs/long-term-evolution-plan.md)

## Contribution surface

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CHANGELOG.md](./CHANGELOG.md)
