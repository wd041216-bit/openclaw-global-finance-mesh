# Checkpoint: 2026-03-31 Enterprise Beta Identity

## What landed

- service-side auth sessions in `data/runtime/auth-sessions.sqlite`
- `HttpOnly` session cookies plus CSRF protection for browser writes
- break-glass local token login that mints server sessions instead of persisting bearer tokens in the browser
- OIDC authorization-code login with PKCE and local subject/email bindings
- admin session inspection and revoke APIs plus Access Control console support
- audit-ledger coverage for login, logout, revoke, binding create, and binding deactivation events
- README, operations docs, env examples, and GitHub repository packaging updates

## Key APIs

- `POST /api/access-control/login/token`
- `GET /api/access-control/login`
- `GET /api/access-control/callback`
- `POST /api/access-control/logout`
- `GET /api/access-control/sessions`
- `POST /api/access-control/sessions/:id/revoke`
- `POST /api/access-control/bindings`
- `POST /api/access-control/bindings/:id/deactivate`

## Runtime notes

- current identity posture is enterprise beta, not enterprise complete
- break-glass local tokens remain enabled by default
- OIDC configuration is env-driven and intentionally keeps client secrets out of the UI
- off-box audit durability, SCIM, group sync, and HA session replication remain future work

## Suggested next work

1. off-box audit backup automation
2. deployment and observability baseline
3. group mapping or SCIM-compatible identity lifecycle
