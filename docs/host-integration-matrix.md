# Host Integration Matrix (v0.4.0)

This matrix is the single source of truth for host-level integration posture.

## Supported hosts

| Host | Mode | Entry | Verify command | Support level |
| --- | --- | --- | --- | --- |
| OpenClaw | Native plugin | `integrations/openclaw/index.ts` | `npm run smoke:openclaw` | `native_ready` |
| Claude | Shared MCP | `integrations/mcp/server.ts` | `npm run smoke:mcp` | `shared_mcp_beta` |
| Manus | Shared MCP | `integrations/mcp/server.ts` | `npm run smoke:mcp` | `shared_mcp_beta` |
| Cursor | Shared MCP | `integrations/mcp/server.ts` | `npm run smoke:mcp` | `shared_mcp_beta` |
| Cline | Shared MCP | `integrations/mcp/server.ts` | `npm run smoke:mcp` | `shared_mcp_beta` |
| Cherry Studio | Shared MCP | `integrations/mcp/server.ts` | `npm run smoke:mcp` | `shared_mcp_beta` |

## Core capability surface

All shared MCP hosts expose the same five tools:

- `finance_mesh_validate_packs`
- `finance_mesh_run_decision`
- `finance_mesh_replay`
- `finance_mesh_search_legal_library`
- `finance_mesh_read_audit_integrity`

Every tool must provide:

- human-readable summary in `content`
- stable `structuredContent`
- explicit `outputSchema`

## Minimum acceptance per host

1. Local setup docs exist and are current.
2. Config template exists and points to the correct entrypoint.
3. `tools/list` works for host route.
4. At least one execution tool returns structured content.
5. `npm run doctor:hosts` passes end-to-end.

## Beta boundaries

- local-first only
- no hosted connector management
- no remote auth broker
- no host-specific tool implementation forks
