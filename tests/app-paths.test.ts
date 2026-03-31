import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveFinanceMeshPaths } from "../src/app-paths.ts";

const MODULE_URL = new URL("../src/runtime-config.ts", import.meta.url).href;

test("resolveFinanceMeshPaths uses repo data directory by default", () => {
  const previous = process.env.FINANCE_MESH_DATA_ROOT;
  delete process.env.FINANCE_MESH_DATA_ROOT;

  try {
    const paths = resolveFinanceMeshPaths(MODULE_URL);
    assert.match(paths.repoRoot, /zhouheng-global-finance-mesh$/);
    assert.equal(paths.dataRoot, path.join(paths.repoRoot, "data"));
    assert.equal(paths.runtimeDir, path.join(paths.dataRoot, "runtime"));
    assert.equal(paths.auditDir, path.join(paths.dataRoot, "audit"));
  } finally {
    if (previous) {
      process.env.FINANCE_MESH_DATA_ROOT = previous;
    }
  }
});

test("resolveFinanceMeshPaths respects FINANCE_MESH_DATA_ROOT override", () => {
  const previous = process.env.FINANCE_MESH_DATA_ROOT;
  process.env.FINANCE_MESH_DATA_ROOT = "/tmp/finance-mesh-desktop-data";

  try {
    const paths = resolveFinanceMeshPaths(MODULE_URL);
    assert.equal(paths.dataRoot, "/tmp/finance-mesh-desktop-data");
    assert.equal(paths.backupRoot, "/tmp/finance-mesh-desktop-data/backups");
    assert.equal(paths.restoreDrillRoot, "/tmp/finance-mesh-desktop-data/restore-drills");
    assert.equal(paths.legalLibraryPath, "/tmp/finance-mesh-desktop-data/legal-library/library.json");
  } finally {
    if (previous) {
      process.env.FINANCE_MESH_DATA_ROOT = previous;
    } else {
      delete process.env.FINANCE_MESH_DATA_ROOT;
    }
  }
});
