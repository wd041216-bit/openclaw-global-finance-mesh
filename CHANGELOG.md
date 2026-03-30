# Changelog

## Unreleased

- repositioned the repository as the standalone `zhouheng-global-finance-mesh` product
- moved the OpenClaw compatibility layer into `integrations/openclaw/`
- added persisted audit history APIs and an operator-facing audit timeline in the web console
- added token-based RBAC with bootstrap admin flow, operator management, and actor attribution on audit runs
- added legal-library lifecycle states so default grounding only uses reviewed and approved source material
- added persisted runtime probe history and a dedicated probe timeline in the web console
- added operator activity logging for RBAC, runtime, legal-library, decision, and replay actions

## 0.1.0

- first public MVP
- OpenClaw plugin packaging
- Pack validation tool
- Decision Packet generation tool
- replay comparison tool
- example finance Packs and SaaS prepayment event
- audit trace snapshot generation

## 0.2.0

- added pluggable Ollama local/cloud brain runtime
- added serialized cloud request execution for single-concurrency plans
- added browser-based control console
- added legal library ingestion, storage, search, and citation grounding
- added runtime configuration persistence without default secret commit behavior
