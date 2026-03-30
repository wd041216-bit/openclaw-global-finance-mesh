# OpenClaw Global Finance Mesh

OpenClaw-style agent package for finance decisioning: validate Pack assets, route economic events through a rule mesh, emit auditable Decision Packets, and replay rule changes before release.

This repository turns the Zhouheng Global Finance Mesh design into a runnable MVP instead of a document-only spec.

## What it ships

- OpenClaw plugin entry with finance-system guidance injection
- skill packaging in the same layout used by other OpenClaw repos
- TypeScript rule engine for Pack validation, decision generation, and replay analysis
- example Country, Industry, Entity, Control, and Output Packs
- example SaaS annual prepayment event
- evidence graph snapshot builder for audit trace references
- node:test coverage for validation, decisioning, and replay

## Architecture

The repo deliberately chooses a modular plugin package over a distributed service mesh.

- Why: this keeps the first implementation reversible, easy to audit, and easy to install into an existing OpenClaw runtime.
- Trade-off: it is not a full multi-service platform yet.
- Upside: we can validate the finance domain model and rule semantics before splitting components apart.

See [ADR-001](./docs/ADR-001-modular-openclaw-plugin.md) for the decision record.

## Repository layout

- `index.ts`: plugin entry
- `openclaw.plugin.json`: plugin manifest and config schema
- `src/`: engine, validation, replay, and tool implementations
- `skills/zhouheng-global-finance-mesh/SKILL.md`: bundled runtime skill
- `examples/packs/`: example Pack files
- `examples/events/`: example event payloads
- `examples/openclaw-config.example.json`: starter plugin config
- `tests/`: regression tests
- `docs/`: architecture and launch docs

## Quick start

1. Install dependencies.
2. Run the test suite.
3. Point the decision tool at the example packs and event.

```bash
npm install
npm test
```

Minimal runtime integration example:

```json
{
  "plugins": {
    "load": {
      "paths": ["/absolute/path/to/openclaw-global-finance-mesh"]
    },
    "entries": ["global-finance-mesh"]
  }
}
```

## Finance flow

1. `finance_mesh_validate_packs`
   Validates Pack metadata, sources, approvals, rollback coverage, and duplicate rule ids.
2. `finance_mesh_run_decision`
   Loads packs, evaluates precedence, checks evidence gaps, and emits a Decision Packet plus evidence graph snapshot.
3. `finance_mesh_replay`
   Compares baseline and candidate pack sets across historical events before a publish move.

## Example scenario

The included example models an annual SaaS subscription prepayment:

- initial cash receipt lands as contract liability
- revenue is recognized ratably over the service period
- country rules add tax review expectations
- entity rules escalate materiality review
- control rules ensure evidence completeness and rollback readiness

## Delivery posture

This repo is intentionally honest about scope:

- included: Pack authoring pattern, validation, deterministic decision generation, replay summary, and audit trace snapshotting
- not yet included: jurisdiction-specific legal content at production breadth, ERP-side writeback adapters, or graph database persistence

## Launch support

GitHub positioning and rollout notes live in [docs/marketing-launch.md](./docs/marketing-launch.md). The next implementation milestones are in [docs/roadmap.md](./docs/roadmap.md).

## Contribution surface

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CHANGELOG.md](./CHANGELOG.md)
