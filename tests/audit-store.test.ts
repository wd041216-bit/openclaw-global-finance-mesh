import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

test("audit store persists decision and replay runs and returns newest-first summaries", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-audit-"));
  const store = new AuditRunStore({
    ledgerPath: path.join(tempDir, "ledger.sqlite"),
    legacyRunsPath: path.join(tempDir, "runs.json"),
    legacyActivityPath: path.join(tempDir, "activity.json"),
    exportDir: path.join(tempDir, "exports"),
    environment: "test",
    teamScope: "qa",
  });
  const baselinePack = makePack(true);
  const candidatePack = makePack(false);
  const event = makeEvent("event-1", 120000);

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

  const decisionSummary = await store.recordDecision({
    mode: "L1",
    packPaths: ["examples/packs"],
    event,
    result: decision,
  });
  const replaySummary = await store.recordReplay({
    mode: "L1",
    baselinePackPaths: ["examples/packs"],
    candidatePackPaths: ["candidate/packs"],
    events: [event],
    replay,
  });
  const probeSummary = await store.recordProbe({
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
      listModelsOk: true,
      inferenceOk: true,
      availableModels: ["qwen3:8b", "llama3.2"],
      inferencePreview: "cloud ok",
    },
    actor: {
      id: "operator-1",
      name: "Olivia Operator",
      role: "operator",
    },
  });

  const summaries = await store.list(10);
  const decisionAndReplay = await store.list(10, {
    types: ["decision", "replay"],
  });
  const probes = await store.list(10, {
    types: ["probe"],
  });
  const replayRecord = await store.get(replaySummary.id);
  const probeRecord = await store.get(probeSummary.id);

  assert.equal(summaries.length, 3);
  assert.equal(summaries[0]?.id, probeSummary.id);
  assert.equal(summaries[1]?.id, replaySummary.id);
  assert.equal(summaries[2]?.id, decisionSummary.id);
  assert.deepEqual(
    decisionAndReplay.map((item) => item.type),
    ["replay", "decision"],
  );
  assert.deepEqual(
    probes.map((item) => item.type),
    ["probe"],
  );
  assert.equal(decisionSummary.decisionPacketId, decision.decisionPacket.decision_packet_id);
  assert.equal(replaySummary.changedEvents, 1);
  assert.equal(replayRecord?.type, "replay");
  assert.deepEqual(replayRecord?.eventIds, ["event-1"]);
  assert.equal(
    (replayRecord?.detail.replay as { changed_events?: number } | undefined)?.changed_events,
    1,
  );
  assert.equal(probeRecord?.type, "probe");
  assert.equal(probeRecord?.probeOk, true);
  assert.equal(probeRecord?.availableModelCount, 2);
  assert.equal((probeRecord?.detail.config as { model?: string } | undefined)?.model, "qwen3:8b");
  assert.equal(probeRecord?.sequence, 3);
  assert.equal(probeRecord?.chainStatus, "pending");
  assert.equal(probeRecord?.environment, "test");
  assert.equal(probeRecord?.teamScope, "qa");
});
