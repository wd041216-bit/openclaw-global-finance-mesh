# ADR-001: Start As A Standalone Finance Control Plane

## Status

Accepted

## Context

The product goal is a finance decisioning core that can evolve into a larger platform, but the first release needs to be:

- fast to run locally
- easy to review
- easy to replay and audit
- easy to publish as one GitHub repo

The alternative was to frame the product primarily as a host-specific plugin package.

## Decision

Start as a standalone control plane with clear internal modules:

- `validation`
- `engine`
- `replay`
- `evidence`
- `audit-store`
- `runtime`

Keep OpenClaw compatibility as an optional adapter under `integrations/openclaw/` instead of treating it as the product root.

## Consequences

Easier:

- honest product positioning
- single-repo iteration
- faster operator feedback loops
- clearer path to future adapters

Harder:

- shared-process scaling limits remain
- long-term connector isolation is deferred
- audit storage is persisted locally first, not yet hardened for enterprise immutability

## Follow-up

If connector writeback, replay volume, or audit retention outgrow the current shape, split persistence and execution layers behind stable interfaces instead of rewriting the rule core.
