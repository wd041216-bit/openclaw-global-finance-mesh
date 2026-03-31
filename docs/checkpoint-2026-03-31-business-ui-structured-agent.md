# Checkpoint: Business-Friendly Console Flows and Structured Agent Integration

Date: 2026-03-31

## Delivered in this checkpoint

- Reworked the business-facing pages so they read like guided workflows instead of dense admin forms.
- Updated `workbench.html` to prioritize next actions sourced from `/api/dashboard/overview`.
- Rebuilt `decisions.html` into a three-step flow:
  - choose event source
  - choose mode and Pack paths
  - read business-friendly result summaries before opening technical details
- Rebuilt `replays.html` into a parallel three-step flow for source selection, baseline/candidate Pack selection, and drift summary reading.
- Reworked `library.html` so search and reading come first, while reviewer/admin governance actions move into secondary expandable panels.
- Refined the shared white UI system with reusable step cards, callout cards, chip rows, and lighter Apple-style surfaces.
- Added shared tool-result types in `src/agent-tool-results.ts` for:
  - `PackValidationToolResult`
  - `DecisionToolResult`
  - `ReplayToolResult`
  - `LegalSearchToolResult`
  - `AuditIntegrityToolResult`
- Upgraded `integrations/mcp/server.ts` so all five tools now return:
  - a short human-readable summary
  - stable `structuredContent`
  - explicit `outputSchema`
- Extended `src/agent-adapters.ts` with integration-facing contract fields:
  - `supportLevel`
  - `smokeCommand`
  - `testedHosts`
  - `artifacts`
- Reworked `agents.html` so each adapter card is ordered as:
  - what it can do
  - how to start it locally
  - how to verify it
  - technical details and config snippets
- Added `npm run smoke:mcp` for local MCP verification.
- Added registry consistency coverage in `tests/agent-adapters.test.ts`.
- Extended MCP coverage in `tests/mcp-server.test.ts` to assert real structured outputs.
- Extended browser smoke to cover:
  - desktop home/workbench/decision/library/system/recovery/agents flow
  - mobile workbench/decision/agents flow
- Added fresh console screenshots for:
  - home
  - workbench
  - decisions
  - recovery
  - Agent Hub

## Validation

- `npm test`
- `npm run verify:server`
- `npm run smoke:mcp`
- `npm run smoke:restore`
- `npm run smoke:ui`
- `node --check src/agent-adapters.ts`
- `node --check integrations/mcp/server.ts`
- `node --check web/pages/decisions.js`

## Notes

- Claude and Manus still intentionally share the same local MCP entrypoint. This checkpoint makes that shared contract more stable; it does not add host-specific workflow forks.
- OpenClaw still exposes its native plugin surface, but its metadata now remains aligned with the same adapter registry and smoke path used elsewhere.
- The business UI priority in this checkpoint is task completion and readability, not marketing polish.
