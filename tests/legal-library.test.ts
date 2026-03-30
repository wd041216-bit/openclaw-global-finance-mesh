import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LegalLibraryStore } from "../src/legal-library.ts";

test("legal library stores, searches, and returns context packets", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-library-"));
  const libraryPath = path.join(tempDir, "library.json");
  const store = new LegalLibraryStore(libraryPath);

  const created = await store.createDocument({
    title: "Transfer Pricing Control Note",
    jurisdiction: "CN",
    domain: "tax",
    sourceType: "manual",
    sourceRef: "manual://transfer-pricing",
    tags: ["transfer-pricing", "related-party"],
    body: "Related-party cross-border payments require transfer pricing review and documented support.",
  });

  const beforeApproval = await store.buildContext("transfer pricing support", 3);
  await store.updateStatus(created.id, "approved", "Finance Reviewer");
  const results = await store.search("cross border transfer pricing", 5);
  const context = await store.buildContext("transfer pricing support", 3);

  assert.equal(results.length, 1);
  assert.equal(beforeApproval.citations.length, 0);
  assert.match(results[0].excerpt, /transfer pricing review/i);
  assert.equal(context.citations.length, 1);
  assert.match(context.context, /Legal Source 1/);
  assert.match(context.context, /approved/i);
});
