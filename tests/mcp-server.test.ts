import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");

test("shared MCP server exposes the expected Zhouheng finance tools", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-mcp-"));
  await fs.mkdir(path.join(fixtureRoot, "examples"), { recursive: true });
  await fs.mkdir(path.join(fixtureRoot, "data", "legal-library"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "examples", "packs"), path.join(fixtureRoot, "examples", "packs"), {
    recursive: true,
    force: true,
  });
  await fs.cp(
    path.join(REPO_ROOT, "data", "legal-library", "library.json"),
    path.join(fixtureRoot, "data", "legal-library", "library.json"),
    {
      force: true,
    },
  );

  const client = new Client(
    {
      name: "finance-mesh-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["integrations/mcp/server.ts"],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      FINANCE_MESH_REPO_ROOT: fixtureRoot,
      FINANCE_MESH_MCP_PACK_ROOTS: "examples/packs",
    },
    stderr: "pipe",
  });

  try {
    await client.connect(transport);
    const toolList = await client.listTools();
    const toolNames = toolList.tools.map((item) => item.name).sort();

    assert.deepEqual(toolNames, [
      "finance_mesh_read_audit_integrity",
      "finance_mesh_replay",
      "finance_mesh_run_decision",
      "finance_mesh_search_legal_library",
      "finance_mesh_validate_packs",
    ]);

    const integrity = await client.callTool({
      name: "finance_mesh_read_audit_integrity",
      arguments: {},
    });

    const textBlock = integrity.content.find((item) => item.type === "text");
    assert.ok(textBlock);
    assert.match(textBlock.text, /"status"/);
  } finally {
    await client.close();
    await transport.close();
  }
});
