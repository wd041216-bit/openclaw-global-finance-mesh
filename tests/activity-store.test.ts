import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { OperatorActivityStore } from "../src/activity-store.ts";

test("operator activity store persists newest-first governance events", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-activity-"));
  const store = new OperatorActivityStore(path.join(tempDir, "activity.json"));

  const first = await store.record({
    action: "runtime.update_config",
    actor: {
      id: "admin-1",
      name: "Alice Admin",
      role: "admin",
    },
    subject: "qwen3:8b",
    message: "Updated brain runtime to local mode.",
    detail: {
      after: {
        mode: "local",
        model: "qwen3:8b",
      },
    },
  });

  const second = await store.record({
    action: "runtime.probe",
    actor: {
      id: "operator-1",
      name: "Olivia Operator",
      role: "operator",
    },
    outcome: "failure",
    subject: "qwen3:8b",
    message: "Probe reached runtime, but inference failed.",
    relatedRunId: "probe-run-1",
    detail: {
      inferenceOk: false,
    },
  });

  const summaries = await store.list(10);
  const detail = await store.get(second.id);

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.id, second.id);
  assert.equal(summaries[1]?.id, first.id);
  assert.equal(summaries[0]?.outcome, "failure");
  assert.equal(detail?.action, "runtime.probe");
  assert.equal(detail?.relatedRunId, "probe-run-1");
  assert.equal((detail?.detail.inferenceOk as boolean | undefined) ?? true, false);
});
