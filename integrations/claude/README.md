# Claude MCP Connector

Claude should connect to Zhouheng through the shared local MCP entrypoint at `integrations/mcp/server.ts`.

## What Claude gets

- Pack validation before finance rules are used
- Decision runs that return summary text plus structured decision packets
- Replay analysis before rule changes are published
- Legal library search for grounding
- Audit integrity read access

## Local setup

1. Clone this repository to your machine.
2. Confirm `node integrations/mcp/server.ts` starts without errors.
3. Register a stdio MCP server in Claude using the example config below.
4. Point `FINANCE_MESH_REPO_ROOT` at the repository root.
5. Reuse the shared MCP entrypoint instead of creating a Claude-only server.

## Start command

```bash
npm run mcp:serve
```

## Example config

See `integrations/claude/claude.mcp.config.example.json`.

## Verification

1. Run `npm run smoke:mcp`.
2. List tools in Claude and confirm all five `finance_mesh_*` tools appear.
3. Run `finance_mesh_run_decision` and confirm Claude can read `structuredContent.summary`.
4. Run `finance_mesh_search_legal_library` with a simple keyword.

## Minimum acceptance

- Claude can spawn the shared MCP entrypoint
- `tools/list` returns all five `finance_mesh_*` tools
- `finance_mesh_run_decision` returns summary text plus structured content
- `finance_mesh_search_legal_library` returns structured legal results
- `npm run doctor:hosts` completes without failures

## Common failures

- If Claude cannot start the connector, run `npm run mcp:serve` directly in Terminal first.
- If the connector starts but returns empty finance data, confirm `FINANCE_MESH_REPO_ROOT` points at the actual repository root.
- If tool discovery works but execution fails, verify `FINANCE_MESH_MCP_PACK_ROOTS` still points at `examples/packs` or your real Pack directory.
- If Claude only shows text output, restart the MCP server after updating the repo so the latest `outputSchema` and `structuredContent` contracts are active.

## Verified scope vs beta scope

- Verified now: local stdio setup, shared MCP contract, tool discovery, structured decision output, structured legal search, unified host doctor
- Still beta: remote hosted connector management, host-managed auth, and any Claude-specific workflow beyond shared MCP transport
