import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AuditLedgerStore } from "../src/audit-ledger.ts";
import { BackupReplicationStore, type S3ReplicationUploader } from "../src/backup-store.ts";

async function makeBackupFixture(rootDir: string): Promise<{
  ledger: AuditLedgerStore;
  ledgerPath: string;
}> {
  const auditDir = path.join(rootDir, "data", "audit");
  const runtimeDir = path.join(rootDir, "data", "runtime");
  const exportDir = path.join(auditDir, "exports");
  const ledgerPath = path.join(auditDir, "ledger.sqlite");

  await fs.mkdir(exportDir, { recursive: true });
  await fs.mkdir(runtimeDir, { recursive: true });
  const sessionDb = new DatabaseSync(path.join(runtimeDir, "auth-sessions.sqlite"));
  sessionDb.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      session_id TEXT PRIMARY KEY,
      actor_name TEXT NOT NULL
    );
    INSERT INTO auth_sessions (session_id, actor_name) VALUES ('session-1', 'Alice Admin');
  `);
  sessionDb.close();
  await fs.writeFile(path.join(runtimeDir, "access-control.json"), JSON.stringify({ enabled: true }, null, 2), "utf8");
  await fs.writeFile(
    path.join(runtimeDir, "access-control.secrets.json"),
    JSON.stringify({ tokenHashes: {} }, null, 2),
    "utf8",
  );
  await fs.writeFile(path.join(exportDir, "seed-export.ndjson"), "{\"sequence\":1}\n", "utf8");

  const ledger = new AuditLedgerStore({
    ledgerPath,
    legacyRunsPath: path.join(auditDir, "runs.json"),
    legacyActivityPath: path.join(auditDir, "activity.json"),
    exportDir,
    environment: "beta",
    teamScope: "finance-apac",
  });
  await ledger.appendEntry({
    entryId: "seed-entry",
    kind: "operator_activity",
    createdAt: "2026-03-31T01:00:00.000Z",
    actor: {
      id: "admin-1",
      name: "Alice Admin",
      role: "admin",
    },
    subject: "seed",
    payload: {
      id: "seed-entry",
      message: "Seed audit event.",
    },
  });

  return {
    ledger,
    ledgerPath,
  };
}

test("backup store snapshots ledger state and replicates to a mounted directory target", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-backup-local-"));
  const mountedDir = path.join(tempDir, "mounted-backups");
  const { ledger, ledgerPath } = await makeBackupFixture(tempDir);

  const store = new BackupReplicationStore({
    ledger,
    sourceRoot: tempDir,
    backupRoot: path.join(tempDir, "data", "backups"),
    localDir: mountedDir,
    environment: "beta",
    teamScope: "finance-apac",
  });

  const backup = await store.runBackup({
    actor: {
      id: "admin-1",
      name: "Alice Admin",
      role: "admin",
    },
    trigger: "manual",
  });

  const manifestFile = path.join(backup.snapshotPath, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8")) as {
    files: Array<{ path: string }>;
    archiveSha256: string;
  };

  assert.equal(backup.status, "success");
  assert.equal(backup.targets[0]?.type, "local_dir");
  assert.equal(backup.targets[0]?.status, "success");
  assert.equal(backup.targets[1]?.type, "s3");
  assert.equal(backup.targets[1]?.status, "not_configured");
  assert.ok(backup.archiveSha256);
  assert.equal(manifest.archiveSha256, backup.archiveSha256);
  assert.ok(manifest.files.some((item) => item.path === "data/audit/ledger.sqlite"));
  assert.ok(manifest.files.some((item) => item.path === "data/audit/exports/seed-export.ndjson"));
  assert.ok(await fs.readFile(path.join(backup.snapshotPath, "data", "audit", "ledger.sqlite")));
  assert.ok(await fs.readFile(path.join(mountedDir, path.basename(backup.snapshotPath), "manifest.json")));
  assert.ok(await fs.readFile(ledgerPath));

  const latest = await store.getLatest();
  assert.equal(latest?.backupId, backup.backupId);
});

test("backup store supports S3-compatible replication through an injected uploader", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-backup-s3-"));
  const { ledger } = await makeBackupFixture(tempDir);
  const uploadedSnapshots: string[] = [];
  const uploader: S3ReplicationUploader = {
    async replicateDirectory(input) {
      uploadedSnapshots.push(input.snapshotName);
      return {
        status: "success",
        location: `s3://finance-mesh-backups/${input.snapshotName}`,
        transferredFiles: 5,
        totalBytes: input.totalBytes,
      };
    },
  };

  const store = new BackupReplicationStore({
    ledger,
    sourceRoot: tempDir,
    backupRoot: path.join(tempDir, "data", "backups"),
    environment: "beta",
    teamScope: "finance-apac",
    s3Config: {
      endpoint: "https://s3.example.com",
      region: "auto",
      bucket: "finance-mesh-backups",
      prefix: "beta",
      accessKeyId: "key-id",
      secretAccessKey: "secret-key",
      forcePathStyle: true,
    },
    s3Uploader: uploader,
  });

  const backup = await store.runBackup({
    actor: null,
    trigger: "scheduled",
  });

  assert.equal(backup.status, "success");
  assert.equal(backup.targets[0]?.type, "local_dir");
  assert.equal(backup.targets[0]?.status, "not_configured");
  assert.equal(backup.targets[1]?.type, "s3");
  assert.equal(backup.targets[1]?.status, "success");
  assert.equal(uploadedSnapshots.length, 1);
  assert.match(backup.targets[1]?.location || "", /^s3:\/\/finance-mesh-backups\//);
});
