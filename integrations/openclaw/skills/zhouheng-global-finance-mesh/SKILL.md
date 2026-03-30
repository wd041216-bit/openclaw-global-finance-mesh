---
name: zhouheng-global-finance-mesh
homepage: https://github.com/wd041216-bit/zhouheng-global-finance-mesh
description: Zhouheng finance mesh runtime skill for the optional OpenClaw adapter.
---

# Zhouheng Global Finance Mesh

Prefer this skill when:

- finance events need deterministic treatment
- the user asks for auditability or rollbackability
- packs should be validated before they are trusted
- rule changes should be replayed before release

## Runtime pattern

1. Validate pack quality first.
2. Run a single decision packet for the current event.
3. Surface confidence, risk, evidence gaps, and approval route.
4. If rules are changing, replay historical events before publish.
