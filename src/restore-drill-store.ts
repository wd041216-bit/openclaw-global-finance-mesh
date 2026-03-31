import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { resolveFinanceMeshPaths } from "./app-paths.ts";
import { AuditLedgerStore } from "./audit-ledger.ts";
import { BackupReplicationStore } from "./backup-store.ts";

import type { AuthenticatedActor } from "./access-control.ts";
import type { BackupJobRecord, BackupJobSummary, BackupSnapshotManifest } from "./backup-store.ts";
import type { IntegrityInspection, LedgerMetadata } from "./audit-ledger.ts";

export type RestoreSourceType = "s3" | "mounted_dir" | "local_snapshot";
export type RestoreDrillStatus = "success" | "degraded" | "failure";
export type RestoreCheckStatus = "success" | "warning" | "failure";

export interface RestoreDrillCheck {
  id: string;
  label: string;
  status: RestoreCheckStatus;
  summary: string;
  detail?: Record<string, unknown>;
}

export interface RestoreDrillSummary extends LedgerMetadata {
  drillId: string;
  backupId?: string;
  sourceType: RestoreSourceType;
  sourceLocation: string;
  status: RestoreDrillStatus;
  createdAt: string;
  completedAt?: string;
  restorePath: string;
  checks: RestoreDrillCheck[];
  error?: string;
}

export interface RestoreDrillRecord extends RestoreDrillSummary {
  detail: {
    manifestPath?: string;
    manifest?: BackupSnapshotManifest;
    restoredFiles: string[];
    cleanupCutoffAt: string;
    integrityInspection?: IntegrityInspection;
  };
}

interface RestoreDrillStoreOptions {
  ledger?: AuditLedgerStore;
  backups?: BackupReplicationStore;
  drillRoot?: string;
  retentionDays?: number;
  warnHours?: number;
}

interface ResolvedRestoreSource {
  backup: BackupJobSummary | BackupJobRecord | null;
  backupId?: string;
  sourceType: RestoreSourceType;
  sourceLocation: string;
}

const { restoreDrillRoot: RESTORE_ROOT } = resolveFinanceMeshPaths(import.meta.url);

export class RestoreDrillStore {
  private readonly ledger: AuditLedgerStore;
  private readonly backups: BackupReplicationStore;
  private readonly drillRoot: string;
  private readonly retentionDays: number;
  private readonly warnHours: number;

  constructor(options?: RestoreDrillStoreOptions) {
    this.ledger = options?.ledger ?? new AuditLedgerStore();
    this.backups = options?.backups ?? new BackupReplicationStore({ ledger: this.ledger });
    this.drillRoot = options?.drillRoot ?? RESTORE_ROOT;
    this.retentionDays = normalizePositiveInteger(
      options?.retentionDays ?? process.env.FINANCE_MESH_RESTORE_DRILL_RETENTION_DAYS,
      7,
    );
    this.warnHours = normalizePositiveInteger(
      options?.warnHours ?? process.env.FINANCE_MESH_RESTORE_DRILL_WARN_HOURS,
      168,
    );
  }

  async runDrill(input: {
    actor: AuthenticatedActor | null;
    backupId?: string;
    sourceType?: RestoreSourceType;
  }): Promise<RestoreDrillRecord> {
    await fs.mkdir(this.drillRoot, { recursive: true });
    await this.cleanupExpiredDrills();

    const createdAt = new Date().toISOString();
    const drillId = crypto.randomUUID();
    const drillDir = path.join(this.drillRoot, `${createdAt.replaceAll(":", "-")}-${drillId}`);
    const restorePath = path.join(drillDir, "restored");
    const cleanupCutoffAt = new Date(Date.now() + this.retentionDays * 24 * 60 * 60 * 1000).toISOString();

    let resolved: ResolvedRestoreSource | null = null;
    const checks: RestoreDrillCheck[] = [];
    let manifestPath: string | undefined;
    let manifest: BackupSnapshotManifest | undefined;
    let restoredFiles: string[] = [];
    let integrityInspection: IntegrityInspection | undefined;
    let errorMessage: string | undefined;

    try {
      resolved = await this.resolveSource({
        backupId: input.backupId,
        sourceType: input.sourceType,
      });
      await fs.mkdir(restorePath, { recursive: true });

      checks.push(
        createCheck({
          id: "source",
          label: "恢复源",
          status: resolved.sourceType === "local_snapshot" ? "warning" : "success",
          summary:
            resolved.sourceType === "local_snapshot"
              ? "仅验证了本地 snapshot 恢复，尚未证明 off-box 目标可直接恢复。"
              : `已从 ${translateRestoreSource(resolved.sourceType)} 读取恢复副本。`,
          detail: {
            sourceType: resolved.sourceType,
            sourceLocation: resolved.sourceLocation,
            backupId: resolved.backupId,
          },
        }),
      );

      await this.materializeSource(resolved, restorePath);
      const manifestCheck = await this.verifyManifest(restorePath);
      manifestPath = manifestCheck.manifestPath;
      manifest = manifestCheck.manifest;
      restoredFiles = manifestCheck.restoredFiles;
      checks.push(manifestCheck.check);

      const ledgerCheck = await this.verifyRestoredLedger(restorePath);
      integrityInspection = ledgerCheck.inspection;
      checks.push(ledgerCheck.check);

      checks.push(await this.verifyIdentityState(restorePath));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      checks.push(
        createCheck({
          id: "restore",
          label: "恢复演练",
          status: "failure",
          summary: errorMessage,
        }),
      );
    }

    const status = summarizeRestoreStatus(checks);
    const record: RestoreDrillRecord = {
      drillId,
      backupId: resolved?.backupId,
      sourceType: resolved?.sourceType ?? input.sourceType ?? "local_snapshot",
      sourceLocation: resolved?.sourceLocation ?? "unresolved",
      status,
      createdAt,
      completedAt: new Date().toISOString(),
      restorePath,
      checks,
      error: errorMessage ?? summarizeRestoreError(status, checks),
      sequence: 0,
      entryHash: "",
      prevHash: "",
      environment: "",
      teamScope: "",
      chainStatus: "pending",
      detail: {
        manifestPath,
        manifest,
        restoredFiles,
        cleanupCutoffAt,
        integrityInspection,
      },
    };

    const entry = await this.ledger.appendEntry({
      entryId: drillId,
      kind: "restore_drill",
      createdAt,
      actor: input.actor,
      subject: resolved ? `${resolved.sourceType}:${resolved.backupId ?? "adhoc"}` : "restore_drill_failed",
      payload: record,
    });

    return this.toRecord(entry.payload, entry);
  }

  async list(limit = 10): Promise<RestoreDrillSummary[]> {
    const entries = await this.ledger.listEntries<RestoreDrillRecord>({
      kinds: ["restore_drill"],
      limit,
    });
    return entries.map((entry) => this.toSummary(entry.payload, entry));
  }

  async get(drillId: string): Promise<RestoreDrillRecord | null> {
    const entry = await this.ledger.getEntry<RestoreDrillRecord>(drillId, {
      kinds: ["restore_drill"],
    });
    return entry ? this.toRecord(entry.payload, entry) : null;
  }

  async getLatest(): Promise<RestoreDrillSummary | null> {
    const [latest] = await this.list(1);
    return latest ?? null;
  }

  async getLatestSuccessful(): Promise<RestoreDrillSummary | null> {
    const drills = await this.list(25);
    return drills.find((item) => item.status === "success") ?? null;
  }

  getWarnHours(): number {
    return this.warnHours;
  }

  private async resolveSource(input: {
    backupId?: string;
    sourceType?: RestoreSourceType;
  }): Promise<ResolvedRestoreSource> {
    if (input.backupId) {
      const backup = await this.backups.get(input.backupId);
      if (!backup) {
        throw new Error(`Backup ${input.backupId} was not found.`);
      }
      return selectSourceFromBackup(backup, input.sourceType);
    }

    const backups = await this.backups.list(30);
    if (backups.length === 0) {
      throw new Error("No backup records are available for a restore drill.");
    }

    if (input.sourceType) {
      for (const backup of backups) {
        try {
          return selectSourceFromBackup(backup, input.sourceType);
        } catch {
          continue;
        }
      }
      throw new Error(`No backup contains a usable ${translateRestoreSource(input.sourceType)} source.`);
    }

    for (const preferredSource of ["s3", "mounted_dir"] as const) {
      for (const backup of backups) {
        try {
          return selectSourceFromBackup(backup, preferredSource);
        } catch {
          continue;
        }
      }
    }

    return selectSourceFromBackup(backups[0], "local_snapshot");
  }

  private async materializeSource(source: ResolvedRestoreSource, restorePath: string): Promise<void> {
    if (source.sourceType === "local_snapshot" || source.sourceType === "mounted_dir") {
      await fs.cp(source.sourceLocation, restorePath, {
        recursive: true,
        force: true,
      });
      return;
    }

    const download = await this.backups.downloadFromS3(source.sourceLocation, restorePath);
    if (download.status !== "success") {
      throw new Error(download.error || `Failed to restore from ${source.sourceLocation}.`);
    }
  }

  private async verifyManifest(restorePath: string): Promise<{
    manifestPath: string;
    manifest: BackupSnapshotManifest;
    restoredFiles: string[];
    check: RestoreDrillCheck;
  }> {
    const manifestPath = path.join(restorePath, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as BackupSnapshotManifest;
    const restoredFiles: string[] = [];
    const mismatches: string[] = [];

    for (const item of manifest.files) {
      const absolutePath = path.join(restorePath, item.path);
      try {
        const content = await fs.readFile(absolutePath);
        restoredFiles.push(item.path);
        const sha256 = hashBuffer(content);
        if (sha256 !== item.sha256) {
          mismatches.push(`${item.path}: expected ${item.sha256}, received ${sha256}`);
        }
      } catch (error) {
        mismatches.push(
          `${item.path}: ${(error as Error).message}`,
        );
      }
    }

    if (mismatches.length > 0) {
      throw new Error(`Manifest verification failed: ${mismatches[0]}`);
    }

    return {
      manifestPath,
      manifest,
      restoredFiles,
      check: createCheck({
        id: "manifest",
        label: "快照清单",
        status: manifest.missingFiles?.length ? "warning" : "success",
        summary: manifest.missingFiles?.length
          ? `manifest 可读且文件哈希一致，但快照生成时缺少 ${manifest.missingFiles.length} 个源文件。`
          : `manifest 已通过校验，共验证 ${manifest.files.length} 个文件。`,
        detail: {
          manifestPath,
          archiveSha256: manifest.archiveSha256,
          fileCount: manifest.files.length,
          missingFiles: manifest.missingFiles,
        },
      }),
    };
  }

  private async verifyRestoredLedger(restorePath: string): Promise<{
    inspection: IntegrityInspection;
    check: RestoreDrillCheck;
  }> {
    const ledgerPath = path.join(restorePath, "data", "audit", "ledger.sqlite");
    await fs.access(ledgerPath);
    const restoredLedger = new AuditLedgerStore({
      ledgerPath,
      legacyRunsPath: path.join(restorePath, "data", "audit", "runs.json"),
      legacyActivityPath: path.join(restorePath, "data", "audit", "activity.json"),
      exportDir: path.join(restorePath, "data", "audit", "exports"),
    });
    const inspection = await restoredLedger.inspectIntegrity();
    if (inspection.status === "mismatch") {
      throw new Error(`Restored ledger has ${inspection.mismatchCount} integrity mismatches.`);
    }
    return {
      inspection,
      check: createCheck({
        id: "ledger",
        label: "账本完整性",
        status: "success",
        summary: `恢复副本已通过完整链路复算，最新序号 #${inspection.latestSequence}。`,
        detail: {
          latestSequence: inspection.latestSequence,
          inspectedAt: inspection.inspectedAt,
        },
      }),
    };
  }

  private async verifyIdentityState(restorePath: string): Promise<RestoreDrillCheck> {
    const sessionPath = path.join(restorePath, "data", "runtime", "auth-sessions.sqlite");
    const configPath = path.join(restorePath, "data", "runtime", "access-control.json");
    const secretPath = path.join(restorePath, "data", "runtime", "access-control.secrets.json");

    await Promise.all([
      fs.access(sessionPath),
      fs.access(configPath),
      fs.access(secretPath),
    ]);

    const sessionDb = new DatabaseSync(sessionPath);
    const sessionStats = sessionDb.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get() as { count?: number } | undefined;
    sessionDb.close();

    const [config, secrets] = await Promise.all([
      readJsonFile<Record<string, unknown>>(configPath),
      readJsonFile<Record<string, unknown>>(secretPath),
    ]);
    const operatorCount = Array.isArray(config?.operators) ? config.operators.length : 0;
    const tokenHashCount = secrets?.tokenHashes && typeof secrets.tokenHashes === "object"
      ? Object.keys(secrets.tokenHashes as Record<string, unknown>).length
      : 0;

    return createCheck({
      id: "identity",
      label: "身份状态",
      status: "success",
      summary: `身份状态文件可读，恢复副本包含 ${sessionStats?.count ?? 0} 条会话和 ${operatorCount} 个本地 operator。`,
      detail: {
        sessionPath,
        configPath,
        secretPath,
        activeSessions: sessionStats?.count ?? 0,
        operatorCount,
        tokenHashCount,
      },
    });
  }

  private async cleanupExpiredDrills(): Promise<void> {
    const entries = await fs.readdir(this.drillRoot, {
      withFileTypes: true,
    }).catch(() => []);
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const entryPath = path.join(this.drillRoot, entry.name);
      const stats = await fs.stat(entryPath).catch(() => null);
      if (stats && stats.mtimeMs < cutoff) {
        await fs.rm(entryPath, { recursive: true, force: true });
      }
    }
  }

  private toSummary(
    payload: RestoreDrillRecord,
    metadata: Pick<
      RestoreDrillRecord,
      "sequence" | "entryHash" | "prevHash" | "environment" | "teamScope" | "chainStatus" | "chainVerifiedAt"
    >,
  ): RestoreDrillSummary {
    const { detail: _detail, ...summary } = payload;
    return {
      ...summary,
      sequence: metadata.sequence,
      entryHash: metadata.entryHash,
      prevHash: metadata.prevHash,
      environment: metadata.environment,
      teamScope: metadata.teamScope,
      chainStatus: metadata.chainStatus,
      chainVerifiedAt: metadata.chainVerifiedAt,
    };
  }

  private toRecord(payload: RestoreDrillRecord, metadata: RestoreDrillRecord): RestoreDrillRecord {
    return {
      ...payload,
      sequence: metadata.sequence,
      entryHash: metadata.entryHash,
      prevHash: metadata.prevHash,
      environment: metadata.environment,
      teamScope: metadata.teamScope,
      chainStatus: metadata.chainStatus,
      chainVerifiedAt: metadata.chainVerifiedAt,
    };
  }
}

function selectSourceFromBackup(
  backup: BackupJobSummary | BackupJobRecord,
  requestedSourceType?: RestoreSourceType,
): ResolvedRestoreSource {
  if (requestedSourceType === "s3") {
    const s3Target = backup.targets.find((item) => item.type === "s3" && item.status === "success" && item.location);
    if (!s3Target?.location) {
      throw new Error(`Backup ${backup.backupId} does not contain a restorable S3 target.`);
    }
    return {
      backup,
      backupId: backup.backupId,
      sourceType: "s3",
      sourceLocation: s3Target.location,
    };
  }

  if (requestedSourceType === "mounted_dir") {
    const localTarget = backup.targets.find((item) => item.type === "local_dir" && item.status === "success" && item.location);
    if (!localTarget?.location) {
      throw new Error(`Backup ${backup.backupId} does not contain a mounted-directory restore target.`);
    }
    return {
      backup,
      backupId: backup.backupId,
      sourceType: "mounted_dir",
      sourceLocation: localTarget.location,
    };
  }

  if (requestedSourceType === "local_snapshot") {
    return {
      backup,
      backupId: backup.backupId,
      sourceType: "local_snapshot",
      sourceLocation: backup.snapshotPath,
    };
  }

  return (
    trySelectBackupSource(backup, "s3")
    || trySelectBackupSource(backup, "mounted_dir")
    || {
      backup,
      backupId: backup.backupId,
      sourceType: "local_snapshot",
      sourceLocation: backup.snapshotPath,
    }
  );
}

function trySelectBackupSource(
  backup: BackupJobSummary | BackupJobRecord,
  sourceType: Extract<RestoreSourceType, "s3" | "mounted_dir">,
): ResolvedRestoreSource | null {
  try {
    return selectSourceFromBackup(backup, sourceType);
  } catch {
    return null;
  }
}

function createCheck(input: {
  id: string;
  label: string;
  status: RestoreCheckStatus;
  summary: string;
  detail?: Record<string, unknown>;
}): RestoreDrillCheck {
  return {
    id: input.id,
    label: input.label,
    status: input.status,
    summary: input.summary,
    detail: input.detail,
  };
}

function summarizeRestoreStatus(checks: RestoreDrillCheck[]): RestoreDrillStatus {
  if (checks.some((item) => item.status === "failure")) {
    return "failure";
  }
  if (checks.some((item) => item.status === "warning")) {
    return "degraded";
  }
  return "success";
}

function summarizeRestoreError(status: RestoreDrillStatus, checks: RestoreDrillCheck[]): string | undefined {
  if (status === "success") {
    return undefined;
  }
  return checks.find((item) => item.status === "failure")?.summary
    || checks.find((item) => item.status === "warning")?.summary
    || "Restore drill did not complete successfully.";
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }
  return fallback;
}

function translateRestoreSource(sourceType: RestoreSourceType): string {
  if (sourceType === "mounted_dir") {
    return "挂载目录";
  }
  if (sourceType === "local_snapshot") {
    return "本地快照";
  }
  return "S3 兼容对象存储";
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function hashBuffer(value: Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
