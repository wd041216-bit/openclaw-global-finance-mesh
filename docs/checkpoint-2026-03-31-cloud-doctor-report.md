# Checkpoint: Cloud Doctor Report

Date: 2026-03-31

## What shipped

- added a shared runtime doctor report builder that turns cloud probe output into operator-facing actions
- the report now includes:
  - provider guess and confidence
  - recommended protocol and validated protocol
  - model visibility and suggested replacement model names
  - copy-ready `curl` checks for catalog and inference paths
  - escalation text for provider-side entitlement and network issues
- wired the report into:
  - `POST /api/runtime/probe`
  - dashboard overview runtime summaries
  - the system page runtime diagnostics section
  - `npm run smoke:cloud`
  - `npm run doctor:cloud`
- persisted probe-visible model names in the audit run summary so the report survives refresh and still knows whether the configured model is visible

## Why it matters

The previous checkpoint made cloud failures classifiable.

This checkpoint makes them actionable.

Operators no longer need to:

- guess which provider they are talking to
- invent their own `curl` commands
- manually summarize “catalog works but inference 401” for the provider
- lose model visibility context after a page refresh

## Verification

- `npm test`
- `npm run verify:server`
- `npm run smoke:cloud`

## Honest boundary

This still does not grant cloud inference entitlement by itself.

What it does do is make the remaining blocker explicit, reproducible, and shareable:

- if the problem is protocol, the report tells you to switch protocol
- if the problem is model drift, the report suggests visible alternatives
- if the problem is entitlement, the report gives you the exact escalation text
