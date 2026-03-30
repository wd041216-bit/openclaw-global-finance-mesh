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
- structured logging plus Prometheus-friendly `/api/metrics`
- detailed `/api/operations/health` endpoint for runtime, ledger, legal-library, and backup-target status
- Docker single-instance baseline and Kubernetes raw manifests for a one-replica deployment
- governed legal-library document states with draft/reviewed/approved/retired lifecycle
- local or cloud LLM routing
- legal library ingestion and grounding
- Chinese-first browser console with business-first workbench, governance center, and system workspace

## What still needs work before an honest enterprise-ready claim

- immutable or off-box audit storage
- production-grade identity federation completeness such as group sync, SCIM, and IdP lifecycle automation
- HA session storage or documented session failover posture
- encryption and secrets-management posture
- tenant isolation
- official-source ingestion governance
- human signoff workflow integration
- load and failover testing
- full connector hardening for ERP, invoicing, and approval systems

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
