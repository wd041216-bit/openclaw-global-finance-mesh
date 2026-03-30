# Long-Term Evolution Plan

## North Star

Build a finance-and-legal operating system that behaves like a standalone product with optional adapters:

- plug in a local or cloud LLM brain and start using it
- ground responses and decisions in a governed legal library
- convert finance events into auditable Decision Packets
- validate and replay rule changes before rollout
- meet honest enterprise standards for security, auditability, and governance

## Current maturity

### Already shipped

- Pack validation
- deterministic finance decision engine
- replay engine
- evidence graph snapshots
- local/cloud Ollama runtime abstraction
- web console
- legal library foundation
- hybrid identity baseline with OIDC-ready session management
- SQLite audit ledger with integrity verify and export manifests

### Not yet enterprise-complete

- immutable off-box audit persistence
- environment separation and deployment hardening
- production identity federation completeness such as SCIM, group sync, and IdP lifecycle automation
- official-source governance workflow
- connector-grade ERP and approval integrations
- production observability and incident playbooks

## Strategic phases

## Phase 1: Trusted Internal Alpha

Target:

Make the product dependable for internal operator use by one team.

Required outcomes:

- runtime probe and failure diagnostics stay accurate
- local and cloud brain modes are both operable or clearly diagnosable
- legal library records can be created, searched, and cited with stable metadata
- finance example flows remain green under test

Exit criteria:

- one documented happy-path demo
- one documented failure-path demo
- repeatable local startup and verification loop

## Phase 2: Governed Beta

Target:

Allow a controlled pilot with real operator roles and governed content.

Required outcomes:

- auth with at least operator and reviewer roles
- write actions logged to persistent audit storage
- legal library content states such as `draft`, `reviewed`, `approved`, `retired`
- source provenance visible on all grounded responses
- pack publishing gates include validation and replay
- tamper-evident verification on the local audit ledger
- service-side sessions and logout/revoke workflow

Exit criteria:

- no privileged mutation endpoint is anonymous
- audit trail survives restart and can be queried
- reviewed sources can be distinguished from raw ingests

## Phase 3: Enterprise Pilot

Target:

Support a limited production-style workflow with real business integrations.

Required outcomes:

- ERP or general-ledger connector skeleton with retry and rollback patterns
- approval workflow integration
- environment-specific config separation
- observability covering runtime errors, replay drift, library ingestion, and model failures
- deployment guide for repeatable rollout
- off-box backup automation for the audit ledger and session restore posture

Exit criteria:

- one connector flow runs end to end in a controlled environment
- release workflow includes replay gate and rollback instructions
- operational dashboard covers key failure classes

## Phase 4: Enterprise Standard

Target:

Reach a level where calling the product enterprise-ready is honest.

Required outcomes:

- production-grade identity federation beyond the current beta baseline
- tamper-evident or immutable audit storage
- secret handling and encryption posture
- tenancy or environment isolation strategy
- governed legal-source lifecycle
- security review and incident process
- load, failover, and resilience testing

Exit criteria:

- privileged actions require identity and role checks
- audit records are durable and reviewable
- release process blocks unsafe pack changes
- legal source provenance is inspectable at response and decision time

## Core workstreams

## 1. Brain Runtime

Goal:

Make model selection, fallback, and diagnostics production-credible.

Backlog:

- support explicit OpenAI-compatible Ollama mode if required
- save probe history and last-known-good runtime state
- add provider fallback ordering
- add timeout and retry policies by mode
- add model capability metadata

## 2. Legal Library

Goal:

Move from basic collection to governed knowledge operations.

Backlog:

- ingestion jobs and source tracking
- review queues
- document versioning
- link legal records to packs and rules
- search ranking improvements
- excerpt confidence and citation quality scoring

## 3. Finance Rule Governance

Goal:

Make packs safely evolvable at scale.

Backlog:

- pack registry UI
- version promotion workflow
- replay baselines by domain and jurisdiction
- rule conflict review surface
- human signoff workflow capture

## 4. Enterprise Security

Goal:

Protect data, actions, and operators.

Backlog:

- group or SCIM-based identity lifecycle
- multi-IdP or environment-aware identity configuration
- HA session storage
- off-box ledger replication
- secrets segregation
- environment separation

## 5. Connectors And Execution

Goal:

Move from analysis product to execution-capable control plane.

Backlog:

- ERP adapter skeleton
- approval system adapter
- document storage adapter
- notification adapter
- rollback-aware execution orchestrator

## 6. UX And Operator Experience

Goal:

Make the product feel intentional and operationally trustworthy.

Backlog:

- richer timeline view for decisions and replays
- pack and legal-library dashboards
- operator queue for failures and reviews
- environment banners and risk states
- onboarding tour for first-time operators

## 7. GitHub And Product Packaging

Goal:

Turn the repo into a strong open-source front door while product maturity rises.

Backlog:

- animated demo assets
- screenshots of web console
- release notes cadence
- issue templates for runtime, legal library, and connector requests
- project board or milestone labeling discipline
- tighter GitHub metadata around enterprise beta identity and audit posture

## Working model for future Codex threads

Every future thread should prefer this loop:

1. verify current state
2. choose one high-leverage workstream slice
3. implement a bounded improvement
4. run tests and runtime checks
5. update docs to match the new truth
6. commit and publish

## Anti-goals

- claiming full legal coverage before governance exists
- wiring direct execution before rollback and audit are credible
- over-abstracting the architecture before operator workflows are stable
- calling the product enterprise-ready before the checklist in [enterprise-readiness.md](/Users/dawei/Documents/New%20project/zhouheng-global-finance-mesh/docs/enterprise-readiness.md) is actually met
