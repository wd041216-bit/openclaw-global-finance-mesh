import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AccessControlStore } from "../src/access-control.ts";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "../src/auth-session-store.ts";

test("access control bootstraps an admin and authenticates bearer tokens with role checks", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-access-"));
  const configPath = path.join(tempDir, "access-control.json");
  const secretPath = path.join(tempDir, "access-control.secrets.json");

  try {
    process.env.FINANCE_MESH_BOOTSTRAP_ADMIN_NAME = "";
    process.env.FINANCE_MESH_BOOTSTRAP_ADMIN_TOKEN = "";

    const store = new AccessControlStore({ configPath, secretPath });
    const bootstrapped = await store.bootstrapAdmin({
      name: "Alice Admin",
      token: "admin-secret",
      enableAuth: true,
    });

    const config = await store.getPublicConfig();
    const session = await store.getSession({
      authorization: "Bearer admin-secret",
    });
    const allowed = await store.authorize(
      {
        authorization: "Bearer admin-secret",
      },
      "reviewer",
    );

    assert.equal(bootstrapped.role, "admin");
    assert.equal(config.enabled, true);
    assert.equal(config.bootstrapRequired, false);
    assert.equal(config.operators.length, 1);
    assert.equal(session.authenticated, true);
    assert.equal(session.actor?.name, "Alice Admin");
    assert.equal(allowed.ok, true);
  } finally {
    delete process.env.FINANCE_MESH_BOOTSTRAP_ADMIN_NAME;
    delete process.env.FINANCE_MESH_BOOTSTRAP_ADMIN_TOKEN;
  }
});

test("access control denies missing tokens and lower roles when auth is enabled", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-access-"));
  const configPath = path.join(tempDir, "access-control.json");
  const secretPath = path.join(tempDir, "access-control.secrets.json");

  try {
    process.env.FINANCE_MESH_BOOTSTRAP_ADMIN_NAME = "";
    process.env.FINANCE_MESH_BOOTSTRAP_ADMIN_TOKEN = "";

    const store = new AccessControlStore({ configPath, secretPath });
    await store.bootstrapAdmin({
      name: "Alice Admin",
      token: "admin-secret",
      enableAuth: true,
    });
    await store.createOperator({
      name: "Olivia Operator",
      role: "operator",
      token: "operator-secret",
    });

    const missing = await store.authorize({}, "viewer");
    const denied = await store.authorize(
      {
        authorization: "Bearer operator-secret",
      },
      "reviewer",
    );

    assert.deepEqual(missing, {
      ok: false,
      status: 401,
      error: "Authentication required.",
    });
    assert.deepEqual(denied, {
      ok: false,
      status: 403,
      error: "Requires reviewer role.",
    });
  } finally {
    delete process.env.FINANCE_MESH_BOOTSTRAP_ADMIN_NAME;
    delete process.env.FINANCE_MESH_BOOTSTRAP_ADMIN_TOKEN;
  }
});

test("access control mints server sessions from local tokens and enforces csrf on cookie-authenticated writes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-access-"));
  const configPath = path.join(tempDir, "access-control.json");
  const secretPath = path.join(tempDir, "access-control.secrets.json");
  const sessionPath = path.join(tempDir, "auth-sessions.sqlite");

  const store = new AccessControlStore({ configPath, secretPath, sessionPath });
  await store.bootstrapAdmin({
    name: "Alice Admin",
    token: "admin-secret",
    enableAuth: true,
  });

  const login = await store.loginWithToken("admin-secret");
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(login.currentSession.sessionId)}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(login.csrfToken)}`;
  const safeSession = await store.getSession({
    cookie,
  });
  const allowedWrite = await store.authorize(
    {
      cookie,
      "x-finance-mesh-csrf": login.csrfToken,
    },
    "admin",
    {
      method: "POST",
    },
  );
  const deniedWrite = await store.authorize(
    {
      cookie,
    },
    "viewer",
    {
      method: "POST",
    },
  );

  assert.equal(safeSession.authenticated, true);
  assert.equal(safeSession.authMethod, "token");
  assert.equal(safeSession.currentSession?.sessionId, login.currentSession.sessionId);
  assert.equal(allowedWrite.ok, true);
  assert.deepEqual(deniedWrite, {
    ok: false,
    status: 403,
    error: "A valid x-finance-mesh-csrf header is required for cookie-authenticated writes.",
  });
});

test("access control supports generic oidc subject and email bindings", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-access-"));
  const configPath = path.join(tempDir, "access-control.json");
  const secretPath = path.join(tempDir, "access-control.secrets.json");
  const sessionPath = path.join(tempDir, "auth-sessions.sqlite");
  const issuer = "https://accounts.example.com";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url === `${issuer}/.well-known/openid-configuration`) {
      return new Response(
        JSON.stringify({
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          userinfo_endpoint: `${issuer}/userinfo`,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (url === `${issuer}/token`) {
      assert.equal(init?.method, "POST");
      return new Response(
        JSON.stringify({
          access_token: "access-token",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (url === `${issuer}/userinfo`) {
      return new Response(
        JSON.stringify({
          sub: "subject-123",
          email: "reviewer@example.com",
          email_verified: true,
          name: "Riley Reviewer",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const subjectStore = new AccessControlStore({
      configPath,
      secretPath,
      sessionPath,
      oidcBaseUrl: "http://127.0.0.1:3030",
      oidcIssuer: issuer,
      oidcClientId: "client-id",
      oidcClientSecret: "client-secret",
    });
    await subjectStore.createBinding({
      label: "Finance Reviewer",
      matchType: "subject",
      role: "reviewer",
      issuer,
      subject: "subject-123",
    });

    const loginStart = await subjectStore.beginOidcLogin({
      redirectTo: "/",
    });
    const state = new URL(loginStart.location).searchParams.get("state");
    assert.ok(state);

    const oidcLogin = await subjectStore.completeOidcLogin({
      state: String(state),
      code: "valid-code",
    });

    assert.equal(oidcLogin.actor.role, "reviewer");
    assert.equal(oidcLogin.authMethod, "oidc");
    assert.equal(oidcLogin.email, "reviewer@example.com");

    const emailStore = new AccessControlStore({
      configPath: path.join(tempDir, "access-control-email.json"),
      secretPath: path.join(tempDir, "access-control-email.secrets.json"),
      sessionPath: path.join(tempDir, "auth-sessions-email.sqlite"),
      oidcBaseUrl: "http://127.0.0.1:3030",
      oidcIssuer: issuer,
      oidcClientId: "client-id",
      oidcClientSecret: "client-secret",
    });
    await emailStore.createBinding({
      label: "Finance Admin",
      matchType: "email",
      role: "admin",
      email: "reviewer@example.com",
    });

    const emailState = new URL((await emailStore.beginOidcLogin()).location).searchParams.get("state");
    const emailLogin = await emailStore.completeOidcLogin({
      state: String(emailState),
      code: "valid-code",
    });
    assert.equal(emailLogin.actor.role, "admin");

    const deniedStore = new AccessControlStore({
      configPath: path.join(tempDir, "access-control-denied.json"),
      secretPath: path.join(tempDir, "access-control-denied.secrets.json"),
      sessionPath: path.join(tempDir, "auth-sessions-denied.sqlite"),
      oidcBaseUrl: "http://127.0.0.1:3030",
      oidcIssuer: issuer,
      oidcClientId: "client-id",
      oidcClientSecret: "client-secret",
    });
    const deniedState = new URL((await deniedStore.beginOidcLogin()).location).searchParams.get("state");
    await assert.rejects(
      deniedStore.completeOidcLogin({
        state: String(deniedState),
        code: "valid-code",
      }),
      /No active identity binding matched/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
