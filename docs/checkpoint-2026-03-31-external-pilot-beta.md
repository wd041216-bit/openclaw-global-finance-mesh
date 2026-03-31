# Checkpoint — External Pilot Beta Hardening

## What changed

- runtime doctor output is now standardized for pilot use:
  - verification status
  - provider identity
  - last verified time
  - catalog / inference access state
  - blocked reason
  - recommended action
  - escalation template
- workbench and home pages now surface first-use pilot guidance instead of assuming runtime is already healthy
- system page now treats cloud and local runtime validation as operator-facing status, not hidden technical detail
- added `.env.pilot.example` for single-instance pilot setup
- added `npm run review:pilot` and `npm run verify:cloud-provider`
- added pilot deployment and functional-review runbooks

## Why this matters

The repo now has a clearer boundary between:

- code correctness
- runtime/provider entitlement problems
- pilot deployment readiness

That makes it realistic to hand the product to a small external pilot group without pretending every remaining blocker is a code issue.
