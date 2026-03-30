# Identity Operations

## Purpose

This guide covers the enterprise beta identity baseline: bootstrap admin, break-glass local login, OIDC setup, identity bindings, session revoke, and cookie/CSRF troubleshooting.

## Environment settings

- `FINANCE_MESH_AUTH_ENABLED`: turn role checks on or off.
- `FINANCE_MESH_ALLOW_LOCAL_TOKENS`: keep break-glass local tokens available. Default `true`.
- `FINANCE_MESH_BOOTSTRAP_ADMIN_NAME`: optional first admin name.
- `FINANCE_MESH_BOOTSTRAP_ADMIN_TOKEN`: optional first admin token.
- `FINANCE_MESH_BASE_URL`: externally reachable base URL for OIDC redirects.
- `FINANCE_MESH_OIDC_ISSUER`: OIDC issuer used for discovery.
- `FINANCE_MESH_OIDC_CLIENT_ID`: OIDC client id.
- `FINANCE_MESH_OIDC_CLIENT_SECRET`: OIDC client secret.
- `FINANCE_MESH_OIDC_SCOPES`: scopes passed to the provider. Default `openid profile email`.
- `FINANCE_MESH_OIDC_REDIRECT_PATH`: callback path. Default `/api/access-control/callback`.
- `FINANCE_MESH_COOKIE_SECURE`: force `Secure` cookie behavior with `true` or `false`. If empty, localhost stays insecure and remote hosts use secure cookies.

## Recommended startup modes

### Break-glass + OIDC hybrid

Use this for the current enterprise beta baseline.

```bash
export FINANCE_MESH_AUTH_ENABLED=true
export FINANCE_MESH_ALLOW_LOCAL_TOKENS=true
export FINANCE_MESH_BASE_URL=https://finance-mesh.example.com
export FINANCE_MESH_OIDC_ISSUER=https://id.example.com
export FINANCE_MESH_OIDC_CLIENT_ID=finance-mesh-console
export FINANCE_MESH_OIDC_CLIENT_SECRET=replace_me
npm run dev
```

### Local-only bootstrap or recovery

Use this when the identity provider is not yet wired or is temporarily unavailable.

```bash
export FINANCE_MESH_AUTH_ENABLED=true
export FINANCE_MESH_ALLOW_LOCAL_TOKENS=true
export FINANCE_MESH_BOOTSTRAP_ADMIN_NAME="Finance Platform Admin"
export FINANCE_MESH_BOOTSTRAP_ADMIN_TOKEN="change-me"
npm run dev
```

### OIDC-first mode

Use this when local break-glass tokens should not be exposed in the browser workflow.

```bash
export FINANCE_MESH_AUTH_ENABLED=true
export FINANCE_MESH_ALLOW_LOCAL_TOKENS=false
export FINANCE_MESH_BASE_URL=https://finance-mesh.example.com
export FINANCE_MESH_OIDC_ISSUER=https://id.example.com
export FINANCE_MESH_OIDC_CLIENT_ID=finance-mesh-console
export FINANCE_MESH_OIDC_CLIENT_SECRET=replace_me
npm run dev
```

## Bootstrap flow

1. Start the service with `FINANCE_MESH_AUTH_ENABLED=true`.
2. If no admin exists, use the Access Control bootstrap form or the `FINANCE_MESH_BOOTSTRAP_ADMIN_*` env vars.
3. The bootstrap action now creates the admin and immediately mints a server session.
4. Use that admin session to create more local operators or OIDC bindings.

## Break-glass local login

1. Open the Access Control panel.
2. Submit a local operator token through `Login With Local Token`.
3. The server validates the token, creates a session in `data/runtime/auth-sessions.sqlite`, and sets:
   - `finance_mesh_session` as an `HttpOnly` cookie
   - `finance_mesh_csrf` as a readable cookie for browser writes
4. Browser writes must send `x-finance-mesh-csrf` with the same token value.

## OIDC login flow

1. Set the OIDC env vars and restart the service.
2. As an admin, create one or more identity bindings:
   - subject binding: exact `issuer + subject`
   - email binding: verified email claim only
3. Click `Continue With SSO`.
4. The server performs discovery, starts authorization-code login with PKCE, validates the callback, resolves the binding, and mints a server session.
5. If no active binding matches, the login is rejected and the UI returns with an `authError` message.

## Session inspection and revoke

- Admins can inspect `GET /api/access-control/sessions`.
- Admins can revoke with `POST /api/access-control/sessions/:id/revoke`.
- Logout revokes the current session with `POST /api/access-control/logout`.
- Session activity is written into the audit ledger as `access.login_token`, `access.login_oidc`, `access.logout`, and `access.revoke_session`.

## Binding management

- Admins can create bindings with `POST /api/access-control/bindings`.
- Admins can deactivate bindings with `POST /api/access-control/bindings/:id/deactivate`.
- Binding actions are written into the audit ledger and operator activity stream.

## Troubleshooting

### CSRF failures

- Symptom: write requests return `403` with a CSRF error.
- Check that the browser has a fresh `finance_mesh_csrf` cookie.
- Check that the frontend or client sends `x-finance-mesh-csrf`.
- If a restored environment carried stale cookies, log out and log back in.

### Cookies not sticking

- Check `FINANCE_MESH_COOKIE_SECURE`.
- If testing on localhost, leave it empty or set it to `false`.
- If testing behind HTTPS, set the public host in `FINANCE_MESH_BASE_URL` and allow secure cookies.

### OIDC callback failures

- Check `FINANCE_MESH_BASE_URL` and `FINANCE_MESH_OIDC_REDIRECT_PATH`.
- Confirm the provider redirect URI exactly matches the callback URL.
- Confirm discovery works from the running service host.
- Confirm an active subject or verified-email binding exists for the user.
