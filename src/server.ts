import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AccessControlStore, isAccessRole } from "./access-control.ts";
import { OperatorActivityStore } from "./activity-store.ts";
import { AuditRunStore } from "./audit-store.ts";
import { OllamaBrainRuntime } from "./brain.ts";
import { runDecision } from "./engine.ts";
import { loadFinancePacksFromPaths } from "./fs.ts";
import { LegalLibraryStore } from "./legal-library.ts";
import { runReplay } from "./replay.ts";
import { RuntimeConfigStore } from "./runtime-config.ts";
import { validatePackCollection } from "./validation.ts";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
const WEB_ROOT = path.join(REPO_ROOT, "web");
const PORT = Number(process.env.FINANCE_MESH_PORT || 3030);

const runtimeStore = new RuntimeConfigStore();
const brain = new OllamaBrainRuntime();
const legalLibrary = new LegalLibraryStore();
const auditRuns = new AuditRunStore();
const accessControl = new AccessControlStore();
const operatorActivity = new OperatorActivityStore();

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, requestUrl);
      return;
    }

    await serveStatic(requestUrl.pathname, res);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  console.log(`Zhouheng Global Finance Mesh UI running at http://127.0.0.1:${PORT}`);
});

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, requestUrl: URL): Promise<void> {
  if (req.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "zhouheng-global-finance-mesh" });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/access-control") {
    sendJson(res, 200, {
      ok: true,
      config: await accessControl.getPublicConfig(),
      session: await accessControl.getSession(req.headers),
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/access-control/bootstrap") {
    const body = await readJsonBody(req);
    const operator = await accessControl.bootstrapAdmin({
      name: String(body.name ?? ""),
      token: String(body.token ?? ""),
      enableAuth: body.enableAuth !== false,
    });
    const config = await accessControl.getPublicConfig();
    const actor = actorFromOperator(operator);
    await operatorActivity.record({
      action: "access.bootstrap_admin",
      actor,
      subject: operator.name,
      message: `Bootstrapped admin ${operator.name} and ${config.enabled ? "enabled" : "left disabled"} authentication.`,
      detail: {
        operator,
        config,
      },
    });
    const session = await accessControl.getSession({
      authorization: `Bearer ${String(body.token ?? "")}`,
    });
    sendJson(res, 200, {
      ok: true,
      operator,
      config,
      session,
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/access-control/config") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }

    const body = await readJsonBody(req);
    const previousConfig = await accessControl.getPublicConfig();
    const config = await accessControl.updateConfig({
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });
    await operatorActivity.record({
      action: "access.update_config",
      actor: auth.actor,
      subject: "access-control",
      message: `${config.enabled ? "Enabled" : "Disabled"} authentication and role enforcement.`,
      detail: {
        before: previousConfig,
        after: config,
      },
    });
    sendJson(res, 200, {
      ok: true,
      config,
      actor: auth.actor,
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/access-control/operators") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }

    const body = await readJsonBody(req);
    if (!isAccessRole(body.role)) {
      sendJson(res, 400, { ok: false, error: "Invalid operator role." });
      return;
    }

    const operator = await accessControl.createOperator({
      name: String(body.name ?? ""),
      role: body.role,
      token: String(body.token ?? ""),
      active: body.active !== false,
    });
    const config = await accessControl.getPublicConfig();
    await operatorActivity.record({
      action: "access.create_operator",
      actor: auth.actor,
      subject: operator.name,
      message: `Issued ${operator.role} access for ${operator.name}.`,
      detail: {
        operator,
        activeOperatorCount: config.operators.length,
      },
    });
    sendJson(res, 200, {
      ok: true,
      operator,
      config,
      actor: auth.actor,
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/runtime/config") {
    const auth = await requireRole(req, res, "viewer");
    if (!auth) {
      return;
    }
    sendJson(res, 200, { ok: true, config: await runtimeStore.getPublic() });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/runtime/config") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }
    const body = await readJsonBody(req);
    const previousConfig = await runtimeStore.getPublic();
    const config = await runtimeStore.update({
      mode: body.mode,
      model: body.model,
      localBaseUrl: body.localBaseUrl,
      cloudBaseUrl: body.cloudBaseUrl,
      apiKey: body.apiKey,
      temperature: body.temperature,
      systemPrompt: body.systemPrompt,
      persistSecret: body.persistSecret === true,
    });
    await operatorActivity.record({
      action: "runtime.update_config",
      actor: auth.actor,
      subject: config.model,
      message: `Updated brain runtime to ${config.mode} mode with model ${config.model}.`,
      detail: {
        before: previousConfig,
        after: config,
        persistedSecret: body.persistSecret === true,
      },
    });
    sendJson(res, 200, { ok: true, config });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/runtime/models") {
    const auth = await requireRole(req, res, "operator");
    if (!auth) {
      return;
    }
    const config = await runtimeStore.get();
    const models = await brain.listModels(config);
    sendJson(res, 200, { ok: true, models });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/runtime/probe") {
    const auth = await requireRole(req, res, "operator");
    if (!auth) {
      return;
    }
    const config = await runtimeStore.get();
    const probe = await brain.probe(config);
    const configSnapshot = toRuntimeConfigSnapshot(config);
    const auditRun = await auditRuns.recordProbe({
      config: configSnapshot,
      probe,
      actor: auth.actor,
    });
    await operatorActivity.record({
      action: "runtime.probe",
      outcome: probe.ok ? "success" : "failure",
      actor: auth.actor,
      subject: config.model,
      message: buildProbeActivityMessage(probe, config.model),
      relatedRunId: auditRun.id,
      detail: {
        config: configSnapshot,
        probe,
      },
    });
    sendJson(res, 200, { ok: true, probe, auditRun });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/chat") {
    const auth = await requireRole(req, res, "operator");
    if (!auth) {
      return;
    }
    const body = await readJsonBody(req);
    const config = await runtimeStore.get();
    const userPrompt = String(body.prompt ?? "").trim();
    if (!userPrompt) {
      sendJson(res, 400, { ok: false, error: "prompt is required" });
      return;
    }

    const useLegalLibrary = body.useLegalLibrary !== false;
    const legalContext = useLegalLibrary ? await legalLibrary.buildContext(userPrompt, 4) : { context: "", citations: [] };
    const messages = [
      {
        role: "system" as const,
        content:
          `${config.systemPrompt}\n\nWhen legal context is provided, cite it explicitly and note if the library is incomplete.`,
      },
      ...(legalContext.context
        ? [
            {
              role: "system" as const,
              content: `Legal Library Context:\n${legalContext.context}`,
            },
          ]
        : []),
      {
        role: "user" as const,
        content: userPrompt,
      },
    ];

    const result = await brain.chat(config, messages);
    sendJson(res, 200, {
      ok: true,
      reply: result.content,
      model: result.model,
      provider: result.provider,
      citations: legalContext.citations,
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/legal-library/documents") {
    const auth = await requireRole(req, res, "viewer");
    if (!auth) {
      return;
    }
    sendJson(res, 200, { ok: true, documents: await legalLibrary.listDocuments() });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/legal-library/search") {
    const auth = await requireRole(req, res, "viewer");
    if (!auth) {
      return;
    }
    const query = requestUrl.searchParams.get("q") || "";
    const includeDrafts = requestUrl.searchParams.get("includeDrafts") === "true";
    sendJson(res, 200, {
      ok: true,
      results: await legalLibrary.search(query, 8, {
        statuses: includeDrafts ? undefined : ["reviewed", "approved"],
      }),
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/legal-library/documents") {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }
    const body = await readJsonBody(req);
    const document = await legalLibrary.createDocument({
      title: String(body.title ?? ""),
      jurisdiction: typeof body.jurisdiction === "string" ? body.jurisdiction : undefined,
      domain: typeof body.domain === "string" ? body.domain : undefined,
      sourceType: typeof body.sourceType === "string" ? body.sourceType : undefined,
      sourceRef: typeof body.sourceRef === "string" ? body.sourceRef : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      summary: typeof body.summary === "string" ? body.summary : undefined,
      body: String(body.body ?? ""),
    });
    await operatorActivity.record({
      action: "legal_library.create_document",
      actor: auth.actor,
      subject: document.id,
      message: `Created legal document ${document.id} in ${document.status} state.`,
      detail: {
        document,
      },
    });
    sendJson(res, 200, { ok: true, document });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/legal-library/ingest") {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }
    const body = await readJsonBody(req);
    const document = await legalLibrary.ingest({
      title: typeof body.title === "string" ? body.title : undefined,
      jurisdiction: typeof body.jurisdiction === "string" ? body.jurisdiction : undefined,
      domain: typeof body.domain === "string" ? body.domain : undefined,
      sourceType: typeof body.sourceType === "string" ? body.sourceType : undefined,
      sourceRef: typeof body.sourceRef === "string" ? body.sourceRef : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
      url: typeof body.url === "string" ? body.url : undefined,
      filePath: typeof body.filePath === "string" ? body.filePath : undefined,
    });
    await operatorActivity.record({
      action: "legal_library.ingest",
      actor: auth.actor,
      subject: document.id,
      message: `Ingested legal source ${document.id} from ${document.sourceType}.`,
      detail: {
        document,
      },
    });
    sendJson(res, 200, { ok: true, document });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname.startsWith("/api/legal-library/documents/") && requestUrl.pathname.endsWith("/status")) {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }

    const documentId = requestUrl.pathname
      .slice("/api/legal-library/documents/".length, -"/status".length)
      .trim();
    if (!documentId) {
      sendJson(res, 400, { ok: false, error: "Document id is required." });
      return;
    }

    const body = await readJsonBody(req);
    const status = body.status;
    if (status !== "draft" && status !== "reviewed" && status !== "approved" && status !== "retired") {
      sendJson(res, 400, { ok: false, error: "Invalid document status." });
      return;
    }

    const previousDocument = (await legalLibrary.listDocuments()).find((item) => item.id === documentId) ?? null;
    const document = await legalLibrary.updateStatus(documentId, status, auth.actor?.name);
    await operatorActivity.record({
      action: "legal_library.update_status",
      actor: auth.actor,
      subject: document.id,
      message: `Moved legal document ${document.id} from ${previousDocument?.status ?? "unknown"} to ${document.status}.`,
      detail: {
        before: previousDocument,
        after: document,
      },
    });
    sendJson(res, 200, { ok: true, document, actor: auth.actor });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/decision/run") {
    const auth = await requireRole(req, res, "operator");
    if (!auth) {
      return;
    }
    const body = await readJsonBody(req);
    const packPaths = normalizePackPaths(body.packPaths);
    const loadedPacks = await loadFinancePacksFromPaths(packPaths, REPO_ROOT);
    const validation = validatePackCollection(loadedPacks);
    if (!validation.ok) {
      sendJson(res, 400, { ok: false, validation });
      return;
    }

    const eventPayload =
      body.eventPayload ??
      JSON.parse(
        await fs.readFile(path.join(REPO_ROOT, "examples", "events", "saas-annual-prepayment.json"), "utf8"),
      );
    const mode = normalizeMode(body.mode);
    const result = runDecision({
      request: {
        mode,
        event_payload: eventPayload,
      },
      packs: loadedPacks.map((item) => item.pack),
    });
    const auditRun = await auditRuns.recordDecision({
      mode,
      packPaths,
      event: eventPayload,
      result,
      actor: auth.actor,
    });
    await operatorActivity.record({
      action: "decision.run",
      actor: auth.actor,
      subject: eventPayload.event_id,
      message: `Ran decision for ${eventPayload.event_type} with ${result.decisionPacket.risk_rating} risk output.`,
      relatedRunId: auditRun.id,
      detail: {
        eventId: eventPayload.event_id,
        eventType: eventPayload.event_type,
        decisionPacketId: result.decisionPacket.decision_packet_id,
        riskRating: result.decisionPacket.risk_rating,
        confidence: result.decisionPacket.confidence,
      },
    });

    sendJson(res, 200, { ok: true, decision: result, auditRun });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/replay/run") {
    const auth = await requireRole(req, res, "operator");
    if (!auth) {
      return;
    }
    const body = await readJsonBody(req);
    const baselinePackPaths = normalizePackPaths(body.baselinePackPaths);
    const candidatePackPaths = normalizePackPaths(body.candidatePackPaths);
    const [baseline, candidate] = await Promise.all([
      loadFinancePacksFromPaths(baselinePackPaths, REPO_ROOT),
      loadFinancePacksFromPaths(candidatePackPaths, REPO_ROOT),
    ]);
    const validation = validatePackCollection([...baseline, ...candidate]);
    if (!validation.ok) {
      sendJson(res, 400, { ok: false, validation });
      return;
    }

    const exampleEvent = JSON.parse(
      await fs.readFile(path.join(REPO_ROOT, "examples", "events", "saas-annual-prepayment.json"), "utf8"),
    );
    const mode = normalizeMode(body.mode);
    const events =
      Array.isArray(body.events) && body.events.length > 0
        ? body.events
        : [exampleEvent];
    const replay = runReplay({
      mode,
      baselinePacks: baseline.map((item) => item.pack),
      candidatePacks: candidate.map((item) => item.pack),
      events,
    });
    const auditRun = await auditRuns.recordReplay({
      mode,
      baselinePackPaths,
      candidatePackPaths,
      events,
      replay,
      actor: auth.actor,
    });
    await operatorActivity.record({
      action: "replay.run",
      actor: auth.actor,
      subject: `${events.length} events`,
      message: `Ran replay across ${events.length} events with ${replay.changed_events} changed outcomes.`,
      relatedRunId: auditRun.id,
      detail: {
        comparedEvents: replay.compared_events,
        changedEvents: replay.changed_events,
        higherRiskEvents: replay.higher_risk_events,
        lowerConfidenceEvents: replay.lower_confidence_events,
      },
    });
    sendJson(res, 200, { ok: true, replay, auditRun });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/audit/runs") {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }
    const limit = Number(requestUrl.searchParams.get("limit") || 12);
    sendJson(res, 200, {
      ok: true,
      runs: await auditRuns.list(Number.isFinite(limit) ? limit : 12, {
        types: ["decision", "replay"],
      }),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/api/audit/runs/")) {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }
    const id = requestUrl.pathname.slice("/api/audit/runs/".length).trim();
    if (!id) {
      sendJson(res, 400, { ok: false, error: "run id is required" });
      return;
    }

    const record = await auditRuns.get(id);
    if (!record || record.type === "probe") {
      sendJson(res, 404, { ok: false, error: "Audit run not found" });
      return;
    }

    sendJson(res, 200, { ok: true, run: record });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/runtime/probes") {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }
    const limit = Number(requestUrl.searchParams.get("limit") || 12);
    sendJson(res, 200, {
      ok: true,
      runs: await auditRuns.list(Number.isFinite(limit) ? limit : 12, {
        types: ["probe"],
      }),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/api/runtime/probes/")) {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }
    const id = requestUrl.pathname.slice("/api/runtime/probes/".length).trim();
    if (!id) {
      sendJson(res, 400, { ok: false, error: "probe id is required" });
      return;
    }

    const record = await auditRuns.get(id);
    if (!record || record.type !== "probe") {
      sendJson(res, 404, { ok: false, error: "Probe run not found" });
      return;
    }

    sendJson(res, 200, { ok: true, run: record });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/access-control/activity") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }
    const limit = Number(requestUrl.searchParams.get("limit") || 20);
    sendJson(res, 200, {
      ok: true,
      events: await operatorActivity.list(Number.isFinite(limit) ? limit : 20),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/api/access-control/activity/")) {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }
    const id = requestUrl.pathname.slice("/api/access-control/activity/".length).trim();
    if (!id) {
      sendJson(res, 400, { ok: false, error: "activity id is required" });
      return;
    }

    const event = await operatorActivity.get(id);
    if (!event) {
      sendJson(res, 404, { ok: false, error: "Activity event not found" });
      return;
    }

    sendJson(res, 200, { ok: true, event });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

async function serveStatic(requestPath: string, res: http.ServerResponse): Promise<void> {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const safeRelativePath = path
    .normalize(normalizedPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(WEB_ROOT, safeRelativePath);

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
    });
    res.end(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const fallback = await fs.readFile(path.join(WEB_ROOT, "index.html"));
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
      });
      res.end(fallback);
      return;
    }
    throw error;
  }
}

function normalizePackPaths(value: unknown): string[] {
  if (Array.isArray(value) && value.length > 0) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return [path.join("examples", "packs")];
}

function normalizeMode(value: unknown): "L0" | "L1" | "L2" | "L3" {
  if (value === "L0" || value === "L2" || value === "L3") {
    return value;
  }
  return "L1";
}

async function requireRole(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  role: "viewer" | "operator" | "reviewer" | "admin",
): Promise<{ actor: import("./access-control.ts").AuthenticatedActor | null } | null> {
  const auth = await accessControl.authorize(req.headers, role);
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error });
    return null;
  }
  return {
    actor: auth.actor,
  };
}

function actorFromOperator(operator: { id: string; name: string; role: "viewer" | "operator" | "reviewer" | "admin" }) {
  return {
    id: operator.id,
    name: operator.name,
    role: operator.role,
  };
}

function toRuntimeConfigSnapshot(config: Awaited<ReturnType<RuntimeConfigStore["get"]>>) {
  return {
    mode: config.mode,
    model: config.model,
    localBaseUrl: config.localBaseUrl,
    cloudBaseUrl: config.cloudBaseUrl,
    hasApiKey: Boolean(config.apiKey),
  };
}

function buildProbeActivityMessage(
  probe: import("./brain.ts").BrainProbeResult,
  model: string,
): string {
  if (probe.ok) {
    return `Probe succeeded for ${probe.mode} runtime using ${model}.`;
  }
  if (probe.listModelsOk && !probe.inferenceOk) {
    return `Probe reached ${probe.mode} runtime for ${model}, but inference failed.`;
  }
  return `Probe failed to reach ${probe.mode} runtime for ${model}.`;
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  return "text/html; charset=utf-8";
}
