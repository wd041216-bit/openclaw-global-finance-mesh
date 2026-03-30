import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadFinancePacksFromPaths } from "../src/fs.ts";
import { validatePackCollection } from "../src/validation.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");

test("example packs validate cleanly", async () => {
  const packs = await loadFinancePacksFromPaths([path.join(REPO_ROOT, "examples", "packs")]);
  const validation = validatePackCollection(packs);

  assert.equal(packs.length, 5);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

