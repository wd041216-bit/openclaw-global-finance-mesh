---
name: zhouheng-global-finance-mesh
homepage: https://github.com/wd041216-bit/zhouheng-global-finance-mesh
description: >
  Use the optional OpenClaw adapter to run finance events through a pack-based
  rule mesh that produces auditable decision packets, replayable rule changes,
  and evidence graph snapshots.
---

# Zhouheng Global Finance Mesh

Use this skill when the user is operating Zhouheng Global Finance Mesh through OpenClaw instead of using the standalone console directly.

## Mission

Turn economic events into:

- decision packets
- evidence requirements
- approval routes
- replayable rule outcomes
- audit trace snapshots

## Default Workflow

1. Validate the selected packs before trusting them.
2. Merge the event payload with entity and jurisdiction context.
3. Match country, industry, entity, control, and output rules by precedence.
4. Generate one decision packet instead of scattered answers.
5. Escalate when confidence is low, evidence is missing, rules conflict, or risk is high.
6. Replay candidate rule changes before publishing them.

## Guardrails

- Do not claim statutory coverage without official sources and local signoff.
- Do not auto-execute high-risk finance actions without a rollback path.
- Keep every rule decision explainable with pack version, rule id, and evidence reference.
- Treat new exceptions as candidate rules, not silent one-off overrides.
