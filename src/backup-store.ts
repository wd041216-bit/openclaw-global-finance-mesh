import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { resolveFinanceMeshPaths } from "./app-paths.ts";
import { AuditLedgerStore } from "./audit-ledger.ts";

import type { AuthenticatedActor } from "./access-control.ts";
import type { LedgerMetadata } from "./audit-ledger.ts";

export type BackupTrigger = "manual" | "scheduled";
export type BackupStatus = "success" | "partial_failure" | "failure" | "not_configured";
export type BackupTargetType = "local_dir" | "s3";
export type BackupTargetStatus = "success" | "failure" | "not_configured";

export interface BackupTargetResult {
  type: BackupTargetType;
  configured: boolean;
  status: BackupTargetStatus;
  location?: string;
  transferredFiles?: number;
  totalBytes?: number;
  error?: string;
}

export interface BackupFileSnapshot {
  path: string;
  bytes: number;
  sha256: string;
}

export interface BackupSnapshotManifest {
  backupId: string;
  createdAt: string;
  trigger: BackupTrigger;
  environment: string;
  teamScope: string;
  snapshotPath: string;
  files: BackupFileSnapshot[];
  totalBytes: number;
  archiveSha256: string;
  missingFiles: string[];
}

export interface BackupJobSummary extends LedgerMetadata {
  backupId: string;
  status: BackupStatus;
  trigger: BackupTrigger;
  createdAt: string;
  completedAt?: string;
  snapshotPath: string;
  includedFiles: string[];
  targets: BackupTargetResult[];
  totalBytes: number;
  archiveSha256: string;
  error?: string;
}

export interface BackupJobRecord extends BackupJobSummary {
  detail: {
    manifestPath: string;
    manifest: BackupSnapshotManifest;
  };
}

export interface BackupConfigurationStatus {
  backupRoot: string;
  localDir?: string;
  s3: {
    configured: boolean;
    endpoint?: string;
    region?: string;
    bucket?: string;
    prefix?: string;
    forcePathStyle: boolean;
  };
  anyConfigured: boolean;
  configuredTargetCount: number;
}

interface S3BackupConfig {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export interface S3ReplicationUploader {
  replicateDirectory(input: {
    snapshotDir: string;
    snapshotName: string;
    totalBytes: number;
  }): Promise<Omit<BackupTargetResult, "type" | "configured">>;
  downloadDirectory?(input: {
    location: string;
    destinationDir: string;
  }): Promise<Omit<BackupTargetResult, "type" | "configured">>;
}

interface BackupStoreOptions {
  ledger?: AuditLedgerStore;
  sourceRoot?: string;
  dataRoot?: string;
  backupRoot?: string;
  localDir?: string;
  environment?: string;
  teamScope?: string;
  s3Config?: Partial<S3BackupConfig>;
  s3Uploader?: S3ReplicationUploader;
}

const DEFAULT_PATHS = resolveFinanceMeshPaths(import.meta.url);
const REPO_ROOT = DEFAULT_PATHS.repoRoot;
const BACKUP_ROOT = DEFAULT_PATHS.backupRoot;

const SNAPSHOT_FILE_PATHS = [
  path.join("data", "audit", "ledger.sqlite"),
  path.join("data", "runtime", "auth-sessions.sqlite"),
  path.join("data", "runtime", "access-control.json"),
  path.join("data", "runtime", "access-control.secrets.json"),
];

export class BackupReplicationStore {
  private readonly ledger: AuditLedgerStore;
  private readonly sourceRoot: string;
  private readonly dataRoot: string;
  private readonly backupRoot: string;
  private readonly localDir?: string;
  private readonly environment: string;
  private readonly teamScope: string;
  private readonly s3Config: S3BackupConfig | null;
  private readonly s3Uploader?: S3ReplicationUploader;

  constructor(options?: BackupStoreOptions) {
    this.ledger = options?.ledger ?? new AuditLedgerStore();
    this.sourceRoot = options?.sourceRoot ?? REPO_ROOT;
    this.dataRoot = options?.dataRoot ?? path.join(this.sourceRoot, "data");
    this.backupRoot = options?.backupRoot ?? path.join(this.dataRoot, "backups");
    this.localDir = normalizeOptionalString(options?.localDir ?? process.env.FINANCE_MESH_BACKUP_LOCAL_DIR) ?? undefined;
    this.environment = options?.environment ?? (process.env.FINANCE_MESH_ENVIRONMENT?.trim() || "local");
    this.teamScope = options?.teamScope ?? (process.env.FINANCE_MESH_TEAM_SCOPE?.trim() || "default");
    this.s3Config = normalizeS3Config(options?.s3Config);
    this.s3Uploader = options?.s3Uploader;
  }

  async runBackup(input: {
    actor: AuthenticatedActor | null;
    trigger: BackupTrigger;
  }): Promise<BackupJobRecord> {
    const createdAt = new Date().toISOString();
    const backupId = crypto.randomUUID();
    const snapshotName = `${createdAt.replaceAll(":", "-")}-${backupId}`;
    const snapshotDir = path.join(this.backupRoot, snapshotName);
    await fs.mkdir(snapshotDir, { recursive: true });

    const { files, missingFiles } = await this.createSnapshot(snapshotDir);
    const totalBytes = files.reduce((sum, item) => sum + item.bytes, 0);
    const archiveSha256 = hashContent(
      canonicalStringify({
        backupId,
        createdAt,
        trigger: input.trigger,
        environment: this.environment,
        teamScope: this.teamScope,
        files,
        totalBytes,
      }),
    );
    const manifest: BackupSnapshotManifest = {
      backupId,
      createdAt,
      trigger: input.trigger,
      environment: this.environment,
      teamScope: this.teamScope,
      snapshotPath: snapshotDir,
      files,
      totalBytes,
      archiveSha256,
      missingFiles,
    };
    const manifestPath = path.join(snapshotDir, "manifest.json");
    await fs.writeFile(manifestPath, `${canonicalStringify(manifest)}\n`, "utf8");

    const targets = await this.replicateToTargets(snapshotDir, snapshotName, totalBytes);
    const completedAt = new Date().toISOString();
    const status = summarizeBackupStatus(targets);
    const error = buildBackupError(status, targets);
    const payload: BackupJobRecord = {
      backupId,
      status,
      trigger: input.trigger,
      createdAt,
      completedAt,
      snapshotPath: snapshotDir,
      includedFiles: files.map((item) => item.path),
      targets,
      totalBytes,
      archiveSha256,
      error,
      sequence: 0,
      entryHash: "",
      prevHash: "",
      environment: "",
      teamScope: "",
      chainStatus: "pending",
      detail: {
        manifestPath,
        manifest,
      },
    };

    const entry = await this.ledger.appendEntry({
      entryId: backupId,
      kind: "backup_replication",
      createdAt,
      actor: input.actor,
      subject: input.trigger,
      payload,
    });

    return this.toRecord(entry.payload, entry);
  }

  async list(limit = 10): Promise<BackupJobSummary[]> {
    const entries = await this.ledger.listEntries<BackupJobRecord>({
      kinds: ["backup_replication"],
      limit,
    });
    return entries.map((entry) => this.toSummary(entry.payload, entry));
  }

  async get(backupId: string): Promise<BackupJobRecord | null> {
    const entry = await this.ledger.getEntry<BackupJobRecord>(backupId, {
      kinds: ["backup_replication"],
    });
    if (!entry) {
      return null;
    }
    return this.toRecord(entry.payload, entry);
  }

  async getLatest(): Promise<BackupJobSummary | null> {
    const [latest] = await this.list(1);
    return latest ?? null;
  }

  getConfigurationStatus(): BackupConfigurationStatus {
    return {
      backupRoot: this.backupRoot,
      localDir: this.localDir,
      s3: {
        configured: Boolean(this.s3Config),
        endpoint: this.s3Config?.endpoint,
        region: this.s3Config?.region,
        bucket: this.s3Config?.bucket,
        prefix: this.s3Config?.prefix,
        forcePathStyle: this.s3Config?.forcePathStyle ?? false,
      },
      anyConfigured: Boolean(this.localDir || this.s3Config),
      configuredTargetCount: Number(Boolean(this.localDir)) + Number(Boolean(this.s3Config)),
    };
  }

  async downloadFromS3(location: string, destinationDir: string): Promise<BackupTargetResult> {
    if (!this.s3Config) {
      return {
        type: "s3",
        configured: false,
        status: "not_configured",
      };
    }

    const uploader = this.s3Uploader ?? new AwsS3ReplicationUploader(this.s3Config);
    if (typeof uploader.downloadDirectory !== "function") {
      return {
        type: "s3",
        configured: true,
        status: "failure",
        location,
        error: "Configured S3 transport does not support restore downloads.",
      };
    }

    try {
      const result = await uploader.downloadDirectory({
        location,
        destinationDir,
      });
      return {
        type: "s3",
        configured: true,
        ...result,
      };
    } catch (error) {
      return {
        type: "s3",
        configured: true,
        status: "failure",
        location,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async createSnapshot(snapshotDir: string): Promise<{
    files: BackupFileSnapshot[];
    missingFiles: string[];
  }> {
    const files: BackupFileSnapshot[] = [];
    const missingFiles: string[] = [];
    const sourceFiles = [
      ...SNAPSHOT_FILE_PATHS.map((filePath) => ({
        relativePath: filePath,
        absolutePath: resolveSnapshotSourcePath(this.dataRoot, filePath),
      })),
      ...(await this.collectExportFiles()),
    ];

    for (const file of sourceFiles) {
      const exists = await fileExists(file.absolutePath);
      if (!exists) {
        missingFiles.push(file.relativePath);
        continue;
      }

      const destinationPath = path.join(snapshotDir, file.relativePath);
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await snapshotSourceFile(file.absolutePath, destinationPath);
      const content = await fs.readFile(destinationPath);
      files.push({
        path: file.relativePath,
        bytes: content.byteLength,
        sha256: hashBuffer(content),
      });
    }

    return {
      files,
      missingFiles,
    };
  }

  private async collectExportFiles(): Promise<Array<{ relativePath: string; absolutePath: string }>> {
    const exportRoot = path.join(this.dataRoot, "audit", "exports");
    if (!(await fileExists(exportRoot))) {
      return [];
    }

    const files = await walkFiles(exportRoot);
    return files.map((absolutePath) => ({
      absolutePath,
      relativePath: path.join("data", path.relative(this.dataRoot, absolutePath)),
    }));
  }

  private async replicateToTargets(
    snapshotDir: string,
    snapshotName: string,
    totalBytes: number,
  ): Promise<BackupTargetResult[]> {
    const targets: BackupTargetResult[] = [];

    if (this.localDir) {
      const destinationDir = path.join(this.localDir, snapshotName);
      try {
        await fs.mkdir(this.localDir, { recursive: true });
        await fs.cp(snapshotDir, destinationDir, {
          recursive: true,
          force: true,
        });
        const transferredFiles = (await walkFiles(destinationDir)).length;
        targets.push({
          type: "local_dir",
          configured: true,
          status: "success",
          location: destinationDir,
          transferredFiles,
          totalBytes,
        });
      } catch (error) {
        targets.push({
          type: "local_dir",
          configured: true,
          status: "failure",
          location: destinationDir,
          totalBytes,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      targets.push({
        type: "local_dir",
        configured: false,
        status: "not_configured",
      });
    }

    if (this.s3Config) {
      try {
        const uploader = this.s3Uploader ?? new AwsS3ReplicationUploader(this.s3Config);
        const result = await uploader.replicateDirectory({
          snapshotDir,
          snapshotName,
          totalBytes,
        });
        targets.push({
          type: "s3",
          configured: true,
          ...result,
        });
      } catch (error) {
        targets.push({
          type: "s3",
          configured: true,
          status: "failure",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      targets.push({
        type: "s3",
        configured: false,
        status: "not_configured",
      });
    }

    return targets;
  }

  private toSummary(
    payload: BackupJobRecord,
    metadata: Pick<
      BackupJobRecord,
      "sequence" | "entryHash" | "prevHash" | "environment" | "teamScope" | "chainStatus" | "chainVerifiedAt"
    >,
  ): BackupJobSummary {
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

  private toRecord(payload: BackupJobRecord, metadata: BackupJobRecord): BackupJobRecord {
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

function resolveSnapshotSourcePath(dataRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/^data[\\/]/, "");
  return path.join(dataRoot, normalized);
}

class AwsS3ReplicationUploader implements S3ReplicationUploader {
  private readonly config: S3BackupConfig;

  constructor(config: S3BackupConfig) {
    this.config = config;
  }

  async replicateDirectory(input: {
    snapshotDir: string;
    snapshotName: string;
    totalBytes: number;
  }): Promise<Omit<BackupTargetResult, "type" | "configured">> {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: this.config.region,
      endpoint: this.config.endpoint,
      forcePathStyle: this.config.forcePathStyle,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
    const files = await walkFiles(input.snapshotDir);
    const objectPrefix = [this.config.prefix, input.snapshotName].filter(Boolean).join("/");

    for (const absolutePath of files) {
      const relativePath = path.relative(input.snapshotDir, absolutePath).replaceAll(path.sep, "/");
      const key = [objectPrefix, relativePath].filter(Boolean).join("/");
      await client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: await fs.readFile(absolutePath),
        }),
      );
    }

    return {
      status: "success",
      location: `s3://${this.config.bucket}/${objectPrefix}`,
      transferredFiles: files.length,
      totalBytes: input.totalBytes,
    };
  }

  async downloadDirectory(input: {
    location: string;
    destinationDir: string;
  }): Promise<Omit<BackupTargetResult, "type" | "configured">> {
    const { S3Client, GetObjectCommand, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: this.config.region,
      endpoint: this.config.endpoint,
      forcePathStyle: this.config.forcePathStyle,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
    const parsed = parseS3Location(input.location);
    if (parsed.bucket !== this.config.bucket) {
      throw new Error(`Restore bucket ${parsed.bucket} does not match configured backup bucket ${this.config.bucket}.`);
    }

    await fs.mkdir(input.destinationDir, { recursive: true });
    let continuationToken: string | undefined;
    let transferredFiles = 0;
    let totalBytes = 0;

    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: parsed.bucket,
          Prefix: parsed.prefix,
          ContinuationToken: continuationToken,
        }),
      );
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      const contents = page.Contents ?? [];
      for (const item of contents) {
        if (!item.Key || item.Key.endsWith("/")) {
          continue;
        }
        const relativePath = item.Key.slice(parsed.prefix.length).replace(/^\/+/, "");
        const destinationPath = path.join(input.destinationDir, relativePath.replaceAll("/", path.sep));
        await fs.mkdir(path.dirname(destinationPath), { recursive: true });
        const object = await client.send(
          new GetObjectCommand({
            Bucket: parsed.bucket,
            Key: item.Key,
          }),
        );
        const buffer = Buffer.from(await object.Body?.transformToByteArray?.() ?? []);
        await fs.writeFile(destinationPath, buffer);
        transferredFiles += 1;
        totalBytes += buffer.byteLength;
      }
    } while (continuationToken);

    if (transferredFiles === 0) {
      throw new Error(`No objects found under ${input.location}.`);
    }

    return {
      status: "success",
      location: input.location,
      transferredFiles,
      totalBytes,
    };
  }
}

function normalizeS3Config(value?: Partial<S3BackupConfig>): S3BackupConfig | null {
  const endpoint = normalizeOptionalString(value?.endpoint ?? process.env.FINANCE_MESH_BACKUP_S3_ENDPOINT);
  const region = normalizeOptionalString(value?.region ?? process.env.FINANCE_MESH_BACKUP_S3_REGION);
  const bucket = normalizeOptionalString(value?.bucket ?? process.env.FINANCE_MESH_BACKUP_S3_BUCKET);
  const accessKeyId = normalizeOptionalString(value?.accessKeyId ?? process.env.FINANCE_MESH_BACKUP_S3_ACCESS_KEY_ID);
  const secretAccessKey = normalizeOptionalString(
    value?.secretAccessKey ?? process.env.FINANCE_MESH_BACKUP_S3_SECRET_ACCESS_KEY,
  );

  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    prefix: normalizeOptionalString(value?.prefix ?? process.env.FINANCE_MESH_BACKUP_S3_PREFIX) ?? "",
    forcePathStyle: normalizeBoolean(
      value?.forcePathStyle ?? process.env.FINANCE_MESH_BACKUP_S3_FORCE_PATH_STYLE,
      false,
    ),
  };
}

function parseS3Location(location: string): { bucket: string; prefix: string } {
  const match = location.match(/^s3:\/\/([^/]+)\/?(.*)$/i);
  if (!match?.[1]) {
    throw new Error(`Invalid S3 location: ${location}`);
  }
  return {
    bucket: match[1],
    prefix: match[2] || "",
  };
}

function summarizeBackupStatus(targets: BackupTargetResult[]): BackupStatus {
  const configuredTargets = targets.filter((item) => item.configured);
  if (configuredTargets.length === 0) {
    return "not_configured";
  }
  const successCount = configuredTargets.filter((item) => item.status === "success").length;
  if (successCount === configuredTargets.length) {
    return "success";
  }
  if (successCount > 0) {
    return "partial_failure";
  }
  return "failure";
}

function buildBackupError(status: BackupStatus, targets: BackupTargetResult[]): string | undefined {
  if (status === "success") {
    return undefined;
  }
  if (status === "not_configured") {
    return "No off-box backup targets are configured.";
  }
  const errors = targets
    .filter((item) => item.status === "failure" && item.error)
    .map((item) => `${item.type}: ${item.error}`);
  return errors.join(" | ") || "Backup replication failed.";
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return fallback;
}

async function snapshotSourceFile(sourcePath: string, destinationPath: string): Promise<void> {
  if (sourcePath.endsWith(".sqlite")) {
    await snapshotSqliteDatabase(sourcePath, destinationPath);
    return;
  }

  await fs.writeFile(destinationPath, await fs.readFile(sourcePath));
}

async function snapshotSqliteDatabase(sourcePath: string, destinationPath: string): Promise<void> {
  await fs.rm(destinationPath, { force: true });
  const database = new DatabaseSync(sourcePath);
  try {
    database.exec(`VACUUM INTO ${toSqliteStringLiteral(destinationPath)}`);
  } finally {
    database.close();
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function walkFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, {
    withFileTypes: true,
  });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}

function hashContent(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashBuffer(value: Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function toSqliteStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
