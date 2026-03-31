# Checkpoint: Host Doctor And Summary-First Admin Console

## What changed

- Hardened the three supported host routes so they are easier to copy, validate, and troubleshoot locally:
  - `OpenClaw` keeps the native plugin path and now has a dedicated install guide plus fixture smoke
  - `Claude` and `Manus` still share the same MCP entrypoint, but now expose fuller install kits with startup, verification, minimum acceptance, and failure notes
  - `npm run doctor:hosts` now checks adapter docs/configs and runs both shared MCP smoke and OpenClaw fixture smoke
- Added an explicit OpenClaw contract source in `src/openclaw-adapter-contract.ts` and used it to keep:
  - `integrations/openclaw/openclaw.plugin.json`
  - `integrations/openclaw/skill.json`
  - `integrations/openclaw/agents/openai.yaml`
  - `integrations/openclaw/SKILL.md`
  - `integrations/openclaw/skills/zhouheng-global-finance-mesh/SKILL.md`
  aligned with the same metadata and wording
- Reworked the admin-facing pages so they lead with status, risk, and next actions instead of dense form walls:
  - `system.html`
  - `governance.html`
  - `recovery.html`
- Refreshed the screenshot set and smoke path so the new summary-first layouts are what GitHub and CI keep validating

## New scripts and tests

- `npm run smoke:openclaw`
- `npm run doctor:hosts`
- `tests/openclaw-adapter.test.ts`

## UI outcome

- `system.html` now shows identity state, login readiness, session protection, and runtime health first; binding/runtime forms move into secondary foldouts
- `governance.html` now opens with three executive cards: integrity, export readiness, and operator-action risk
- `recovery.html` now opens with recovery readiness, backup-chain status, and current failure guidance before detailed backup/restore records

## Host integration outcome

- OpenClaw now has a true local verification path instead of only static metadata checks
- Claude and Manus still intentionally share one MCP server, but their docs now read like install kits instead of loose notes
- The repo now has one obvious host-level diagnostic command for local support and CI use

## Still intentionally not claimed

- hosted connector management
- remote MCP auth
- external Claude/Manus client automation
- vendor-certified production integrations
