# ADR-001: Start As A Modular OpenClaw Plugin

## Status

Accepted

## Context

The product goal is a finance decisioning core that can evolve into a larger platform, but the first release needs to be:

- fast to install
- easy to review
- easy to replay locally
- easy to publish as one GitHub repo

The alternative was to immediately split validation, decisioning, replay, and evidence persistence into separate services.

## Decision

Start as a modular OpenClaw plugin package with clear internal modules:

- `validation`
- `engine`
- `replay`
- `evidence`
- `tools`

## Consequences

Easier:

- one-step installation into OpenClaw
- single-repo iteration
- lower coordination cost
- faster domain-model learning

Harder:

- shared-process scaling limits
- future connector isolation is deferred
- long-term persistence is still an integration step, not a built-in subsystem

## Follow-up

If connector writeback, replay volume, or audit retention outgrow the plugin shape, split the persistence and execution layers behind stable interfaces instead of rewriting the rule core.

