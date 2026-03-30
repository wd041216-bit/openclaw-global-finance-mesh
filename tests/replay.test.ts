import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readStructuredFile, loadFinancePacksFromPaths } from "../src/fs.ts";
import { runReplay } from "../src/replay.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");

test("replay highlights candidate pack drift", async () => {
  const packs = await loadFinancePacksFromPaths([path.join(REPO_ROOT, "examples", "packs")]);
  const event = await readStructuredFile(path.join(REPO_ROOT, "examples", "events", "saas-annual-prepayment.json"));
  const baselinePacks = packs.map((item) => item.pack);
  const candidatePacks = structuredClone(baselinePacks);

  const countryPack = candidatePacks.find((pack) => pack.pack_id === "CN_COUNTRY_CORE_v1.3.0");
  assert.ok(countryPack);
  const taxRule = countryPack.rules.find((rule) => rule.rule_id === "CN-TAX-REV-001");
  assert.ok(taxRule);
  taxRule.actions = {
    ...(taxRule.actions ?? {}),
    tax_treatment: {
      tax_review_required: false,
      filing_flag: false,
      reason: "Candidate pack removes tax review for test coverage.",
      output_tags: [],
    },
  };

  const replay = runReplay({
    mode: "L1",
    events: [
      event as Record<string, unknown> & {
        event_id: string;
        event_type: string;
        entity_id: string;
        source_system: string;
        event_time: string;
      },
    ],
    baselinePacks,
    candidatePacks,
  });

  assert.equal(replay.ok, true);
  assert.equal(replay.compared_events, 1);
  assert.equal(replay.changed_events, 1);
  assert.ok(
    (replay.diffs[0]?.changed_fields as string[] | undefined)?.includes("tax_treatment"),
  );
});

