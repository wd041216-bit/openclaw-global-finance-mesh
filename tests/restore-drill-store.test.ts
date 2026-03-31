import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AccessControlStore } from "../src/access-control.ts";
import { AuditLedgerStore } from "../src/audit-ledger.ts";
import { BackupReplicationStore, type S3ReplicationUploader } from "../src/backup-store.ts";
import { RestoreDrillStore } from "../src/restore-drill-store.ts";

async function makeRestoreFixture(rootDir: string): Promise<{
  ledger: AuditLedgerStore;
  accessControl: AccessControlStore;
}> {
  const auditDir = path.join(rootDir, "data", "audit");
  const runtimeDir = path.join(rootDir, "data", "runtime");
  const exportDir = path.join(auditDir, "exports");
  await fs.mkdir(exportDir, { recursive: true });
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(path.join(exportDir, "seed-export.ndjson"), "{\"sequence\":1}\n", "utf8");

  const ledger = new AuditLedgerStore({
    ledgerPath: path.join(auditDir, "ledger.sqlite"),
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

  const accessControl = new AccessControlStore({
    configPath: path.join(runtimeDir, "access-control.json"),
    secretPath: path.join(runtimeDir, "access-control.secrets.json"),
    sessionPath: path.join(runtimeDir, "auth-sessions.sqlite"),
  });
  await accessControl.bootstrapAdmin({
    name: "Alice Admin",
    token: "admin-secret",
    enableAuth: true,
  });
  await accessControl.loginWithToken("admin-secret");

  return {
    ledger,
    accessControl,
  };
}

test("restore drill succeeds from a mounted directory backup target", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-restore-mounted-"));
  const mountedDir = path.join(tempDir, "mounted-backups");
  const { ledger } = await makeRestoreFixture(tempDir);
  const backups = new BackupReplicationStore({
    ledger,
    sourceRoot: tempDir,
    backupRoot: path.join(tempDir, "data", "backups"),
    localDir: mountedDir,
    environment: "beta",
    teamScope: "finance-apac",
  });
  const backup = await backups.runBackup({
    actor: null,
    trigger: "manual",
  });

  const restores = new RestoreDrillStore({
    ledger,
    backups,
    drillRoot: path.join(tempDir, "data", "restore-drills"),
    warnHours: 24,
  });
  const drill = await restores.runDrill({
    actor: null,
    backupId: backup.backupId,
  });

  assert.equal(drill.status, "success");
  assert.equal(drill.sourceType, "mounted_dir");
  assert.ok(drill.checks.every((item) => item.status === "success"));
  assert.ok(await fs.readFile(path.join(drill.restorePath, "data", "audit", "ledger.sqlite")));
});

test("restore drill can recover from S3-compatible storage through the injected transport", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-restore-s3-"));
  const bucketRoot = path.join(tempDir, "s3-bucket");
  const { ledger } = await makeRestoreFixture(tempDir);
  const uploader: S3ReplicationUploader = {
    async replicateDirectory(input) {
      const destination = path.join(bucketRoot, input.snapshotName);
      await fs.mkdir(bucketRoot, { recursive: true });
      await fs.cp(input.snapshotDir, destination, {
        recursive: true,
        force: true,
      });
      return {
        status: "success",
        location: `s3://finance-mesh-backups/${input.snapshotName}`,
        transferredFiles: 5,
        totalBytes: input.totalBytes,
      };
    },
    async downloadDirectory(input) {
      const prefix = input.location.replace(/^s3:\/\/finance-mesh-backups\//, "");
      await fs.cp(path.join(bucketRoot, prefix), input.destinationDir, {
        recursive: true,
        force: true,
      });
      return {
        status: "success",
        location: input.location,
        transferredFiles: 5,
        totalBytes: 0,
      };
    },
  };

  const backups = new BackupReplicationStore({
    ledger,
    sourceRoot: tempDir,
    backupRoot: path.join(tempDir, "data", "backups"),
    environment: "beta",
    teamScope: "finance-apac",
    s3Config: {
      endpoint: "https://s3.example.com",
      region: "auto",
      bucket: "finance-mesh-backups",
      prefix: "",
      accessKeyId: "key-id",
      secretAccessKey: "secret-key",
      forcePathStyle: true,
    },
    s3Uploader: uploader,
  });
  const backup = await backups.runBackup({
    actor: null,
    trigger: "manual",
  });

  const restores = new RestoreDrillStore({
    ledger,
    backups,
    drillRoot: path.join(tempDir, "data", "restore-drills"),
  });
  const drill = await restores.runDrill({
    actor: null,
    backupId: backup.backupId,
    sourceType: "s3",
  });

  assert.equal(drill.status, "success");
  assert.equal(drill.sourceType, "s3");
  assert.ok(drill.checks.some((item) => item.id === "ledger" && item.status === "success"));
});

test("restore drill falls back to local snapshots with a degraded status when no off-box target exists", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-restore-local-"));
  const { ledger } = await makeRestoreFixture(tempDir);
  const backups = new BackupReplicationStore({
    ledger,
    sourceRoot: tempDir,
    backupRoot: path.join(tempDir, "data", "backups"),
    environment: "beta",
    teamScope: "finance-apac",
  });
  const backup = await backups.runBackup({
    actor: null,
    trigger: "manual",
  });

  const restores = new RestoreDrillStore({
    ledger,
    backups,
    drillRoot: path.join(tempDir, "data", "restore-drills"),
  });
  const drill = await restores.runDrill({
    actor: null,
    backupId: backup.backupId,
  });

  assert.equal(drill.status, "degraded");
  assert.equal(drill.sourceType, "local_snapshot");
  assert.ok(drill.checks.some((item) => item.id === "source" && item.status === "warning"));
});

test("restore drill reports the first manifest mismatch when the off-box snapshot is tampered", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-restore-tamper-"));
  const mountedDir = path.join(tempDir, "mounted-backups");
  const { ledger } = await makeRestoreFixture(tempDir);
  const backups = new BackupReplicationStore({
    ledger,
    sourceRoot: tempDir,
    backupRoot: path.join(tempDir, "data", "backups"),
    localDir: mountedDir,
    environment: "beta",
    teamScope: "finance-apac",
  });
  const backup = await backups.runBackup({
    actor: null,
    trigger: "manual",
  });

  await fs.writeFile(
    path.join(mountedDir, path.basename(backup.snapshotPath), "data", "runtime", "access-control.json"),
    "{\"tampered\":true}\n",
    "utf8",
  );

  const restores = new RestoreDrillStore({
    ledger,
    backups,
    drillRoot: path.join(tempDir, "data", "restore-drills"),
  });
  const drill = await restores.runDrill({
    actor: null,
    backupId: backup.backupId,
    sourceType: "mounted_dir",
  });

  assert.equal(drill.status, "failure");
  assert.match(drill.error || "", /Manifest verification failed/);
  assert.ok(drill.checks.some((item) => item.status === "failure"));
});

test("restore drill fails when identity state cannot be read from the restored snapshot", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-restore-identity-"));
  const mountedDir = path.join(tempDir, "mounted-backups");
  const { ledger } = await makeRestoreFixture(tempDir);
  const backups = new BackupReplicationStore({
    ledger,
    sourceRoot: tempDir,
    backupRoot: path.join(tempDir, "data", "backups"),
    localDir: mountedDir,
    environment: "beta",
    teamScope: "finance-apac",
  });
  const backup = await backups.runBackup({
    actor: null,
    trigger: "manual",
  });

  const mountedSnapshotDir = path.join(mountedDir, path.basename(backup.snapshotPath));
  const corruptedSessionBytes = Buffer.from("not a sqlite database", "utf8");
  await fs.writeFile(
    path.join(mountedSnapshotDir, "data", "runtime", "auth-sessions.sqlite"),
    corruptedSessionBytes,
  );
  const manifestPath = path.join(mountedSnapshotDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    files: Array<{ path: string; bytes: number; sha256: string }>;
  };
  const sessionEntry = manifest.files.find((item) => item.path === "data/runtime/auth-sessions.sqlite");
  assert.ok(sessionEntry);
  sessionEntry.bytes = corruptedSessionBytes.byteLength;
  sessionEntry.sha256 = crypto.createHash("sha256").update(corruptedSessionBytes).digest("hex");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const restores = new RestoreDrillStore({
    ledger,
    backups,
    drillRoot: path.join(tempDir, "data", "restore-drills"),
  });
  const drill = await restores.runDrill({
    actor: null,
    backupId: backup.backupId,
    sourceType: "mounted_dir",
  });

  assert.equal(drill.status, "failure");
  assert.match(drill.error || "", /database|no such table/i);
});
