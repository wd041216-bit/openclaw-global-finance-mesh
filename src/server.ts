import http from "node:http";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AccessControlStore, isAccessRole, isIdentityBindingMatchType } from "./access-control.ts";
import { OperatorActivityStore } from "./activity-store.ts";
import { getAgentAdapter, listAgentAdapters } from "./agent-adapters.ts";
import { AuditLedgerStore } from "./audit-ledger.ts";
import { AuditRunStore } from "./audit-store.ts";
import { BackupReplicationStore } from "./backup-store.ts";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "./auth-session-store.ts";
import { OllamaBrainRuntime } from "./brain.ts";
import { runDecision } from "./engine.ts";
import { loadFinancePacksFromPaths } from "./fs.ts";
import { LegalLibraryStore } from "./legal-library.ts";
import { FinanceMeshLogger } from "./logging.ts";
import { FinanceMeshMetrics } from "./metrics.ts";
import { OperationsService } from "./operations-service.ts";
import { runReplay } from "./replay.ts";
import { RestoreDrillStore } from "./restore-drill-store.ts";
import { RuntimeConfigStore } from "./runtime-config.ts";
import { validatePackCollection } from "./validation.ts";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
const WEB_ROOT = path.join(REPO_ROOT, "web");
const PORT = Number(process.env.FINANCE_MESH_PORT || 3030);
const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: string };
const SERVICE_VERSION = packageJson.version || "0.0.0";

const runtimeStore = new RuntimeConfigStore();
const brain = new OllamaBrainRuntime();
const legalLibrary = new LegalLibraryStore();
const auditLedger = new AuditLedgerStore();
const auditRuns = new AuditRunStore({ ledger: auditLedger });
const accessControl = new AccessControlStore();
const operatorActivity = new OperatorActivityStore({ ledger: auditLedger });
const backups = new BackupReplicationStore({ ledger: auditLedger });
const restores = new RestoreDrillStore({ ledger: auditLedger, backups });
const logger = new FinanceMeshLogger();
const metrics = new FinanceMeshMetrics();
const operations = new OperationsService({
  version: SERVICE_VERSION,
  accessControl,
  runtimeStore,
  legalLibrary,
  auditLedger,
  auditRuns,
  backups,
  restores,
});

let scheduledBackupInFlight = false;
const scheduledBackupIntervalMinutes = normalizePositiveInteger(process.env.FINANCE_MESH_BACKUP_INTERVAL_MINUTES);

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const requestContext = attachRequestContext(req, requestUrl);
  res.setHeader("X-Request-Id", requestContext.requestId);
  try {
    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, requestUrl);
    } else {
      await serveStatic(requestUrl.pathname, res);
    }
  } catch (error) {
    logger.error("request.failed", {
      requestId: requestContext.requestId,
      method: req.method || "GET",
      path: requestUrl.pathname,
      workspace: requestContext.workspace,
      actorId: requestContext.actor?.id,
      actorRole: requestContext.actor?.role,
      error,
    });
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    const durationMs = Date.now() - requestContext.startedAt;
    const route = normalizeRouteForMetrics(req.method || "GET", requestUrl.pathname);
    metrics.recordHttpRequest({
      method: req.method || "GET",
      route,
      status: res.statusCode || 200,
    });
    logger.info("request.completed", {
      requestId: requestContext.requestId,
      method: req.method || "GET",
      path: requestUrl.pathname,
      route,
      status: res.statusCode || 200,
      durationMs,
      workspace: requestContext.workspace,
      actorId: requestContext.actor?.id,
      actorRole: requestContext.actor?.role,
      runId: requestContext.runId,
      backupId: requestContext.backupId,
      restoreId: requestContext.restoreId,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Zhouheng Global Finance Mesh UI running at http://127.0.0.1:${PORT}`);
  if (scheduledBackupIntervalMinutes) {
    logger.info("backup.scheduler.started", {
      intervalMinutes: scheduledBackupIntervalMinutes,
      backupRoot: backups.getConfigurationStatus().backupRoot,
    });
    setInterval(() => {
      void runScheduledBackup();
    }, scheduledBackupIntervalMinutes * 60_000);
  }
});

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, requestUrl: URL): Promise<void> {
  if (req.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "zhouheng-global-finance-mesh",
      version: SERVICE_VERSION,
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/operations/health") {
    sendJson(res, 200, {
      ok: true,
      health: await operations.getHealthStatus(),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/metrics") {
    metrics.setActiveSessions(await accessControl.countActiveSessions());
    metrics.setBackupTargetsConfigured(backups.getConfigurationStatus().configuredTargetCount);
    const latestSuccessfulRestore = await restores.getLatestSuccessful();
    metrics.setRestoreLastSuccessTimestamp(
      latestSuccessfulRestore?.createdAt ? Math.floor(Date.parse(latestSuccessfulRestore.createdAt) / 1000) : 0,
    );
    res.writeHead(200, {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    });
    res.end(metrics.render());
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/access-control") {
    const session = await accessControl.getSession(req.headers);
    if (session.actor) {
      setRequestActor(req, session.actor);
    }
    if (session.clearSessionCookies) {
      res.setHeader("Set-Cookie", buildClearedAuthCookies(req));
    }
    sendJson(res, 200, {
      ok: true,
      config: await accessControl.getPublicConfig(session.actor),
      session,
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/dashboard/overview") {
    const session = await accessControl.getSession(req.headers);
    if (session.actor) {
      setRequestActor(req, session.actor);
    }
    if (session.clearSessionCookies) {
      res.setHeader("Set-Cookie", buildClearedAuthCookies(req));
    }
    sendJson(res, 200, {
      ok: true,
      overview: await operations.getDashboardOverview(session),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/integrations/adapters") {
    sendJson(res, 200, {
      ok: true,
      adapters: listAgentAdapters(),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/api/integrations/adapters/")) {
    const adapterId = decodeURIComponent(requestUrl.pathname.replace("/api/integrations/adapters/", ""));
    const adapter = getAgentAdapter(adapterId);
    if (!adapter) {
      sendJson(res, 404, {
        ok: false,
        error: "Adapter not found.",
      });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      adapter,
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
    const actor = actorFromOperator(operator);
    setRequestActor(req, actor);
    const login = await accessControl.loginWithToken(String(body.token ?? ""));
    setRequestRunReference(req, {
      actor: login.actor,
    });
    res.setHeader("Set-Cookie", buildAuthCookies(req, login.currentSession, login.csrfToken));
    const config = await accessControl.getPublicConfig(login.actor);
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
    sendJson(res, 200, {
      ok: true,
      operator,
      config,
      session: {
        authenticated: true,
        actor: login.actor,
        authMethod: login.authMethod,
        currentSession: login.currentSession,
        csrfToken: login.csrfToken,
      },
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/access-control/login/token") {
    const body = await readJsonBody(req);
    try {
      const login = await accessControl.loginWithToken(String(body.token ?? ""));
      setRequestActor(req, login.actor);
      res.setHeader("Set-Cookie", buildAuthCookies(req, login.currentSession, login.csrfToken));
      const config = await accessControl.getPublicConfig(login.actor);
      await operatorActivity.record({
        action: "access.login_token",
        actor: login.actor,
        subject: login.actor.name,
        message: `Established a local token session for ${login.actor.name}.`,
        detail: {
          authMethod: login.authMethod,
          role: login.actor.role,
          sessionId: login.currentSession.sessionId,
        },
      });
      sendJson(res, 200, {
        ok: true,
        config,
        session: {
          authenticated: true,
          actor: login.actor,
          authMethod: login.authMethod,
          currentSession: login.currentSession,
          csrfToken: login.csrfToken,
        },
      });
    } catch (error) {
      await operatorActivity.record({
        action: "access.login_token",
        outcome: "failure",
        actor: null,
        subject: "local_token",
        message: "Rejected a local token login attempt.",
        detail: {
          reason: error instanceof Error ? error.message : String(error),
        },
      });
      sendJson(res, 401, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/access-control/login") {
    try {
      const redirectTo = sanitizeRedirectTarget(requestUrl.searchParams.get("next"));
      const login = await accessControl.beginOidcLogin({
        redirectTo,
      });
      redirect(res, login.location);
    } catch (error) {
      redirect(res, buildUiRedirect("/", {
        authError: error instanceof Error ? error.message : String(error),
      }));
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/access-control/callback") {
    const providerError = requestUrl.searchParams.get("error");
    if (providerError) {
      await operatorActivity.record({
        action: "access.login_oidc",
        outcome: "failure",
        actor: null,
        subject: "oidc",
        message: `OIDC provider returned ${providerError}.`,
        detail: {
          error: providerError,
          description: requestUrl.searchParams.get("error_description"),
        },
      });
      redirect(
        res,
        buildUiRedirect("/", {
          authError: requestUrl.searchParams.get("error_description") || providerError,
        }),
      );
      return;
    }

    const state = requestUrl.searchParams.get("state") || "";
    const code = requestUrl.searchParams.get("code") || "";
    if (!state || !code) {
      redirect(res, buildUiRedirect("/", { authError: "OIDC callback is missing code or state." }));
      return;
    }

    try {
      const login = await accessControl.completeOidcLogin({ state, code });
      setRequestActor(req, login.actor);
      res.setHeader("Set-Cookie", buildAuthCookies(req, login.currentSession, login.csrfToken));
      await operatorActivity.record({
        action: "access.login_oidc",
        actor: login.actor,
        subject: login.email ?? login.subject,
        message: `Established an OIDC session for ${login.actor.name}.`,
        detail: {
          issuer: login.issuer,
          subject: login.subject,
          email: login.email,
          sessionId: login.currentSession.sessionId,
          role: login.actor.role,
        },
      });
      redirect(res, buildUiRedirect(login.redirectTo, { auth: "success" }));
    } catch (error) {
      await operatorActivity.record({
        action: "access.login_oidc",
        outcome: "failure",
        actor: null,
        subject: "oidc",
        message: "Rejected an OIDC login attempt.",
        detail: {
          reason: error instanceof Error ? error.message : String(error),
        },
      });
      redirect(res, buildUiRedirect("/", { authError: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/access-control/logout") {
    const sessionState = await accessControl.getSession(req.headers);
    if (sessionState.actor) {
      setRequestActor(req, sessionState.actor);
    }
    const logout = await accessControl.logout(req.headers);
    res.setHeader("Set-Cookie", buildClearedAuthCookies(req));
    if (sessionState.actor) {
      await operatorActivity.record({
        action: "access.logout",
        actor: sessionState.actor,
        subject: sessionState.actor.name,
        message: `Closed the ${sessionState.authMethod ?? "unknown"} session for ${sessionState.actor.name}.`,
        detail: {
          sessionId: logout.session?.sessionId ?? sessionState.currentSession?.sessionId,
          authMethod: sessionState.authMethod,
        },
      });
    }
    sendJson(res, 200, {
      ok: true,
      session: {
        authenticated: false,
        actor: null,
        currentSession: null,
      },
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/access-control/config") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }

    const body = await readJsonBody(req);
    const previousConfig = await accessControl.getPublicConfig(auth.actor);
    await accessControl.updateConfig({
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });
    const config = await accessControl.getPublicConfig(auth.actor);
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
    const config = await accessControl.getPublicConfig(auth.actor);
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

  if (req.method === "POST" && requestUrl.pathname === "/api/access-control/bindings") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }

    const body = await readJsonBody(req);
    if (!isIdentityBindingMatchType(body.matchType)) {
      sendJson(res, 400, { ok: false, error: "Invalid identity binding type." });
      return;
    }
    if (!isAccessRole(body.role)) {
      sendJson(res, 400, { ok: false, error: "Invalid operator role." });
      return;
    }

    const binding = await accessControl.createBinding({
      label: typeof body.label === "string" ? body.label : undefined,
      matchType: body.matchType,
      role: body.role,
      issuer: typeof body.issuer === "string" ? body.issuer : undefined,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      email: typeof body.email === "string" ? body.email : undefined,
    });
    await operatorActivity.record({
      action: "access.create_binding",
      actor: auth.actor,
      subject: binding.label,
      message: `Created an ${binding.matchType} identity binding for ${binding.role}.`,
      detail: {
        binding,
      },
    });
    sendJson(res, 200, {
      ok: true,
      binding,
      config: await accessControl.getPublicConfig(auth.actor),
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname.startsWith("/api/access-control/bindings/") && requestUrl.pathname.endsWith("/deactivate")) {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }

    const bindingId = requestUrl.pathname
      .slice("/api/access-control/bindings/".length, -"/deactivate".length)
      .trim();
    if (!bindingId) {
      sendJson(res, 400, { ok: false, error: "binding id is required" });
      return;
    }

    const binding = await accessControl.deactivateBinding(bindingId);
    if (!binding) {
      sendJson(res, 404, { ok: false, error: "Identity binding not found" });
      return;
    }

    await operatorActivity.record({
      action: "access.deactivate_binding",
      actor: auth.actor,
      subject: binding.label,
      message: `Deactivated identity binding ${binding.label}.`,
      detail: {
        binding,
      },
    });
    sendJson(res, 200, {
      ok: true,
      binding,
      config: await accessControl.getPublicConfig(auth.actor),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/access-control/sessions") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }
    const limit = Number(requestUrl.searchParams.get("limit") || 25);
    const sessions = await accessControl.listSessions(Number.isFinite(limit) ? limit : 25);
    await operatorActivity.record({
      action: "access.read_identity_status",
      actor: auth.actor,
      subject: "sessions",
      message: `Reviewed ${sessions.length} active sessions.`,
      detail: {
        limit,
      },
    });
    sendJson(res, 200, {
      ok: true,
      sessions,
      currentSessionId: auth.currentSession?.sessionId ?? null,
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname.startsWith("/api/access-control/sessions/") && requestUrl.pathname.endsWith("/revoke")) {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }

    const sessionId = requestUrl.pathname
      .slice("/api/access-control/sessions/".length, -"/revoke".length)
      .trim();
    if (!sessionId) {
      sendJson(res, 400, { ok: false, error: "session id is required" });
      return;
    }

    const revoked = await accessControl.revokeSession(sessionId);
    if (!revoked) {
      sendJson(res, 404, { ok: false, error: "Session not found" });
      return;
    }
    if (auth.currentSession?.sessionId === revoked.sessionId) {
      res.setHeader("Set-Cookie", buildClearedAuthCookies(req));
    }
    await operatorActivity.record({
      action: "access.revoke_session",
      actor: auth.actor,
      subject: revoked.actor.name,
      message: `Revoked ${revoked.authMethod} session for ${revoked.actor.name}.`,
      detail: {
        sessionId: revoked.sessionId,
        authMethod: revoked.authMethod,
        role: revoked.actor.role,
      },
    });
    sendJson(res, 200, {
      ok: true,
      revoked,
      currentSessionId: auth.currentSession?.sessionId ?? null,
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
    metrics.recordRun("probe", probe.ok ? "success" : "failure");
    setRequestRunReference(req, {
      actor: auth.actor,
      runId: auditRun.id,
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
      metrics.recordRun("decision", "failure");
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
    metrics.recordRun("decision", "success");
    setRequestRunReference(req, {
      actor: auth.actor,
      runId: auditRun.id,
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
      metrics.recordRun("replay", "failure");
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
    metrics.recordRun("replay", "success");
    setRequestRunReference(req, {
      actor: auth.actor,
      runId: auditRun.id,
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

  if (req.method === "GET" && requestUrl.pathname === "/api/audit/integrity") {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }
    sendJson(res, 200, {
      ok: true,
      integrity: await auditLedger.getIntegrityStatus(),
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/audit/integrity/verify") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }
    const verification = await auditLedger.verifyIntegrity(auth.actor);
    metrics.recordIntegrityVerification(verification.status);
    sendJson(res, 200, {
      ok: true,
      verification,
      integrity: await auditLedger.getIntegrityStatus(),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/audit/exports") {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }
    const limit = Number(requestUrl.searchParams.get("limit") || 12);
    sendJson(res, 200, {
      ok: true,
      exports: await auditLedger.listExportBatches(Number.isFinite(limit) ? limit : 12),
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/audit/exports") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }
    const body = await readJsonBody(req);
    let exportBatch;
    try {
      exportBatch = await auditLedger.createExportBatch({
        actor: auth.actor,
        sequenceFrom: normalizeOptionalNumber(body.sequenceFrom),
        sequenceTo: normalizeOptionalNumber(body.sequenceTo),
        createdFrom: typeof body.createdFrom === "string" ? body.createdFrom : undefined,
        createdTo: typeof body.createdTo === "string" ? body.createdTo : undefined,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      exportBatch,
      integrity: await auditLedger.getIntegrityStatus(),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/api/audit/exports/")) {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }
    const id = requestUrl.pathname.slice("/api/audit/exports/".length).trim();
    if (!id) {
      sendJson(res, 400, { ok: false, error: "export id is required" });
      return;
    }

    const exportBatch = await auditLedger.getExportBatch(id);
    if (!exportBatch) {
      sendJson(res, 404, { ok: false, error: "Audit export not found" });
      return;
    }

    sendJson(res, 200, { ok: true, exportBatch });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/operations/backups") {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }
    const limit = Number(requestUrl.searchParams.get("limit") || 12);
    sendJson(res, 200, {
      ok: true,
      config: backups.getConfigurationStatus(),
      backups: await backups.list(Number.isFinite(limit) ? limit : 12),
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/operations/backups/run") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }
    const backup = await backups.runBackup({
      actor: auth.actor,
      trigger: "manual",
    });
    metrics.recordBackup(backup.status);
    setRequestRunReference(req, {
      actor: auth.actor,
      backupId: backup.backupId,
    });
    logger.info("backup.manual.completed", {
      requestId: getRequestContext(req).requestId,
      backupId: backup.backupId,
      actorId: auth.actor?.id,
      actorRole: auth.actor?.role,
      status: backup.status,
      targets: backup.targets,
    });
    sendJson(res, 200, {
      ok: true,
      backup,
      health: await operations.getHealthStatus(),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/api/operations/backups/")) {
    const auth = await requireRole(req, res, "reviewer");
    if (!auth) {
      return;
    }
    const backupId = requestUrl.pathname.slice("/api/operations/backups/".length).trim();
    if (!backupId) {
      sendJson(res, 400, { ok: false, error: "backup id is required" });
      return;
    }
    const backup = await backups.get(backupId);
    if (!backup) {
      sendJson(res, 404, { ok: false, error: "Backup job not found" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      backup,
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/operations/restores") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }
    const limit = Number(requestUrl.searchParams.get("limit") || 12);
    sendJson(res, 200, {
      ok: true,
      restores: await restores.list(Number.isFinite(limit) ? limit : 12),
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/operations/restores/run") {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }
    const body = await readJsonBody(req);
    const restore = await restores.runDrill({
      actor: auth.actor,
      backupId: typeof body.backupId === "string" ? body.backupId : undefined,
      sourceType: isRestoreSourceType(body.sourceType) ? body.sourceType : undefined,
    });
    metrics.recordRestoreDrill(restore.status);
    setRequestRunReference(req, {
      actor: auth.actor,
      restoreId: restore.drillId,
    });
    await operatorActivity.record({
      action: "operations.restore_drill",
      outcome: restore.status === "failure" ? "failure" : "success",
      actor: auth.actor,
      subject: restore.sourceType,
      message:
        restore.status === "success"
          ? `Completed restore drill from ${restore.sourceType}.`
          : restore.status === "degraded"
            ? `Restore drill from ${restore.sourceType} completed with warnings.`
            : `Restore drill from ${restore.sourceType} failed.`,
      detail: {
        drillId: restore.drillId,
        backupId: restore.backupId,
        sourceType: restore.sourceType,
        sourceLocation: restore.sourceLocation,
        status: restore.status,
        checks: restore.checks,
      },
    });
    logger.info("restore.manual.completed", {
      requestId: getRequestContext(req).requestId,
      restoreId: restore.drillId,
      actorId: auth.actor?.id,
      actorRole: auth.actor?.role,
      status: restore.status,
      sourceType: restore.sourceType,
      backupId: restore.backupId,
    });
    sendJson(res, 200, {
      ok: true,
      restore,
      health: await operations.getHealthStatus(),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/api/operations/restores/")) {
    const auth = await requireRole(req, res, "admin");
    if (!auth) {
      return;
    }
    const drillId = requestUrl.pathname.slice("/api/operations/restores/".length).trim();
    if (!drillId) {
      sendJson(res, 400, { ok: false, error: "restore id is required" });
      return;
    }
    const restore = await restores.get(drillId);
    if (!restore) {
      sendJson(res, 404, { ok: false, error: "Restore drill not found" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      restore,
    });
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

function normalizeOptionalNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return undefined;
}

async function requireRole(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  role: "viewer" | "operator" | "reviewer" | "admin",
): Promise<{
  actor: import("./access-control.ts").AuthenticatedActor | null;
  currentSession: import("./auth-session-store.ts").AuthenticatedSession | null;
} | null> {
  const auth = await accessControl.authorize(req.headers, role, {
    method: req.method,
  });
  if (!auth.ok) {
    if (auth.clearSessionCookies) {
      res.setHeader("Set-Cookie", buildClearedAuthCookies(req));
    }
    sendJson(res, auth.status, { ok: false, error: auth.error });
    return null;
  }
  if (auth.clearSessionCookies) {
    res.setHeader("Set-Cookie", buildClearedAuthCookies(req));
  }
  setRequestActor(req, auth.actor);
  return {
    actor: auth.actor,
    currentSession: auth.currentSession,
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

function buildAuthCookies(
  req: http.IncomingMessage,
  session: import("./auth-session-store.ts").AuthenticatedSession,
  csrfToken: string,
): string[] {
  const secure = shouldUseSecureCookies(req);
  const expires = new Date(session.absoluteExpiresAt).toUTCString();
  const shared = `Path=/; SameSite=Lax; Expires=${expires}${secure ? "; Secure" : ""}`;
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(session.sessionId)}; ${shared}; HttpOnly`,
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${shared}`,
  ];
}

function buildClearedAuthCookies(req: http.IncomingMessage): string[] {
  const secure = shouldUseSecureCookies(req);
  const shared = `Path=/; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? "; Secure" : ""}`;
  return [
    `${SESSION_COOKIE_NAME}=; ${shared}; HttpOnly`,
    `${CSRF_COOKIE_NAME}=; ${shared}`,
  ];
}

function shouldUseSecureCookies(req: http.IncomingMessage): boolean {
  const env = process.env.FINANCE_MESH_COOKIE_SECURE?.trim();
  if (env === "true") {
    return true;
  }
  if (env === "false") {
    return false;
  }
  const host = String(req.headers.host || "");
  return !host.startsWith("127.0.0.1") && !host.startsWith("localhost");
}

function redirect(res: http.ServerResponse, location: string): void {
  res.writeHead(302, {
    Location: location,
  });
  res.end();
}

function buildUiRedirect(basePath: string, params: Record<string, string>): string {
  const safeBasePath = sanitizeRedirectTarget(basePath);
  const nextUrl = new URL(safeBasePath, "http://finance-mesh.local");
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      nextUrl.searchParams.set(key, value);
    }
  }
  return `${nextUrl.pathname}${nextUrl.search}`;
}

function sanitizeRedirectTarget(value: string | null | undefined): string {
  const normalized = String(value || "").trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/";
  }
  return normalized;
}

async function runScheduledBackup(): Promise<void> {
  if (scheduledBackupInFlight) {
    logger.warn("backup.scheduler.skipped", {
      reason: "backup already in flight",
    });
    return;
  }
  scheduledBackupInFlight = true;
  try {
    const backup = await backups.runBackup({
      actor: null,
      trigger: "scheduled",
    });
    metrics.recordBackup(backup.status);
    logger.info("backup.scheduler.completed", {
      backupId: backup.backupId,
      status: backup.status,
      targets: backup.targets,
    });
  } catch (error) {
    logger.error("backup.scheduler.failed", {
      error,
    });
    metrics.recordBackup("failure");
  } finally {
    scheduledBackupInFlight = false;
  }
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
  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (filePath.endsWith(".png")) {
    return "image/png";
  }
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return "application/yaml; charset=utf-8";
  }
  return "text/html; charset=utf-8";
}

type RequestContext = {
  requestId: string;
  startedAt: number;
  workspace: string;
  actor: import("./access-control.ts").AuthenticatedActor | null;
  runId?: string;
  backupId?: string;
  restoreId?: string;
};

function attachRequestContext(req: http.IncomingMessage, requestUrl: URL): RequestContext {
  const existing = getExistingRequestContext(req);
  if (existing) {
    return existing;
  }
  const context: RequestContext = {
    requestId: logger.createRequestId(),
    startedAt: Date.now(),
    workspace: inferWorkspace(req, requestUrl.pathname),
    actor: null,
  };
  (req as typeof req & { __financeMeshContext?: RequestContext }).__financeMeshContext = context;
  return context;
}

function getRequestContext(req: http.IncomingMessage): RequestContext {
  return getExistingRequestContext(req) ?? attachRequestContext(req, new URL(req.url || "/", "http://finance-mesh.local"));
}

function setRequestActor(req: http.IncomingMessage, actor: import("./access-control.ts").AuthenticatedActor | null): void {
  const context = getRequestContext(req);
  context.actor = actor;
}

function setRequestRunReference(
  req: http.IncomingMessage,
  value: {
    actor?: import("./access-control.ts").AuthenticatedActor | null;
    runId?: string;
    backupId?: string;
    restoreId?: string;
  },
): void {
  const context = getRequestContext(req);
  if (value.actor !== undefined) {
    context.actor = value.actor;
  }
  if (value.runId) {
    context.runId = value.runId;
  }
  if (value.backupId) {
    context.backupId = value.backupId;
  }
  if (value.restoreId) {
    context.restoreId = value.restoreId;
  }
}

function getExistingRequestContext(req: http.IncomingMessage): RequestContext | null {
  return (req as typeof req & { __financeMeshContext?: RequestContext }).__financeMeshContext ?? null;
}

function inferWorkspace(req: http.IncomingMessage, pathname: string): string {
  const headerWorkspace = req.headers["x-finance-mesh-workspace"];
  if (typeof headerWorkspace === "string" && headerWorkspace.trim()) {
    return headerWorkspace.trim();
  }
  if (pathname.startsWith("/api/legal-library")) {
    return "library";
  }
  if (
    pathname.startsWith("/api/audit")
    || pathname.startsWith("/api/operations/backups")
    || pathname.startsWith("/api/operations/restores")
    || pathname.startsWith("/api/access-control/activity")
  ) {
    return "governance";
  }
  if (
    pathname.startsWith("/api/access-control")
    || pathname.startsWith("/api/runtime")
    || pathname.startsWith("/api/operations")
    || pathname.startsWith("/api/metrics")
  ) {
    return "system";
  }
  return "workbench";
}

function normalizeRouteForMetrics(method: string, pathname: string): string {
  if (pathname.startsWith("/api/access-control/sessions/") && pathname.endsWith("/revoke")) {
    return `${method.toUpperCase()} /api/access-control/sessions/:id/revoke`;
  }
  if (pathname.startsWith("/api/access-control/bindings/") && pathname.endsWith("/deactivate")) {
    return `${method.toUpperCase()} /api/access-control/bindings/:id/deactivate`;
  }
  if (pathname.startsWith("/api/audit/runs/")) {
    return `${method.toUpperCase()} /api/audit/runs/:id`;
  }
  if (pathname.startsWith("/api/runtime/probes/")) {
    return `${method.toUpperCase()} /api/runtime/probes/:id`;
  }
  if (pathname.startsWith("/api/audit/exports/")) {
    return `${method.toUpperCase()} /api/audit/exports/:id`;
  }
  if (pathname.startsWith("/api/operations/backups/")) {
    return `${method.toUpperCase()} /api/operations/backups/:id`;
  }
  if (pathname.startsWith("/api/operations/restores/")) {
    return `${method.toUpperCase()} /api/operations/restores/:id`;
  }
  if (pathname.startsWith("/api/access-control/activity/")) {
    return `${method.toUpperCase()} /api/access-control/activity/:id`;
  }
  return `${method.toUpperCase()} ${pathname}`;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }
  return undefined;
}

function isRestoreSourceType(value: unknown): value is import("./restore-drill-store.ts").RestoreSourceType {
  return value === "s3" || value === "mounted_dir" || value === "local_snapshot";
}
