import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readStructuredFile, loadFinancePacksFromPaths } from "../src/fs.ts";
import { runDecision } from "../src/engine.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");

test("finance mesh produces an auditable decision packet for the SaaS prepayment example", async () => {
  const packs = await loadFinancePacksFromPaths([path.join(REPO_ROOT, "examples", "packs")]);
  const event = await readStructuredFile(path.join(REPO_ROOT, "examples", "events", "saas-annual-prepayment.json"));

  const result = runDecision({
    request: {
      mode: "L1",
      event_payload: event as Record<string, unknown> & {
        event_id: string;
        event_type: string;
        entity_id: string;
        source_system: string;
        event_time: string;
      },
    },
    packs: packs.map((item) => item.pack),
  });

  assert.match(result.decisionPacket.summary, /contract_liability/i);
  assert.equal(result.decisionPacket.risk_rating, "medium");
  assert.equal(result.decisionPacket.tax_treatment.tax_review_required, true);
  assert.equal(result.missingEvidence.length, 0);
  assert.ok(result.decisionPacket.rule_versions.includes("SAAS-REV-001@1.0.0"));
  assert.ok(result.decisionPacket.approval_route.default);
  assert.ok(result.evidenceGraph.nodes.length >= 3);
  assert.ok(result.decisionPacket.control_results.some((item) => item.control_id === "document_completeness_check"));
});

