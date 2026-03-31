# Zhouheng MCP Connector

`integrations/mcp/server.ts` exposes Zhouheng Global Finance Mesh as a local-first stdio MCP server.

## What it exposes

- `finance_mesh_validate_packs`
- `finance_mesh_run_decision`
- `finance_mesh_replay`
- `finance_mesh_search_legal_library`
- `finance_mesh_read_audit_integrity`

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

## Expected usage

This connector is intended to be spawned by local MCP-aware hosts such as Claude or Manus. It does not manage remote auth or hosted sessions in this layer.
