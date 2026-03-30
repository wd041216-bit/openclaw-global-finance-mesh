# OpenClaw Global Finance Mesh

OpenClaw-style agent package for finance decisioning: plug in a local or cloud LLM brain, manage a legal-library-backed knowledge base, route economic events through a rule mesh, emit auditable Decision Packets, and replay rule changes before release.

This repository turns the Zhouheng Global Finance Mesh design into a runnable MVP instead of a document-only spec.

## What it ships

- OpenClaw plugin entry with finance-system guidance injection
- skill packaging in the same layout used by other OpenClaw repos
- pluggable Ollama brain runtime for local and cloud deployments
- web console for runtime control, chat, legal library management, and finance operations
- TypeScript rule engine for Pack validation, decision generation, and replay analysis
- legal library store with ingestion, tagging, search, and citation grounding
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
- `src/server.ts`: browser-accessible control plane
- `web/`: single-page console UI
- `data/legal-library/library.json`: starter legal library corpus
- `skills/zhouheng-global-finance-mesh/SKILL.md`: bundled runtime skill
- `examples/packs/`: example Pack files
- `examples/events/`: example event payloads
- `examples/openclaw-config.example.json`: starter plugin config
- `tests/`: regression tests
- `docs/`: architecture and launch docs

## Quick start

1. Install dependencies.
2. Run the test suite.
3. Start the web console.

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

## Web console

The built-in console exposes four operator surfaces:

- `Brain Runtime`: switch between local Ollama and Ollama Cloud, update model routing, and list available models
- `Agent Console`: run grounded prompts with legal-library citations injected into the LLM context
- `Legal Library`: collect, ingest, search, and manage legal or policy source material
- `Finance Mesh`: trigger example decision and replay flows from the browser

For cloud mode, requests are serialized in-process so a single-concurrency subscription does not get overloaded.

## Legal library

The first version aims for library-grade workflow, not instant legal completeness.

- ingest from raw text, URL, or local file path
- store title, jurisdiction, domain, source reference, and tags
- perform lexical full-text search
- inject top matches as cited context into chat requests

See [docs/legal-library-strategy.md](./docs/legal-library-strategy.md) for the intended evolution.

## Example scenario

The included example models an annual SaaS subscription prepayment:

- initial cash receipt lands as contract liability
- revenue is recognized ratably over the service period
- country rules add tax review expectations
- entity rules escalate materiality review
- control rules ensure evidence completeness and rollback readiness

## Delivery posture

This repo is intentionally honest about scope:

- included: Pack authoring pattern, validation, deterministic decision generation, replay summary, audit trace snapshotting, pluggable Ollama brain support, web console, and legal-library grounding
- not yet included: jurisdiction-specific legal content at production breadth, ERP-side writeback adapters, SSO/RBAC, tamper-resistant audit persistence, or full production governance workflows

See [docs/enterprise-readiness.md](./docs/enterprise-readiness.md) for a candid checklist.

## Launch support

GitHub positioning and rollout notes live in [docs/marketing-launch.md](./docs/marketing-launch.md). The next implementation milestones are in [docs/roadmap.md](./docs/roadmap.md).

## Contribution surface

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CHANGELOG.md](./CHANGELOG.md)
