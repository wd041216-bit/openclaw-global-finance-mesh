import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AccessControlStore } from "../src/access-control.ts";

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
