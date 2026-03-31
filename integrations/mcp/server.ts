import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import { AuditLedgerStore } from "../../src/audit-ledger.ts";
import {
  buildAuditIntegrityToolResult,
  buildDecisionToolResult,
  buildDecisionValidationToolResult,
  buildLegalSearchToolResult,
  buildPackValidationToolResult,
  buildReplayToolResult,
  buildReplayValidationToolResult,
} from "../../src/agent-tool-results.ts";
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

const ValidationFindingSchema = z.object({
  severity: z.enum(["error", "warning"]),
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
});

const PackValidationOutputSchema = z.object({
  ok: z.boolean(),
  summary: z.string(),
  packCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  packs: z.array(z.object({
    path: z.string(),
    packId: z.string(),
    displayName: z.string(),
    version: z.string(),
    status: z.string(),
  })),
  errors: z.array(ValidationFindingSchema),
  warnings: z.array(ValidationFindingSchema),
});

const DecisionOutputSchema = z.object({
  ok: z.boolean(),
  summary: z.string(),
  mode: z.string(),
  eventId: z.string(),
  eventType: z.string(),
  packCount: z.number().int().nonnegative(),
  applicablePackCount: z.number().int().nonnegative(),
  riskRating: z.string(),
  confidence: z.number(),
  suggestedActions: z.array(z.string()),
  missingEvidence: z.array(z.string()),
  matchedRuleCount: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  applicablePacks: z.array(z.object({
    packId: z.string(),
    version: z.string(),
    type: z.string(),
  })),
  matchedRules: z.array(z.object({
    packId: z.string(),
    ruleId: z.string(),
    blockingMatches: z.number().int().nonnegative(),
    warningMatches: z.number().int().nonnegative(),
  })),
  evidenceGraph: z.object({
    graphRef: z.string(),
    nodeCount: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative(),
  }),
  decisionPacket: z.record(z.string(), z.unknown()),
  conflicts: z.array(z.string()),
  validation: PackValidationOutputSchema.optional(),
});

const ReplayOutputSchema = z.object({
  ok: z.boolean(),
  summary: z.string(),
  mode: z.string(),
  comparedEvents: z.number().int().nonnegative(),
  changedEvents: z.number().int().nonnegative(),
  higherRiskEvents: z.number().int().nonnegative(),
  lowerConfidenceEvents: z.number().int().nonnegative(),
  topDiffs: z.array(z.object({
    eventId: z.string(),
    changedFields: z.array(z.string()),
    baselineRisk: z.string(),
    candidateRisk: z.string(),
    candidateSummary: z.string(),
  })),
  diffs: z.array(z.record(z.string(), z.unknown())),
  validation: PackValidationOutputSchema.optional(),
});

const LegalSearchOutputSchema = z.object({
  ok: z.boolean(),
  summary: z.string(),
  query: z.string(),
  topK: z.number().int().positive(),
  matchCount: z.number().int().nonnegative(),
  matches: z.array(z.object({
    id: z.string(),
    title: z.string(),
    jurisdiction: z.string(),
    status: z.string(),
    sourceRef: z.string().optional(),
    score: z.number(),
    excerpt: z.string(),
  })),
});

const AuditIntegrityOutputSchema = z.object({
  ok: z.boolean(),
  summary: z.string(),
  status: z.string(),
  latestSequence: z.number().int().nonnegative(),
  verifiedThroughSequence: z.number().int().nonnegative(),
  mismatchCount: z.number().int().nonnegative(),
  lastVerifiedAt: z.string().optional(),
  isStale: z.boolean(),
  environment: z.string(),
  teamScope: z.string(),
  latestExportId: z.string().optional(),
  latestExportCreatedAt: z.string().optional(),
});

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
    outputSchema: PackValidationOutputSchema,
  },
  async ({ packPaths }) => {
    const roots = resolvePackPaths(packPaths);
    const loadedPacks = await loadFinancePacksFromPaths(roots, REPO_ROOT);
    const validation = validatePackCollection(loadedPacks);
    const details = buildPackValidationToolResult(validation, loadedPacks);

    return {
      content: [{ type: "text", text: details.summary }],
      structuredContent: details,
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
    outputSchema: DecisionOutputSchema,
  },
  async ({ packPaths, eventPath, eventPayload, mode, availableEvidence }) => {
    const roots = resolvePackPaths(packPaths);
    const loadedPacks = await loadFinancePacksFromPaths(roots, REPO_ROOT);
    const selectedMode = mode || "L1";
    const validation = validatePackCollection(loadedPacks);
    if (!validation.ok) {
      const details = buildDecisionValidationToolResult({
        validation,
        loadedPacks,
        mode: selectedMode,
      });
      return {
        content: [{ type: "text", text: details.summary }],
        structuredContent: details,
      };
    }

    const resolvedEvent = await resolveDecisionEvent({
      eventPath,
      eventPayload,
    });

    const result = runDecision({
      request: {
        mode: selectedMode,
        event_payload: resolvedEvent,
        available_evidence: Array.isArray(availableEvidence) ? availableEvidence : [],
      },
      packs: loadedPacks.map((item) => item.pack),
    });

    const details = buildDecisionToolResult({
      result,
      event: resolvedEvent,
      loadedPacks,
      mode: selectedMode,
    });

    return {
      content: [{ type: "text", text: details.summary }],
      structuredContent: details,
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
    outputSchema: ReplayOutputSchema,
  },
  async ({ baselinePackPaths, candidatePackPaths, eventPaths, events, mode }) => {
    const baselineRoots = resolvePackPaths(baselinePackPaths);
    const candidateRoots = resolvePackPaths(candidatePackPaths);
    const baseline = await loadFinancePacksFromPaths(baselineRoots, REPO_ROOT);
    const candidate = await loadFinancePacksFromPaths(candidateRoots, REPO_ROOT);
    const selectedMode = mode || "L1";
    const validation = validatePackCollection([...baseline, ...candidate]);

    if (!validation.ok) {
      const details = buildReplayValidationToolResult({
        validation,
        loadedPacks: [...baseline, ...candidate],
        mode: selectedMode,
      });
      return {
        content: [{ type: "text", text: details.summary }],
        structuredContent: details,
      };
    }

    const resolvedEvents = await resolveReplayEvents({
      eventPaths,
      events,
    });

    const replay = runReplay({
      mode: selectedMode,
      events: resolvedEvents,
      baselinePacks: baseline.map((item) => item.pack),
      candidatePacks: candidate.map((item) => item.pack),
    });
    const details = buildReplayToolResult({
      replay,
      mode: selectedMode,
    });

    return {
      content: [{ type: "text", text: details.summary }],
      structuredContent: details,
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
    outputSchema: LegalSearchOutputSchema,
  },
  async ({ query, topK, statuses }) => {
    const matches = await legalLibrary.search(query, topK || 5, {
      statuses: statuses?.length ? statuses : ["reviewed", "approved"],
    });
    const details = buildLegalSearchToolResult({
      query,
      topK: topK || 5,
      matches,
    });

    return {
      content: [{ type: "text", text: details.summary }],
      structuredContent: details,
    };
  },
);

server.registerTool(
  "finance_mesh_read_audit_integrity",
  {
    title: "Read Audit Integrity",
    description: "Read the current audit-ledger integrity state, latest verification, and export summary.",
    inputSchema: {},
    outputSchema: AuditIntegrityOutputSchema,
  },
  async () => {
    const status = await auditLedger.getIntegrityStatus();
    const details = buildAuditIntegrityToolResult(status);
    return {
      content: [{ type: "text", text: details.summary }],
      structuredContent: details,
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

async function resolveDecisionEvent(input: {
  eventPath?: string;
  eventPayload?: Record<string, unknown>;
}) {
  if (input.eventPath?.trim()) {
    const [event] = await loadEventsFromPaths([path.resolve(REPO_ROOT, input.eventPath)], REPO_ROOT);
    if (!event) {
      throw new Error(`No event found at ${input.eventPath}`);
    }
    return event;
  }
  if (input.eventPayload) {
    return input.eventPayload;
  }
  return readExampleEvent();
}

async function resolveReplayEvents(input: {
  eventPaths?: string[];
  events?: Array<Record<string, unknown>>;
}) {
  if (Array.isArray(input.eventPaths) && input.eventPaths.length > 0) {
    return loadEventsFromPaths(input.eventPaths.map((item) => path.resolve(REPO_ROOT, item)), REPO_ROOT);
  }
  if (Array.isArray(input.events) && input.events.length > 0) {
    return input.events;
  }
  return [await readExampleEvent()];
}

async function readExampleEvent(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await fs.readFile(path.join(REPO_ROOT, "examples", "events", "saas-annual-prepayment.json"), "utf8"),
  ) as Record<string, unknown>;
}
