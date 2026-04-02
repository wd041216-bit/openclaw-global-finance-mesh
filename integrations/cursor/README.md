# Cursor MCP Connector

Cursor should connect to Zhouheng through the shared local MCP entrypoint at `integrations/mcp/server.ts`.

## What Cursor gets

- Pack validation before finance rules are used
- Decision runs with summary text plus structured content
- Replay analysis before rule changes are published
- Legal library search for grounding
- Audit integrity read access

## Local setup

1. Clone this repository to your machine.
2. Confirm `npm run mcp:serve` starts without errors.
3. Register a stdio MCP server in Cursor using the example config below.
4. Point `FINANCE_MESH_REPO_ROOT` at the repository root.
5. Reuse the shared MCP entrypoint instead of creating a Cursor-only server.

## Start command

```bash
npm run mcp:serve
```

## Example config

See `integrations/cursor/cursor.mcp.config.example.json`.

## Verification

1. Run `npm run smoke:mcp`.
2. List tools in Cursor and confirm all five `finance_mesh_*` tools appear.
3. Run `finance_mesh_run_decision` and confirm `structuredContent` is returned.
4. Run `finance_mesh_search_legal_library` with a simple keyword.

## Minimum acceptance

- Cursor can spawn the shared MCP entrypoint
- `tools/list` returns all five `finance_mesh_*` tools
- `finance_mesh_run_decision` returns summary text plus structured content
- `finance_mesh_search_legal_library` returns structured legal results
- `npm run doctor:hosts` completes without failures

## Common failures

- If Cursor cannot start the connector, run `npm run mcp:serve` directly in Terminal first.
- If the connector starts but returns empty finance data, confirm `FINANCE_MESH_REPO_ROOT` points at the real repository root.
- If tool discovery works but execution fails, verify `FINANCE_MESH_MCP_PACK_ROOTS` still points at `examples/packs` or your real Pack directory.
- If Cursor only shows text output, restart the MCP server after updating the repo so the latest contracts are active.

## Verified scope vs beta scope

- Verified now: local stdio setup, shared MCP contract, tool discovery, structured decision output, structured legal search, unified host doctor
- Still beta: hosted connector management, host-managed auth, and Cursor-specific workflow features beyond shared MCP transport
