import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AccessControlStore } from "../src/access-control.ts";
import { AuditLedgerStore } from "../src/audit-ledger.ts";
import { AuditRunStore } from "../src/audit-store.ts";
import { BackupReplicationStore, type S3ReplicationUploader } from "../src/backup-store.ts";
import { runDecision } from "../src/engine.ts";
import { LegalLibraryStore } from "../src/legal-library.ts";
import { OperationsService } from "../src/operations-service.ts";
import { runReplay } from "../src/replay.ts";
import { RuntimeConfigStore } from "../src/runtime-config.ts";

import type { EventPayload, FinancePack } from "../src/types.ts";

function makeEvent(id: string, amountValue: number): EventPayload {
  return {
    event_id: id,
    event_type: "saas_contract_prepayment",
    entity_id: "entity-cn",
    source_system: "erp",
    event_time: "2026-03-01T00:00:00.000Z",
    amount: {
      value: amountValue,
      currency: "CNY",
    },
    evidence_refs: ["signed_contract", "invoice"],
  };
}

function makePack(reviewRequired: boolean): FinancePack {
  return {
    pack_id: "CN_COUNTRY_CORE_v1.3.0",
    pack_type: "country",
    display_name: "CN Country Core",
    version: "1.3.0",
    status: "active",
    owner: "finance-platform",
    effective_from: "2026-01-01T00:00:00.000Z",
    source_of_truth: [
      {
        source_id: "cn-tax",
        source_type: "tax_authority",
        title: "CN tax guidance",
        uri_or_registry_ref: "https://example.com/cn-tax",
        retrieved_at: "2026-03-01T00:00:00.000Z",
      },
    ],
    rules: [
      {
        rule_id: "CN-TAX-REV-001",
        title: "Tax review required",
        intent: "Keep tax review visible for tests.",
        scope: {
          all: [
            {
              field: "event_type",
              op: "eq",
              value: "saas_contract_prepayment",
            },
          ],
        },
        actions: {
          account_mapping: {
            primary_account: "contract_liability",
          },
          tax_treatment: {
            tax_review_required: reviewRequired,
          },
          evidence_requirements: ["signed_contract"],
          approval_route: {
            default: ["finance_manager"],
          },
        },
        risk_model: {
          risk_level: reviewRequired ? "medium" : "low",
        },
        rollback: {
          supported: true,
          rollback_steps: ["restore previous pack"],
        },
      },
    ],
  };
}

async function buildOperationsHarness() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-operations-"));
  const auditDir = path.join(tempDir, "data", "audit");
  const runtimeDir = path.join(tempDir, "data", "runtime");
  const legalDir = path.join(tempDir, "data", "legal-library");
  await fs.mkdir(auditDir, { recursive: true });
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.mkdir(legalDir, { recursive: true });

  const ledger = new AuditLedgerStore({
    ledgerPath: path.join(auditDir, "ledger.sqlite"),
    legacyRunsPath: path.join(auditDir, "runs.json"),
    legacyActivityPath: path.join(auditDir, "activity.json"),
    exportDir: path.join(auditDir, "exports"),
    environment: "beta",
    teamScope: "north-america-finance",
  });
  const auditRuns = new AuditRunStore({ ledger });
  const accessControl = new AccessControlStore({
    configPath: path.join(runtimeDir, "access-control.json"),
    secretPath: path.join(runtimeDir, "access-control.secrets.json"),
    sessionPath: path.join(runtimeDir, "auth-sessions.sqlite"),
  });
  const runtimeStore = new RuntimeConfigStore({
    configPath: path.join(runtimeDir, "config.json"),
    secretPath: path.join(runtimeDir, "local.secrets.json"),
  });
  const legalLibrary = new LegalLibraryStore(path.join(legalDir, "library.json"));

  return {
    tempDir,
    ledger,
    auditRuns,
    accessControl,
    runtimeStore,
    legalLibrary,
  };
}

test("operations service returns a business-friendly overview and keeps open mode usable without login", async () => {
  const harness = await buildOperationsHarness();
  const {
    tempDir,
    ledger,
    auditRuns,
    accessControl,
    runtimeStore,
    legalLibrary,
  } = harness;

  await accessControl.bootstrapAdmin({
    name: "Alice Admin",
    token: "admin-secret",
    enableAuth: false,
  });
  await runtimeStore.update({
    mode: "cloud",
    model: "qwen3:8b",
    cloudBaseUrl: "https://ollama.example.com",
    apiKey: "cloud-secret",
    persistSecret: true,
  });
  await legalLibrary.createDocument({
    title: "Global VAT draft memo",
    body: "Draft memo for review.",
    status: "draft",
    jurisdiction: "GLOBAL",
    domain: "tax",
  });
  await legalLibrary.createDocument({
    title: "Approved retention policy",
    body: "Approved retention guidance.",
    status: "approved",
    jurisdiction: "GLOBAL",
    domain: "governance",
  });

  const baselinePack = makePack(true);
  const candidatePack = makePack(false);
  const event = makeEvent("event-9", 320000);
  const decision = runDecision({
    request: {
      mode: "L1",
      event_payload: event,
      available_evidence: ["signed_contract", "invoice"],
    },
    packs: [baselinePack],
  });
  const replay = runReplay({
    mode: "L1",
    events: [event],
    baselinePacks: [baselinePack],
    candidatePacks: [candidatePack],
  });

  await auditRuns.recordDecision({
    mode: "L1",
    packPaths: ["examples/packs"],
    event,
    result: decision,
    actor: null,
  });
  await auditRuns.recordReplay({
    mode: "L1",
    baselinePackPaths: ["examples/packs/baseline"],
    candidatePackPaths: ["examples/packs/candidate"],
    events: [event],
    replay,
    actor: null,
  });
  await auditRuns.recordProbe({
    config: {
      mode: "cloud",
      model: "qwen3:8b",
      localBaseUrl: "http://127.0.0.1:11434",
      cloudBaseUrl: "https://ollama.example.com",
      hasApiKey: true,
    },
    probe: {
      ok: true,
      mode: "cloud",
      model: "qwen3:8b",
      listModelsOk: true,
      inferenceOk: true,
      availableModels: ["qwen3:8b"],
      latencyMs: 240,
    },
    actor: null,
  });

  const operations = new OperationsService({
    version: "0.1.0",
    startedAt: Date.now() - 5_000,
    accessControl,
    runtimeStore,
    legalLibrary,
    auditLedger: ledger,
    auditRuns,
    backups: new BackupReplicationStore({
      ledger,
      sourceRoot: tempDir,
      backupRoot: path.join(tempDir, "data", "backups"),
      environment: "beta",
      teamScope: "north-america-finance",
    }),
  });

  const overview = await operations.getDashboardOverview({
    authenticated: false,
    actor: null,
    currentSession: null,
  });

  assert.equal(overview.identity.authEnabled, false);
  assert.match(overview.identity.summary, /开放模式/);
  assert.equal(overview.runtime.mode, "cloud");
  assert.equal(overview.runtime.hasApiKey, true);
  assert.equal(overview.decisioning.counts24h.decision, 1);
  assert.equal(overview.decisioning.counts24h.replay, 1);
  assert.equal(overview.governance.legalLibrary.draftCount, 1);
  assert.equal(overview.governance.legalLibrary.approvedCount, 1);
  assert.equal(overview.governance.backups.configuredTargetCount, 0);
  assert.ok(overview.actions.some((item) => item.intent === "run_example_decision"));
  assert.ok(overview.actions.some((item) => item.intent === "search_legal_library"));
  assert.ok(!overview.actions.some((item) => item.intent === "open_login"));
});

test("operations health marks backup targets degraded when replication only partially succeeds", async () => {
  const harness = await buildOperationsHarness();
  const {
    tempDir,
    ledger,
    auditRuns,
    accessControl,
    runtimeStore,
    legalLibrary,
  } = harness;
  const mountedDir = path.join(tempDir, "mounted-backups");

  await accessControl.bootstrapAdmin({
    name: "Alice Admin",
    token: "admin-secret",
    enableAuth: true,
  });
  await runtimeStore.update({
    model: "qwen3:8b",
    persistSecret: false,
  });
  await legalLibrary.createDocument({
    title: "Approved source",
    body: "Reviewed and approved.",
    status: "approved",
    jurisdiction: "GLOBAL",
    domain: "governance",
  });
  await auditRuns.recordProbe({
    config: {
      mode: "local",
      model: "qwen3:8b",
      localBaseUrl: "http://127.0.0.1:11434",
      cloudBaseUrl: "https://ollama.com",
      hasApiKey: false,
    },
    probe: {
      ok: true,
      mode: "local",
      model: "qwen3:8b",
      listModelsOk: true,
      inferenceOk: true,
      availableModels: ["qwen3:8b"],
      latencyMs: 120,
    },
    actor: {
      id: "admin-1",
      name: "Alice Admin",
      role: "admin",
    },
  });

  const failingUploader: S3ReplicationUploader = {
    async replicateDirectory() {
      throw new Error("S3 endpoint is unavailable");
    },
  };
  const backups = new BackupReplicationStore({
    ledger,
    sourceRoot: tempDir,
    backupRoot: path.join(tempDir, "data", "backups"),
    localDir: mountedDir,
    environment: "beta",
    teamScope: "north-america-finance",
    s3Config: {
      endpoint: "https://s3.example.com",
      region: "auto",
      bucket: "finance-mesh-backups",
      prefix: "beta",
      accessKeyId: "key-id",
      secretAccessKey: "secret-key",
      forcePathStyle: true,
    },
    s3Uploader: failingUploader,
  });
  const login = await accessControl.loginWithToken("admin-secret");
  await backups.runBackup({
    actor: login.actor,
    trigger: "manual",
  });

  const operations = new OperationsService({
    version: "0.1.0",
    startedAt: Date.now() - 20_000,
    accessControl,
    runtimeStore,
    legalLibrary,
    auditLedger: ledger,
    auditRuns,
    backups,
  });

  const health = await operations.getHealthStatus();
  const overview = await operations.getDashboardOverview({
    authenticated: true,
    actor: login.actor,
    authMethod: login.authMethod,
    currentSession: login.currentSession,
    csrfToken: login.csrfToken,
  });

  assert.equal(health.checks.runtime.status, "healthy");
  assert.equal(health.checks.backupTargets.status, "degraded");
  assert.match(health.checks.backupTargets.summary, /部分成功/);
  assert.equal(health.recent.backup?.status, "partial_failure");
  assert.equal(overview.governance.backups.configuredTargetCount, 2);
  assert.ok(overview.governance.backups.lastBackup);
  assert.match(overview.governance.backups.summary, /部分成功/);
});
