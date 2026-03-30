import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

  if (req.method === "GET" && requestUrl.pathname === "/api/runtime/config") {
    sendJson(res, 200, { ok: true, config: await runtimeStore.getPublic() });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/runtime/config") {
    const body = await readJsonBody(req);
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
    sendJson(res, 200, { ok: true, config });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/runtime/models") {
    const config = await runtimeStore.get();
    const models = await brain.listModels(config);
    sendJson(res, 200, { ok: true, models });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/runtime/probe") {
    const config = await runtimeStore.get();
    const probe = await brain.probe(config);
    sendJson(res, probe.ok ? 200 : 400, probe);
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/chat") {
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
    sendJson(res, 200, { ok: true, documents: await legalLibrary.listDocuments() });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/legal-library/search") {
    const query = requestUrl.searchParams.get("q") || "";
    sendJson(res, 200, { ok: true, results: await legalLibrary.search(query, 8) });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/legal-library/documents") {
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
    sendJson(res, 200, { ok: true, document });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/legal-library/ingest") {
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
    sendJson(res, 200, { ok: true, document });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/decision/run") {
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
    });

    sendJson(res, 200, { ok: true, decision: result, auditRun });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/replay/run") {
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
    });
    sendJson(res, 200, { ok: true, replay, auditRun });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/audit/runs") {
    const limit = Number(requestUrl.searchParams.get("limit") || 12);
    sendJson(res, 200, { ok: true, runs: await auditRuns.list(Number.isFinite(limit) ? limit : 12) });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/api/audit/runs/")) {
    const id = requestUrl.pathname.slice("/api/audit/runs/".length).trim();
    if (!id) {
      sendJson(res, 400, { ok: false, error: "run id is required" });
      return;
    }

    const record = await auditRuns.get(id);
    if (!record) {
      sendJson(res, 404, { ok: false, error: "Audit run not found" });
      return;
    }

    sendJson(res, 200, { ok: true, run: record });
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
