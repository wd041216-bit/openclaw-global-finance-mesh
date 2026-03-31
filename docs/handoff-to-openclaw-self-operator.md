# Handoff To `openclaw-self-operator`

## Purpose

This document is for a new Codex thread that already has the `openclaw-self-operator` skill available and is taking ownership of this repository as an actively evolving product.

The intended operating mode is:

- diagnose first
- implement next
- verify real runtime behavior
- document the new baseline
- keep iterating without losing auditability

## Repository

- Repo: [zhouheng-global-finance-mesh](https://github.com/wd041216-bit/zhouheng-global-finance-mesh)
- Default branch: `main`
- Current published baseline date: March 31, 2026

## What exists right now

### Product shape

- standalone finance control plane
- Pack validation, deterministic Decision Packet generation, replay analysis, evidence graph snapshotting
- pluggable Ollama brain runtime with `local` and `cloud` modes
- cloud runtime now supports `auto`, `ollama_native`, and `openai_compatible` protocol strategies
- browser-based operator console
- hybrid identity and session control with break-glass local tokens, OIDC login, active-session revoke, and `viewer`/`operator`/`reviewer`/`admin` roles
- legal library ingestion, storage, lifecycle governance, search, and citation injection
- persisted SQLite audit ledger for decision, replay, runtime probe, integrity, export, and operator activity events
- optional OpenClaw adapter under `integrations/openclaw/`

### Entry points

- runtime server: [src/server.ts](/Users/dawei/Documents/New project/zhouheng-global-finance-mesh/src/server.ts)
- LLM runtime: [src/brain.ts](/Users/dawei/Documents/New project/zhouheng-global-finance-mesh/src/brain.ts)
- legal library: [src/legal-library.ts](/Users/dawei/Documents/New project/zhouheng-global-finance-mesh/src/legal-library.ts)
- finance engine: [src/engine.ts](/Users/dawei/Documents/New project/zhouheng-global-finance-mesh/src/engine.ts)
- audit store: [src/audit-store.ts](/Users/dawei/Documents/New project/zhouheng-global-finance-mesh/src/audit-store.ts)
- web console: [web/index.html](/Users/dawei/Documents/New project/zhouheng-global-finance-mesh/web/index.html)
- runtime config: [src/runtime-config.ts](/Users/dawei/Documents/New project/zhouheng-global-finance-mesh/src/runtime-config.ts)

### Verified behavior

- `npm test` passes
- `npm run dev` serves the control plane locally
- `/api/health` responds successfully
- `/api/decision/run` produces a full Decision Packet for the example SaaS annual prepayment event
- `/api/replay/run` persists replay outcomes and returns drift summaries
- `/api/audit/runs` returns saved decision and replay history
- `/api/access-control` returns auth posture and current session state
- `/api/access-control/login/token`, `/api/access-control/login`, and `/api/access-control/callback` drive local-session and OIDC login flows
- `/api/access-control/sessions` and binding endpoints allow admin review and revoke actions
- legal-library search and chat grounding now default to `reviewed` / `approved` source states
- cloud runtime probe can distinguish:
  - model listing works
  - inference is unauthorized
  - protocol mismatch vs. real authorization failure
- `npm run smoke:cloud` prints the normalized cloud diagnosis object for operator troubleshooting

## Known current truth

### Ollama Cloud status

Using the currently tested cloud key, the runtime can enumerate available models but cannot perform inference.

Observed behavior:

- `GET /api/tags` works
- `GET /v1/models` works
- `POST /api/chat` returns `401 unauthorized`
- `POST /v1/chat/completions` returns `401 unauthorized`

This means:

- cloud catalog access exists
- cloud inference access is not yet available for that key or account state
- the product can now prove whether the failure is auth-related or protocol-related

Do not describe cloud inference as operational until the runtime probe shows both list and inference success.

Operator note:

1. inspect `cloudApiFlavor`
2. inspect `catalogChecks` and `inferenceChecks` separately
3. if catalog succeeds but inference returns `401`, treat it as an account/entitlement problem, not an endpoint bug
4. if both endpoints return `endpoint_not_supported`, switch the protocol strategy before changing code

## First 10 minutes for the new operator thread

1. Read:
   - [README.md](/Users/dawei/Documents/New project/zhouheng-global-finance-mesh/README.md)
   - [docs/enterprise-readiness.md](/Users/dawei/Documents/New project/zhouheng-global-finance-mesh/docs/enterprise-readiness.md)
   - [docs/long-term-evolution-plan.md](/Users/dawei/Documents/New project/zhouheng-global-finance-mesh/docs/long-term-evolution-plan.md)
2. Run:
   - `npm install`
   - `npm test`
   - `npm run dev`
3. Verify:
   - open `http://127.0.0.1:3030`
   - run the runtime probe
   - run the example decision
   - run the example replay
   - inspect the audit history panel

## Operator rules for the next thread

### Do not regress these guarantees

- deterministic finance Decision Packet output
- replay-before-publish capability
- visible legal-source grounding path
- persisted SQLite audit history with actor attribution and chain metadata
- honest enterprise-readiness messaging
- no committed secrets

### Preferred execution style

- use `openclaw-self-operator` as the default coordination mode
- keep changes small enough to verify in one loop
- update docs whenever the runtime truth changes
- favor real runtime probes over assumptions
- if external service access is degraded, leave the product in a diagnosable state instead of masking the issue

## Recommended next priorities

### Priority 1

Make cloud inference truly usable.

- confirm required Ollama Cloud inference entitlement or scope
- support any required OpenAI-compatible endpoint variant if different from current implementation
- keep probe history and activity views operational for operator debugging

### Priority 2

Push the identity and audit baseline past beta.

- off-box audit replication and backup automation
- OIDC group mapping or SCIM-compatible identity lifecycle
- per-environment runtime config separation
- HA or documented restore posture for auth sessions

### Priority 3

Upgrade the legal library from basic storage to governed content ops.

- reviewed source states
- version history
- pack-to-source linkage
- ingestion queue and review workflow

## Suggested opening prompt for the next Codex thread

```text
Use openclaw-self-operator and take over /Users/dawei/Documents/New project/zhouheng-global-finance-mesh as an actively evolving product. Start by reading docs/handoff-to-openclaw-self-operator.md and docs/long-term-evolution-plan.md, then verify the runtime locally before making the next highest-leverage enterprise improvement.
```

## What success looks like for handoff

The next thread should be able to continue product work without asking:

- what is already built
- what has been verified
- what is still blocked
- what should be done next
