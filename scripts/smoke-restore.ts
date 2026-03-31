import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AccessControlStore } from "../src/access-control.ts";
import { AuditLedgerStore } from "../src/audit-ledger.ts";
import { BackupReplicationStore } from "../src/backup-store.ts";
import { RestoreDrillStore } from "../src/restore-drill-store.ts";

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-smoke-restore-"));
  const mountedDir = path.join(tempDir, "offbox-backups");
  const auditDir = path.join(tempDir, "data", "audit");
  const runtimeDir = path.join(tempDir, "data", "runtime");
  const exportDir = path.join(auditDir, "exports");
  await fs.mkdir(exportDir, { recursive: true });
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(path.join(exportDir, "seed-export.ndjson"), "{\"sequence\":1}\n", "utf8");

  const ledger = new AuditLedgerStore({
    ledgerPath: path.join(auditDir, "ledger.sqlite"),
    legacyRunsPath: path.join(auditDir, "runs.json"),
    legacyActivityPath: path.join(auditDir, "activity.json"),
    exportDir,
    environment: "ci",
    teamScope: "smoke",
  });
  await ledger.appendEntry({
    entryId: "seed-entry",
    kind: "operator_activity",
    createdAt: "2026-03-31T01:00:00.000Z",
    actor: {
      id: "admin-1",
      name: "Smoke Admin",
      role: "admin",
    },
    subject: "seed",
    payload: {
      id: "seed-entry",
      message: "Seed audit event.",
    },
  });

  const accessControl = new AccessControlStore({
    configPath: path.join(runtimeDir, "access-control.json"),
    secretPath: path.join(runtimeDir, "access-control.secrets.json"),
    sessionPath: path.join(runtimeDir, "auth-sessions.sqlite"),
  });
  await accessControl.bootstrapAdmin({
    name: "Smoke Admin",
    token: "smoke-admin-token",
    enableAuth: true,
  });
  const login = await accessControl.loginWithToken("smoke-admin-token");

  const backups = new BackupReplicationStore({
    ledger,
    sourceRoot: tempDir,
    backupRoot: path.join(tempDir, "data", "backups"),
    localDir: mountedDir,
    environment: "ci",
    teamScope: "smoke",
  });
  const backup = await backups.runBackup({
    actor: login.actor,
    trigger: "manual",
  });

  const restores = new RestoreDrillStore({
    ledger,
    backups,
    drillRoot: path.join(tempDir, "data", "restore-drills"),
    warnHours: 24,
  });
  const restore = await restores.runDrill({
    actor: login.actor,
    backupId: backup.backupId,
  });

  assert.equal(backup.status, "success");
  assert.equal(restore.status, "success");
  assert.ok(restore.checks.every((item) => item.status === "success"));

  console.log(
    JSON.stringify(
      {
        backupId: backup.backupId,
        restoreId: restore.drillId,
        sourceType: restore.sourceType,
        status: restore.status,
      },
      null,
      2,
    ),
  );
}

await main();
