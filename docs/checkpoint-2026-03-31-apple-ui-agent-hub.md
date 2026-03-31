# Checkpoint: Apple-Style Multi-Page Console and Agent Hub

Date: 2026-03-31

## Delivered in this checkpoint

- Replaced the old single-page console shell with a white, high-whitespace, Apple-style multi-page UI.
- Split the product surface into:
  - `index.html`
  - `workbench.html`
  - `decisions.html`
  - `replays.html`
  - `library.html`
  - `governance.html`
  - `recovery.html`
  - `system.html`
  - `agents.html`
- Added shared frontend modules under `web/core/` and page controllers under `web/pages/`.
- Replaced the old monolithic CSS with token, layout, component, and page-specific styles under `web/styles/`.
- Added a dedicated `system.html` flow for:
  - local token login
  - OIDC login redirect
  - logout
  - bootstrap admin
  - access-config updates
  - operator issuance
  - identity binding creation and deactivation
  - session inspection and revocation
  - runtime configuration and probing
- Added a unified adapter registry in `src/agent-adapters.ts`.
- Added adapter discovery APIs:
  - `GET /api/integrations/adapters`
  - `GET /api/integrations/adapters/:id`
- Added a shared MCP entrypoint in `integrations/mcp/server.ts`.
- Kept OpenClaw compatibility, but now sourced its metadata from the unified adapter registry.
- Added Claude and Manus connector docs/config examples under:
  - `integrations/claude/`
  - `integrations/manus/`
- Added tests for adapter registry and MCP tool discovery.
- Rewrote browser smoke coverage to follow the new multi-page navigation and system page flows.

## Validation

- `npm test`
- `npm run verify:server`
- `npm run smoke:ui`
- `node --check integrations/mcp/server.ts`
- `node --check web/pages/system.js`

## Notes

- This checkpoint focuses on local-first host compatibility. It does not add hosted MCP auth or remote connector management.
- Claude and Manus currently share the same MCP entrypoint by design; this avoids drift between host integrations.
- The console is intentionally more product-like and less backend-like, with business entry pages separated from governance and admin flows.
