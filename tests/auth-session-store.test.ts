import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AuthSessionStore, CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "../src/auth-session-store.ts";

test("auth session store issues cookie sessions and enforces csrf on writes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-session-"));
  const store = new AuthSessionStore({
    dbPath: path.join(tempDir, "auth-sessions.sqlite"),
  });

  const issued = await store.issueSession({
    authMethod: "token",
    actor: {
      id: "admin-1",
      name: "Alice Admin",
      role: "admin",
    },
  });
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(issued.session.sessionId)}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(issued.csrfToken)}`;

  const safeRead = await store.resolveSession({
    cookie,
  });
  const deniedWrite = await store.resolveSession(
    {
      cookie,
    },
    {
      method: "POST",
    },
  );
  const allowedWrite = await store.resolveSession(
    {
      cookie,
      "x-finance-mesh-csrf": issued.csrfToken,
    },
    {
      method: "POST",
    },
  );

  assert.equal(safeRead.status, "ok");
  assert.equal(safeRead.status === "ok" ? safeRead.session.actor.name : "", "Alice Admin");
  assert.deepEqual(deniedWrite, {
    status: "error",
    statusCode: 403,
    error: "A valid x-finance-mesh-csrf header is required for cookie-authenticated writes.",
  });
  assert.equal(allowedWrite.status, "ok");
});

test("auth session store clears revoked or expired sessions", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-session-"));
  const dbPath = path.join(tempDir, "auth-sessions.sqlite");
  const store = new AuthSessionStore({ dbPath });

  const issued = await store.issueSession({
    authMethod: "token",
    actor: {
      id: "operator-1",
      name: "Olivia Operator",
      role: "operator",
    },
  });
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(issued.session.sessionId)}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(issued.csrfToken)}`;

  await store.revokeSession(issued.session.sessionId);
  const revoked = await store.resolveSession({
    cookie,
  });
  assert.deepEqual(revoked, {
    status: "none",
    clearCookies: true,
  });

  const second = await store.issueSession({
    authMethod: "token",
    actor: {
      id: "reviewer-1",
      name: "Riley Reviewer",
      role: "reviewer",
    },
  });
  const db = new DatabaseSync(dbPath);
  db.prepare(`
    UPDATE auth_sessions
    SET expires_at = ?, absolute_expires_at = ?
    WHERE session_id = ?
  `).run("2000-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z", second.session.sessionId);
  db.close();

  const expiredCookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(second.session.sessionId)}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(second.csrfToken)}`;
  const expired = await store.resolveSession({
    cookie: expiredCookie,
  });
  assert.deepEqual(expired, {
    status: "none",
    clearCookies: true,
  });
});
