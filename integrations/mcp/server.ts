import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import { AuditLedgerStore } from "../../src/audit-ledger.ts";
import { runDecision } from "../../src/engine.ts";
import { loadEventsFromPaths, loadFinancePacksFromPaths } from "../../src/fs.ts";
import { LegalLibraryStore } from "../../src/legal-library.ts";
import { runReplay } from "../../src/replay.ts";
import { validatePackCollection } from "../../src/validation.ts";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = normalizeRepoRoot(process.env.FINANCE_MESH_REPO_ROOT);
const DEFAULT_PACK_ROOTS = splitPaths(process.env.FINANCE_MESH_MCP_PACK_ROOTS || "examples/packs").map((item) =>
  path.resolve(REPO_ROOT, item),
);
const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version?: string };

const auditLedger = new AuditLedgerStore(path.join(REPO_ROOT, "data", "audit", "ledger.sqlite"));
const legalLibrary = new LegalLibraryStore(path.join(REPO_ROOT, "data", "legal-library", "library.json"));

const server = new McpServer({
  name: "zhouheng-global-finance-mesh",
  version: packageJson.version || "0.0.0",
});

server.registerTool(
  "finance_mesh_validate_packs",
  {
    title: "Validate Finance Packs",
    description: "Validate finance Pack files for metadata completeness, rollback readiness, and rule hygiene.",
    inputSchema: {
      packPaths: z.array(z.string()).optional().describe("Pack file paths or directories. Defaults to configured pack roots."),
    },
  },
  async ({ packPaths }) => {
    const roots = resolvePackPaths(packPaths);
    const loadedPacks = await loadFinancePacksFromPaths(roots, REPO_ROOT);
    const validation = validatePackCollection(loadedPacks);
    const details = {
      ...validation,
      pack_count: loadedPacks.length,
      packs: loadedPacks.map((item) => ({
        path: item.path,
        pack_id: item.pack.pack_id,
        version: item.pack.version,
      })),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    };
  },
);

server.registerTool(
  "finance_mesh_run_decision",
  {
    title: "Run Finance Decision",
    description: "Generate a Decision Packet and evidence graph snapshot from Pack files and an event payload.",
    inputSchema: {
      packPaths: z.array(z.string()).optional(),
      eventPath: z.string().optional(),
      eventPayload: z.record(z.string(), z.unknown()).optional(),
      mode: z.enum(["L0", "L1", "L2", "L3"]).optional(),
      availableEvidence: z.array(z.string()).optional(),
    },
  },
  async ({ packPaths, eventPath, eventPayload, mode, availableEvidence }) => {
    const roots = resolvePackPaths(packPaths);
    const loadedPacks = await loadFinancePacksFromPaths(roots, REPO_ROOT);
    const validation = validatePackCollection(loadedPacks);
    if (!validation.ok) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: false,
                reason: "Pack validation failed.",
                validation,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const resolvedEvent =
      eventPath && eventPath.trim()
        ? (await loadEventsFromPaths([path.resolve(REPO_ROOT, eventPath)], REPO_ROOT))[0]
        : eventPayload;

    if (!resolvedEvent) {
      throw new Error("Provide eventPath or eventPayload.");
    }

    const result = runDecision({
      request: {
        mode: mode || "L1",
        event_payload: resolvedEvent,
        available_evidence: Array.isArray(availableEvidence) ? availableEvidence : [],
      },
      packs: loadedPacks.map((item) => item.pack),
    });

    const details = {
      ok: true,
      decisionPacket: result.decisionPacket,
      evidenceGraph: result.evidenceGraph,
      matchedRules: result.matchedRules.map((item) => ({
        pack_id: item.pack.pack_id,
        rule_id: item.rule.rule_id,
        blocking_matches: item.blockingMatches.length,
        warning_matches: item.warningMatches.length,
      })),
      missingEvidence: result.missingEvidence,
      conflicts: result.conflicts,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    };
  },
);

server.registerTool(
  "finance_mesh_replay",
  {
    title: "Replay Finance Packs",
    description: "Replay historical events against baseline and candidate Pack sets before release.",
    inputSchema: {
      baselinePackPaths: z.array(z.string()).optional(),
      candidatePackPaths: z.array(z.string()).optional(),
      eventPaths: z.array(z.string()).optional(),
      events: z.array(z.record(z.string(), z.unknown())).optional(),
      mode: z.enum(["L0", "L1", "L2", "L3"]).optional(),
    },
  },
  async ({ baselinePackPaths, candidatePackPaths, eventPaths, events, mode }) => {
    const baselineRoots = resolvePackPaths(baselinePackPaths);
    const candidateRoots = resolvePackPaths(candidatePackPaths);
    const baseline = await loadFinancePacksFromPaths(baselineRoots, REPO_ROOT);
    const candidate = await loadFinancePacksFromPaths(candidateRoots, REPO_ROOT);
    const validation = validatePackCollection([...baseline, ...candidate]);

    if (!validation.ok) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: false,
                reason: "Pack validation failed.",
                validation,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const resolvedEvents =
      Array.isArray(eventPaths) && eventPaths.length > 0
        ? await loadEventsFromPaths(eventPaths.map((item) => path.resolve(REPO_ROOT, item)), REPO_ROOT)
        : events;

    if (!resolvedEvents || resolvedEvents.length === 0) {
      throw new Error("Provide eventPaths or inline events.");
    }

    const replay = runReplay({
      mode: mode || "L1",
      events: resolvedEvents,
      baselinePacks: baseline.map((item) => item.pack),
      candidatePacks: candidate.map((item) => item.pack),
    });

    return {
      content: [{ type: "text", text: JSON.stringify(replay, null, 2) }],
    };
  },
);

server.registerTool(
  "finance_mesh_search_legal_library",
  {
    title: "Search Legal Library",
    description: "Search governed legal and control-library documents for grounding and review.",
    inputSchema: {
      query: z.string().describe("Keyword or business question to search."),
      topK: z.number().int().positive().max(20).optional(),
      statuses: z.array(z.enum(["draft", "reviewed", "approved", "retired"])).optional(),
    },
  },
  async ({ query, topK, statuses }) => {
    const matches = await legalLibrary.search(query, topK || 5, {
      statuses: statuses?.length ? statuses : ["reviewed", "approved"],
    });

    const payload = {
      ok: true,
      query,
      topK: topK || 5,
      matches: matches.map((item) => ({
        id: item.document.id,
        title: item.document.title,
        jurisdiction: item.document.jurisdiction,
        status: item.document.status,
        sourceRef: item.document.sourceRef,
        score: item.score,
        excerpt: item.excerpt,
      })),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  },
);

server.registerTool(
  "finance_mesh_read_audit_integrity",
  {
    title: "Read Audit Integrity",
    description: "Read the current audit-ledger integrity state, latest verification, and export summary.",
    inputSchema: {},
  },
  async () => {
    const status = await auditLedger.getIntegrityStatus();
    return {
      content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Zhouheng Global Finance Mesh MCP server is running on stdio.");
}

main().catch((error) => {
  console.error("MCP server error:", error);
  process.exit(1);
});

function normalizeRepoRoot(value: string | undefined): string {
  if (value && value.trim()) {
    return path.resolve(value.trim());
  }
  return path.resolve(MODULE_DIR, "..", "..");
}

function splitPaths(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolvePackPaths(values: string[] | undefined): string[] {
  if (Array.isArray(values) && values.length > 0) {
    return values.map((item) => path.resolve(REPO_ROOT, item));
  }
  return DEFAULT_PACK_ROOTS;
}
