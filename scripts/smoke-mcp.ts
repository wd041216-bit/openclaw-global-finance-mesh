import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

async function main() {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-mcp-smoke-"));
  await fs.mkdir(path.join(fixtureRoot, "examples"), { recursive: true });
  await fs.mkdir(path.join(fixtureRoot, "data", "legal-library"), { recursive: true });
  await fs.mkdir(path.join(fixtureRoot, "data", "audit"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "examples", "packs"), path.join(fixtureRoot, "examples", "packs"), {
    recursive: true,
    force: true,
  });
  await fs.cp(path.join(REPO_ROOT, "examples", "events"), path.join(fixtureRoot, "examples", "events"), {
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
      name: "finance-mesh-smoke-client",
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
    assert.equal(toolList.tools.length, 5);

    const decision = await client.callTool({
      name: "finance_mesh_run_decision",
      arguments: {},
    });
    assert.ok(decision.structuredContent);
    assert.equal(decision.structuredContent.ok, true);
    assert.equal(typeof decision.structuredContent.summary, "string");

    const legalSearch = await client.callTool({
      name: "finance_mesh_search_legal_library",
      arguments: {
        query: "VAT",
        topK: 3,
      },
    });
    assert.ok(legalSearch.structuredContent);
    assert.equal(legalSearch.structuredContent.query, "VAT");
    assert.equal(typeof legalSearch.structuredContent.matchCount, "number");

    console.log("MCP smoke completed successfully.");
  } finally {
    await client.close();
    await transport.close();
  }
}

await main();
