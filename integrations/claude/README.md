# Claude MCP Connector

Claude should connect to Zhouheng through the shared local MCP entrypoint at `integrations/mcp/server.ts`.

## What Claude gets

- Pack validation before finance rules are used
- Decision runs that return structured decision packets
- Replay analysis before rule changes are published
- Legal library search for grounding
- Audit integrity read access

## Local setup

1. Clone this repository to your machine.
2. Confirm `node integrations/mcp/server.ts` starts without errors.
3. Register a stdio MCP server in Claude using the example config below.
4. Point `FINANCE_MESH_REPO_ROOT` at the repository root.

## Example config

See `integrations/claude/claude.mcp.config.example.json`.

## Verification

1. List tools and confirm all five `finance_mesh_*` tools appear.
2. Run `finance_mesh_read_audit_integrity`.
3. Run `finance_mesh_search_legal_library` with a simple keyword.
