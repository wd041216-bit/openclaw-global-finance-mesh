# Zhouheng MCP Connector

`integrations/mcp/server.ts` exposes Zhouheng Global Finance Mesh as a local-first stdio MCP server.

## What it exposes

- `finance_mesh_validate_packs`
- `finance_mesh_run_decision`
- `finance_mesh_replay`
- `finance_mesh_search_legal_library`
- `finance_mesh_read_audit_integrity`

All five tools now return:

- a short human-readable summary in `content`
- stable `structuredContent`
- an explicit `outputSchema`

## Start locally

```bash
npm run mcp:serve
```

Or run it directly:

```bash
node integrations/mcp/server.ts
```

## Environment variables

- `FINANCE_MESH_REPO_ROOT`
  - Absolute path to this repository.
- `FINANCE_MESH_MCP_PACK_ROOTS`
  - Comma-separated pack roots relative to the repo root.
  - Default: `examples/packs`

## Verify locally

```bash
npm run smoke:mcp
```

This smoke verifies:

1. `tools/list` shows all five `finance_mesh_*` tools.
2. `finance_mesh_run_decision` returns structured decision data.
3. `finance_mesh_search_legal_library` returns structured legal-search data.

## Expected usage

This connector is intended to be spawned by local MCP-aware hosts such as Claude or Manus. It does not manage remote auth or hosted sessions in this layer.

## Common failures

- If the server fails to start, confirm `FINANCE_MESH_REPO_ROOT` points at the repository root, not `integrations/mcp/`.
- If tools list correctly but return empty data, confirm `examples/packs/`, `examples/events/`, and `data/legal-library/library.json` exist under the chosen repo root.
- If a host only shows raw text, update to the current repo version and restart the MCP server so the structured contracts are re-registered.
