# Enterprise Readiness

## What is already in place

- deterministic Pack validation
- auditable Decision Packet generation
- replay-before-publish capability
- persisted runtime probe history
- tamper-evident SQLite audit ledger with a single append-only hash chain
- evidence graph snapshots
- role-gated privileged endpoints for `viewer`, `operator`, `reviewer`, and `admin`
- service-side operator sessions with `HttpOnly` cookies, logout, revoke, and active-session inspection
- CSRF protection for cookie-authenticated writes
- hybrid identity posture: break-glass local tokens plus OIDC authorization-code login
- subject/email identity bindings for OIDC operators
- persisted operator activity timeline for privileged actions
- integrity verification and export-manifest workflow
- local-directory and S3-compatible backup replication with backup job history in the audit chain
- non-destructive restore drills with manifest verification, restored-ledger integrity inspection, and identity-state readability checks
- structured logging plus Prometheus-friendly `/api/metrics`
- detailed `/api/operations/health` endpoint for runtime, ledger, legal-library, backup-target, and recovery-readiness status
- Docker single-instance baseline and Kubernetes raw manifests for a one-replica deployment
- GitHub Actions CI with restore smoke, browser smoke, Docker build, and Kubernetes manifest validation
- tag-gated GHCR and npm release workflow with release metadata checks
- governed legal-library document states with draft/reviewed/approved/retired lifecycle
- local or cloud LLM routing with protocol-aware cloud selection (`auto`, `ollama_native`, `openai_compatible`)
- cloud runtime diagnostics that distinguish catalog access from inference access instead of collapsing everything into a single probe failure
- operator-facing cloud doctor reports with provider guess, suggested model fallback, manual verification commands, and provider escalation notes
- pilot-readiness assets for single-instance external trials, including `.env.pilot.example`, `npm run review:pilot`, and `npm run verify:cloud-provider`
- legal library ingestion and grounding
- Chinese-first multi-page browser console with separate home, workbench, governance, recovery, system, and Agent Hub surfaces
- task-oriented business pages for decision, replay, and legal reading instead of a single overloaded operator screen
- summary-first governance, recovery, and system pages so administrators see status, risk, and next action before any management forms
- unified local-first adapter registry for OpenClaw plugin mode plus Claude/Manus MCP connector mode
- stable MCP contracts with summary text, `structuredContent`, and `outputSchema` for five shared finance tools
- unified host doctor plus local OpenClaw fixture smoke for adapter drift detection

## What still needs work before an honest enterprise-ready claim

- immutable audit storage stronger than off-box replicated SQLite snapshots
- production-grade identity federation completeness such as group sync, SCIM, and IdP lifecycle automation
- HA session storage or documented session failover posture
- encryption and secrets-management posture
- tenant isolation
- official-source ingestion governance
- human signoff workflow integration
- load and failover testing
- full connector hardening for ERP, invoicing, and approval systems
- vendor-grade host-by-host certification beyond local-first OpenClaw fixture smoke and shared MCP smoke coverage
- broader cloud-provider certification beyond the current validated `Ollama Cloud + kimi-k2.5` pilot path

## Standard to hold

The product should only be called enterprise-ready when:

1. privileged actions are access-controlled and attributable
2. interactive sessions are revocable, CSRF-protected, and backed by a documented identity flow
3. audit records survive service restarts and review
4. runtime health probes and governance actions are historically reviewable
5. tamper detection and export verification are operationally usable
6. legal source provenance is reviewable
7. replay gates are part of release workflow
8. integration failures have recovery paths
9. restore drills prove the off-box recovery path on a recurring basis
10. release automation cannot publish artifacts when version metadata drifts
