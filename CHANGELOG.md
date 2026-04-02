# Changelog

## Unreleased

## 0.4.0

- shipped GitHub Pages as a public product entry with structured `Why / Try / Install / Connect Agents / Pilot / Download` sections
- upgraded Windows packaging to NSIS `.exe` plus `.zip` fallback while keeping tray flow and local data semantics
- expanded release workflow to attach desktop artifacts and `SHA256SUMS` in a standardized release bundle
- added release-artifact and Pages smoke scripts for CI/release gate consistency
- aligned desktop first-launch onboarding across web, macOS menu bar, and Windows tray entry points
- expanded host matrix documentation and checks for OpenClaw + Claude/Manus/Cursor/Cline/Cherry Studio
- refreshed README and README.zh-CN top sections for developer conversion + pilot credibility messaging
- added repository governance docs for security and support routing

## 0.3.0

- repositioned the repository as the standalone `zhouheng-global-finance-mesh` product
- moved the OpenClaw compatibility layer into `integrations/openclaw/`
- added persisted audit history APIs and an operator-facing audit timeline in the web console
- added token-based RBAC with bootstrap admin flow, operator management, and actor attribution on audit runs
- added legal-library lifecycle states so default grounding only uses reviewed and approved source material
- added persisted runtime probe history and a dedicated probe timeline in the web console
- added operator activity logging for RBAC, runtime, legal-library, decision, and replay actions
- replaced JSON audit persistence with a tamper-evident SQLite ledger and one-time legacy migration
- added integrity verification and NDJSON export manifests for the audit chain
- added enterprise beta identity sessions with `HttpOnly` cookies, CSRF enforcement, logout, revoke, and active-session inspection
- added OIDC authorization-code login with subject/email role bindings and break-glass local-token minting
- updated docs, env examples, and GitHub packaging for the identity/session and audit-ledger baseline
- rebuilt the console into four Chinese-first workspaces with summary-first UX for non-technical operators
- added `/api/dashboard/overview`, `/api/operations/health`, and `/api/metrics`
- added local-directory and S3-compatible backup replication plus scheduled backup support
- added non-destructive restore drills with mounted-directory, S3-compatible, and local-snapshot source selection
- added a governance/system recovery center with restore readiness, drill history, and actionable admin summaries
- added GitHub Actions CI, semver release validation, GHCR image publishing, and npm release workflow baselines
- added restore smoke, browser smoke, manifest verification, and release metadata validation scripts
- added Docker and Kubernetes single-instance deployment baselines
- refreshed README screenshots and deployment/operations documentation

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
