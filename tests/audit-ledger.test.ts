import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { OperatorActivityStore } from "../src/activity-store.ts";
import { AuditLedgerStore } from "../src/audit-ledger.ts";
import { AuditRunStore } from "../src/audit-store.ts";
import { runDecision } from "../src/engine.ts";
import { runReplay } from "../src/replay.ts";

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

test("audit ledger migrates legacy JSON once and preserves ids", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-ledger-migrate-"));
  const legacyRunsPath = path.join(tempDir, "runs.json");
  const legacyActivityPath = path.join(tempDir, "activity.json");
  const ledgerPath = path.join(tempDir, "ledger.sqlite");
  const exportDir = path.join(tempDir, "exports");

  await fs.writeFile(
    legacyRunsPath,
    JSON.stringify(
      {
        runs: [
          {
            id: "legacy-decision",
            type: "decision",
            createdAt: "2026-03-01T00:00:00.000Z",
            mode: "L1",
            label: "legacy decision",
            packPaths: ["examples/packs"],
            eventIds: ["event-1"],
            detail: {
              event: {
                event_id: "event-1",
              },
            },
          },
          {
            id: "legacy-probe",
            type: "probe",
            createdAt: "2026-03-01T00:01:00.000Z",
            mode: "local",
            label: "legacy probe",
            packPaths: [],
            eventIds: [],
            probeOk: true,
            detail: {
              probe: {
                ok: true,
              },
            },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(
    legacyActivityPath,
    JSON.stringify(
      {
        events: [
          {
            id: "legacy-activity",
            createdAt: "2026-03-01T00:02:00.000Z",
            action: "runtime.update_config",
            outcome: "success",
            subject: "qwen3:8b",
            message: "Legacy runtime update.",
            detail: {},
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const ledger = new AuditLedgerStore({
    ledgerPath,
    legacyRunsPath,
    legacyActivityPath,
    exportDir,
    environment: "beta",
    teamScope: "ops",
  });
  const auditStore = new AuditRunStore({ ledger });
  const activityStore = new OperatorActivityStore({ ledger });

  const runs = await auditStore.list(10);
  const activities = await activityStore.list(10);
  const integrity = await ledger.getIntegrityStatus();

  assert.deepEqual(
    runs.map((item) => item.id),
    ["legacy-probe", "legacy-decision"],
  );
  assert.deepEqual(
    activities.map((item) => item.id),
    ["legacy-activity"],
  );
  assert.equal(integrity.migration?.importedEntries, 3);
  assert.equal(integrity.migration?.importedRuns, 2);
  assert.equal(integrity.migration?.importedActivities, 1);

  const reopenedLedger = new AuditLedgerStore({
    ledgerPath,
    legacyRunsPath,
    legacyActivityPath,
    exportDir,
    environment: "beta",
    teamScope: "ops",
  });
  const reopenedAudit = new AuditRunStore({ ledger: reopenedLedger });
  const reopenedActivity = new OperatorActivityStore({ ledger: reopenedLedger });

  assert.equal((await reopenedAudit.list(10)).length, 2);
  assert.equal((await reopenedActivity.list(10)).length, 1);
});

test("audit ledger keeps one append-only hash chain across run and activity events", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-ledger-chain-"));
  const ledger = new AuditLedgerStore({
    ledgerPath: path.join(tempDir, "ledger.sqlite"),
    legacyRunsPath: path.join(tempDir, "runs.json"),
    legacyActivityPath: path.join(tempDir, "activity.json"),
    exportDir: path.join(tempDir, "exports"),
    environment: "beta",
    teamScope: "finance-cn",
  });
  const auditStore = new AuditRunStore({ ledger });
  const activityStore = new OperatorActivityStore({ ledger });
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

  await auditStore.recordDecision({
    mode: "L1",
    packPaths: ["examples/packs"],
    event,
    result: decision,
    actor: {
      id: "operator-1",
      name: "Olivia Operator",
      role: "operator",
    },
  });
  await activityStore.record({
    action: "runtime.update_config",
    actor: {
      id: "admin-1",
      name: "Alice Admin",
      role: "admin",
    },
    subject: "qwen3:8b",
    message: "Switched runtime model.",
  });
  await auditStore.recordProbe({
    config: {
      mode: "local",
      model: "qwen3:8b",
      localBaseUrl: "http://127.0.0.1:11434",
      cloudBaseUrl: "https://ollama.com",
      hasApiKey: false,
    },
    probe: {
      ok: false,
      mode: "local",
      listModelsOk: true,
      inferenceOk: false,
      availableModels: ["qwen3:8b"],
      error: "model not found",
    },
    actor: {
      id: "operator-1",
      name: "Olivia Operator",
      role: "operator",
    },
  });
  await auditStore.recordReplay({
    mode: "L1",
    baselinePackPaths: ["examples/packs"],
    candidatePackPaths: ["candidate/packs"],
    events: [event],
    replay,
    actor: {
      id: "operator-1",
      name: "Olivia Operator",
      role: "operator",
    },
  });

  const entries = (await ledger.listEntries({ limit: 10 })).reverse();

  assert.deepEqual(
    entries.map((entry) => entry.sequence),
    [1, 2, 3, 4],
  );
  assert.equal(entries[0]?.prevHash, "GENESIS");
  assert.equal(entries[1]?.prevHash, entries[0]?.entryHash);
  assert.equal(entries[2]?.prevHash, entries[1]?.entryHash);
  assert.equal(entries[3]?.prevHash, entries[2]?.entryHash);
  assert.deepEqual(
    entries.map((entry) => entry.kind),
    ["decision_run", "operator_activity", "probe_run", "replay_run"],
  );
});

test("audit ledger verifies tampering and exports NDJSON manifests", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-ledger-verify-"));
  const ledgerPath = path.join(tempDir, "ledger.sqlite");
  const exportDir = path.join(tempDir, "exports");
  const ledger = new AuditLedgerStore({
    ledgerPath,
    legacyRunsPath: path.join(tempDir, "runs.json"),
    legacyActivityPath: path.join(tempDir, "activity.json"),
    exportDir,
    environment: "beta",
    teamScope: "audit",
  });
  const auditStore = new AuditRunStore({ ledger });
  const activityStore = new OperatorActivityStore({ ledger });
  const event = makeEvent("event-42", 420000);
  const pack = makePack(true);
  const decision = runDecision({
    request: {
      mode: "L1",
      event_payload: event,
      available_evidence: ["signed_contract", "invoice"],
    },
    packs: [pack],
  });

  const decisionSummary = await auditStore.recordDecision({
    mode: "L1",
    packPaths: ["examples/packs"],
    event,
    result: decision,
    actor: {
      id: "operator-2",
      name: "Ryan Reviewer",
      role: "reviewer",
    },
  });
  await activityStore.record({
    action: "runtime.probe",
    actor: {
      id: "operator-2",
      name: "Ryan Reviewer",
      role: "reviewer",
    },
    subject: "qwen3:8b",
    message: "Probe completed.",
  });

  const initialVerification = await ledger.verifyIntegrity({
    id: "admin-1",
    name: "Alice Admin",
    role: "admin",
  });
  const initialIntegrity = await ledger.getIntegrityStatus();

  assert.equal(initialVerification.status, "verified");
  assert.equal(initialIntegrity.status, "verified");

  const db = new DatabaseSync(ledgerPath);
  db.prepare("UPDATE ledger_entries SET payload_json = ? WHERE entry_id = ?").run(
    JSON.stringify({
      tampered: true,
    }),
    decisionSummary.id,
  );
  db.close();

  const mismatchedVerification = await ledger.verifyIntegrity({
    id: "admin-1",
    name: "Alice Admin",
    role: "admin",
  });
  const exportBatch = await ledger.createExportBatch({
    actor: {
      id: "admin-1",
      name: "Alice Admin",
      role: "admin",
    },
    sequenceFrom: 1,
    sequenceTo: 2,
  });
  const manifest = JSON.parse(await fs.readFile(exportBatch.manifestFile, "utf8")) as {
    entryCount?: number;
    dataSha256?: string;
    manifestSha256?: string;
  };
  const ndjson = await fs.readFile(exportBatch.dataFile, "utf8");
  const exports = await ledger.listExportBatches(10);

  assert.equal(mismatchedVerification.status, "mismatch");
  assert.ok(mismatchedVerification.mismatchCount >= 1);
  assert.equal(manifest.entryCount, 2);
  assert.equal(manifest.dataSha256, exportBatch.dataSha256);
  assert.equal(manifest.manifestSha256, exportBatch.manifestSha256);
  assert.ok(ndjson.includes("\"sequence\":1"));
  assert.equal(exports[0]?.id, exportBatch.id);
});
