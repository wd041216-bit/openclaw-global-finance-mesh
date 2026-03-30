import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import type { AuthenticatedActor } from "./access-control.ts";

export type LedgerKind =
  | "decision_run"
  | "replay_run"
  | "probe_run"
  | "operator_activity"
  | "integrity_verification"
  | "export_batch"
  | "backup_replication";

export type LedgerChainStatus = "verified" | "pending" | "mismatch";

export interface LedgerMetadata {
  sequence: number;
  entryHash: string;
  prevHash: string;
  environment: string;
  teamScope: string;
  chainVerifiedAt?: string;
  chainStatus: LedgerChainStatus;
}

export interface LedgerEntry<TPayload extends Record<string, unknown> = Record<string, unknown>>
  extends LedgerMetadata {
  entryId: string;
  kind: LedgerKind;
  createdAt: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  subject?: string;
  relatedRunId?: string;
  payload: TPayload;
}

export interface LedgerMigrationStatus {
  sourceOfTruth: "sqlite";
  migratedAt: string;
  importedRuns: number;
  importedActivities: number;
  importedEntries: number;
  sourceHashes: {
    runs?: string;
    activity?: string;
  };
  legacyFilesPresent: boolean;
  legacyPaths: {
    runs: string;
    activity: string;
  };
}

export interface IntegrityMismatch {
  sequence: number;
  reason: "prev_hash" | "entry_hash";
  expected: string;
  actual: string;
}

export interface IntegrityVerificationSummary extends LedgerMetadata {
  id: string;
  createdAt: string;
  verifiedThroughSequence: number;
  latestSequence: number;
  mismatchCount: number;
  mismatches: IntegrityMismatch[];
  status: LedgerChainStatus;
}

export interface AuditExportBatchSummary extends LedgerMetadata {
  id: string;
  createdAt: string;
  entryCount: number;
  sequenceFrom?: number;
  sequenceTo?: number;
  createdFrom?: string;
  createdTo?: string;
  dataFile: string;
  manifestFile: string;
  dataSha256: string;
  manifestSha256: string;
}

export interface AuditExportBatchRecord extends AuditExportBatchSummary {
  detail: Record<string, unknown>;
}

export interface AuditIntegrityStatus {
  status: LedgerChainStatus;
  latestSequence: number;
  verifiedThroughSequence: number;
  lastVerifiedAt?: string;
  mismatchCount: number;
  mismatches: IntegrityMismatch[];
  isStale: boolean;
  verifyWarnHours: number;
  environment: string;
  teamScope: string;
  sourceOfTruth: "sqlite";
  lastExport: AuditExportBatchSummary | null;
  migration: LedgerMigrationStatus | null;
}

interface LedgerRow {
  sequence: number;
  entry_id: string;
  kind: LedgerKind;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  environment: string;
  team_scope: string;
  subject: string | null;
  related_run_id: string | null;
  payload_json: string;
  prev_hash: string;
  entry_hash: string;
}

interface LedgerMetaRow {
  value_json: string;
}

interface AppendEntryInput<TPayload extends Record<string, unknown>> {
  entryId?: string;
  kind: LedgerKind;
  createdAt?: string;
  actor: AuthenticatedActor | null;
  subject?: string;
  relatedRunId?: string;
  payload: TPayload;
}

interface LegacyAuditPayload {
  runs?: Array<Record<string, unknown>>;
}

interface LegacyActivityPayload {
  events?: Array<Record<string, unknown>>;
}

interface AuditLedgerOptions {
  ledgerPath?: string;
  legacyRunsPath?: string;
  legacyActivityPath?: string;
  exportDir?: string;
  environment?: string;
  teamScope?: string;
  verifyWarnHours?: number;
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
const AUDIT_DIR = path.join(REPO_ROOT, "data", "audit");
const LEDGER_PATH = path.join(AUDIT_DIR, "ledger.sqlite");
const LEGACY_RUNS_PATH = path.join(AUDIT_DIR, "runs.json");
const LEGACY_ACTIVITY_PATH = path.join(AUDIT_DIR, "activity.json");
const EXPORT_DIR = path.join(AUDIT_DIR, "exports");
const MIGRATION_META_KEY = "migration.legacy_json";
const GENESIS_HASH = "GENESIS";

export class AuditLedgerStore {
  private readonly ledgerPath: string;
  private readonly legacyRunsPath: string;
  private readonly legacyActivityPath: string;
  private readonly exportDir: string;
  private readonly environment: string;
  private readonly teamScope: string;
  private readonly verifyWarnHours: number;

  private db: DatabaseSync | null = null;
  private ready: Promise<void> | null = null;

  constructor(options?: AuditLedgerOptions) {
    this.ledgerPath = options?.ledgerPath ?? LEDGER_PATH;
    this.legacyRunsPath = options?.legacyRunsPath ?? LEGACY_RUNS_PATH;
    this.legacyActivityPath = options?.legacyActivityPath ?? LEGACY_ACTIVITY_PATH;
    this.exportDir = options?.exportDir ?? (process.env.FINANCE_MESH_AUDIT_EXPORT_DIR?.trim() || EXPORT_DIR);
    this.environment = options?.environment ?? (process.env.FINANCE_MESH_ENVIRONMENT?.trim() || "local");
    this.teamScope = options?.teamScope ?? (process.env.FINANCE_MESH_TEAM_SCOPE?.trim() || "default");
    this.verifyWarnHours = normalizeVerifyWarnHours(
      options?.verifyWarnHours ?? process.env.FINANCE_MESH_AUDIT_VERIFY_WARN_HOURS,
    );
  }

  async appendEntry<TPayload extends Record<string, unknown>>(input: AppendEntryInput<TPayload>): Promise<LedgerEntry<TPayload>> {
    await this.ensureReady();
    return this.insertEntry(input);
  }

  async listEntries<TPayload extends Record<string, unknown>>(
    options?: { kinds?: LedgerKind[]; limit?: number },
  ): Promise<Array<LedgerEntry<TPayload>>> {
    await this.ensureReady();
    const rows = this.selectRows(options);
    const integrity = this.buildIntegrityStatus();
    return rows.map((row) => this.deserializeRow<TPayload>(row, integrity));
  }

  async getEntry<TPayload extends Record<string, unknown>>(
    entryId: string,
    options?: { kinds?: LedgerKind[] },
  ): Promise<LedgerEntry<TPayload> | null> {
    await this.ensureReady();
    const row = this.selectRowById(entryId, options);
    if (!row) {
      return null;
    }
    return this.deserializeRow<TPayload>(row, this.buildIntegrityStatus());
  }

  async getIntegrityStatus(): Promise<AuditIntegrityStatus> {
    await this.ensureReady();
    return this.buildIntegrityStatus();
  }

  async countEntries(options?: { kinds?: LedgerKind[]; createdFrom?: string }): Promise<number> {
    await this.ensureReady();
    return this.countRows(options);
  }

  async verifyIntegrity(actor: AuthenticatedActor | null): Promise<IntegrityVerificationSummary> {
    await this.ensureReady();
    return this.runInTransaction(() => this.verifyIntegrityInTransaction(actor));
  }

  async createExportBatch(
    input: {
      actor: AuthenticatedActor | null;
      sequenceFrom?: number;
      sequenceTo?: number;
      createdFrom?: string;
      createdTo?: string;
    },
  ): Promise<AuditExportBatchRecord> {
    await this.ensureReady();
    await fs.mkdir(this.exportDir, { recursive: true });

    const rows = this.selectRowsForExport(input);
    if (rows.length === 0) {
      throw new Error("No audit ledger entries matched the requested export filter.");
    }
    const now = new Date().toISOString();
    const exportId = crypto.randomUUID();
    const dataFileName = `${now.replaceAll(":", "-")}-${exportId}.ndjson`;
    const manifestFileName = `${now.replaceAll(":", "-")}-${exportId}.json`;
    const dataFile = path.join(this.exportDir, dataFileName);
    const manifestFile = path.join(this.exportDir, manifestFileName);
    const exportEntries = rows.map((row) => ({
      sequence: row.sequence,
      entryId: row.entry_id,
      kind: row.kind,
      createdAt: row.created_at,
      actorId: row.actor_id ?? undefined,
      actorName: row.actor_name ?? undefined,
      actorRole: row.actor_role ?? undefined,
      environment: row.environment,
      teamScope: row.team_scope,
      subject: row.subject ?? undefined,
      relatedRunId: row.related_run_id ?? undefined,
      prevHash: row.prev_hash,
      entryHash: row.entry_hash,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    }));
    const ndjson = exportEntries.map((entry) => JSON.stringify(entry)).join("\n") + (exportEntries.length > 0 ? "\n" : "");
    const dataSha256 = hashContent(ndjson);

    const manifestBase = {
      exportId,
      createdAt: now,
      environment: this.environment,
      teamScope: this.teamScope,
      filters: {
        sequenceFrom: normalizeOptionalNumber(input.sequenceFrom),
        sequenceTo: normalizeOptionalNumber(input.sequenceTo),
        createdFrom: normalizeOptionalString(input.createdFrom),
        createdTo: normalizeOptionalString(input.createdTo),
      },
      entryCount: exportEntries.length,
      sequenceFrom: exportEntries[0]?.sequence,
      sequenceTo: exportEntries.at(-1)?.sequence,
      createdFrom: exportEntries[0]?.createdAt,
      createdTo: exportEntries.at(-1)?.createdAt,
      firstEntryHash: exportEntries[0]?.entryHash,
      lastEntryHash: exportEntries.at(-1)?.entryHash,
      dataFile,
      dataSha256,
      generatedBy: input.actor?.name ?? "anonymous",
    };
    const manifestSha256 = hashContent(canonicalStringify(manifestBase));
    const manifest = {
      ...manifestBase,
      manifestSha256,
    };

    await fs.writeFile(dataFile, ndjson, "utf8");
    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2), "utf8");

    const record: AuditExportBatchRecord = {
      id: exportId,
      createdAt: now,
      entryCount: exportEntries.length,
      sequenceFrom: manifest.sequenceFrom,
      sequenceTo: manifest.sequenceTo,
      createdFrom: manifest.createdFrom,
      createdTo: manifest.createdTo,
      dataFile,
      manifestFile,
      dataSha256,
      manifestSha256,
      sequence: 0,
      prevHash: "",
      entryHash: "",
      environment: this.environment,
      teamScope: this.teamScope,
      chainStatus: "pending",
      detail: manifest,
    };

    const entry = this.insertEntry({
      entryId: record.id,
      kind: "export_batch",
      createdAt: record.createdAt,
      actor: input.actor,
      subject: `${record.entryCount} entries`,
      payload: record,
    });

    return this.toExportBatchRecord(entry);
  }

  async listExportBatches(limit = 10): Promise<AuditExportBatchSummary[]> {
    const entries = await this.listEntries<AuditExportBatchRecord>({
      kinds: ["export_batch"],
      limit,
    });
    return entries.map((entry) => this.toExportBatchSummary(entry));
  }

  async getExportBatch(id: string): Promise<AuditExportBatchRecord | null> {
    const entry = await this.getEntry<AuditExportBatchRecord>(id, {
      kinds: ["export_batch"],
    });
    return entry ? this.toExportBatchRecord(entry) : null;
  }

  private async ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.initialize();
    }
    await this.ready;
  }

  private async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.ledgerPath), { recursive: true });
    this.db = new DatabaseSync(this.ledgerPath);
    this.db.enableDefensive(true);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS ledger_entries (
        sequence INTEGER PRIMARY KEY,
        entry_id TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        actor_id TEXT,
        actor_name TEXT,
        actor_role TEXT,
        environment TEXT NOT NULL,
        team_scope TEXT NOT NULL,
        subject TEXT,
        related_run_id TEXT,
        payload_json TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        entry_hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_kind_sequence ON ledger_entries(kind, sequence DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_created_sequence ON ledger_entries(created_at DESC, sequence DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_related_run_id ON ledger_entries(related_run_id);
      CREATE TABLE IF NOT EXISTS ledger_meta (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.maybeMigrateLegacyJson();
  }

  private async maybeMigrateLegacyJson(): Promise<void> {
    const existingCount = this.getEntryCount();
    if (existingCount > 0) {
      return;
    }

    const [legacyRuns, legacyActivity, runsHash, activityHash] = await Promise.all([
      readJsonFile<LegacyAuditPayload>(this.legacyRunsPath),
      readJsonFile<LegacyActivityPayload>(this.legacyActivityPath),
      hashFile(this.legacyRunsPath),
      hashFile(this.legacyActivityPath),
    ]);

    const runRecords = Array.isArray(legacyRuns?.runs) ? legacyRuns.runs : [];
    const activityRecords = Array.isArray(legacyActivity?.events) ? legacyActivity.events : [];

    const imports = [
      ...runRecords.map((record, index) => ({
        source: "run" as const,
        index,
        createdAt: String(record.createdAt ?? ""),
        entryId: String(record.id ?? crypto.randomUUID()),
        kind: toLegacyRunKind(record),
        actor: actorFromLegacyRecord(record),
        subject: typeof record.label === "string" ? record.label : undefined,
        relatedRunId: undefined,
        payload: record,
      })),
      ...activityRecords.map((record, index) => ({
        source: "activity" as const,
        index,
        createdAt: String(record.createdAt ?? ""),
        entryId: String(record.id ?? crypto.randomUUID()),
        kind: "operator_activity" as const,
        actor: actorFromLegacyRecord(record),
        subject: typeof record.subject === "string" ? record.subject : undefined,
        relatedRunId: typeof record.relatedRunId === "string" ? record.relatedRunId : undefined,
        payload: record,
      })),
    ].sort((left, right) => {
      const createdOrder = left.createdAt.localeCompare(right.createdAt);
      if (createdOrder !== 0) {
        return createdOrder;
      }
      if (left.source !== right.source) {
        return left.source.localeCompare(right.source);
      }
      return left.index - right.index;
    });

    this.runInTransaction(() => {
      for (const item of imports) {
        this.insertEntry({
          entryId: item.entryId,
          kind: item.kind,
          createdAt: item.createdAt || new Date().toISOString(),
          actor: item.actor,
          subject: item.subject,
          relatedRunId: item.relatedRunId,
          payload: item.payload,
        });
      }
    });

    const migration: LedgerMigrationStatus = {
      sourceOfTruth: "sqlite",
      migratedAt: new Date().toISOString(),
      importedRuns: runRecords.length,
      importedActivities: activityRecords.length,
      importedEntries: imports.length,
      sourceHashes: {
        runs: runsHash ?? undefined,
        activity: activityHash ?? undefined,
      },
      legacyFilesPresent: Boolean(runsHash || activityHash),
      legacyPaths: {
        runs: this.legacyRunsPath,
        activity: this.legacyActivityPath,
      },
    };
    this.setMeta(MIGRATION_META_KEY, migration);
  }

  private insertEntry<TPayload extends Record<string, unknown>>(input: AppendEntryInput<TPayload>): LedgerEntry<TPayload> {
    const db = this.getDb();
    const lastRow = this.selectLastRow();
    const sequence = (lastRow?.sequence ?? 0) + 1;
    const entryId = input.entryId?.trim() || crypto.randomUUID();
    const createdAt = input.createdAt?.trim() || new Date().toISOString();
    const prevHash = lastRow?.entry_hash ?? GENESIS_HASH;
    const payloadJson = canonicalStringify(input.payload);
    const entryHash = computeEntryHash({
      sequence,
      kind: input.kind,
      createdAt,
      prevHash,
      payloadJson,
    });
    db.prepare(
      `
        INSERT INTO ledger_entries (
          sequence,
          entry_id,
          kind,
          created_at,
          actor_id,
          actor_name,
          actor_role,
          environment,
          team_scope,
          subject,
          related_run_id,
          payload_json,
          prev_hash,
          entry_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      sequence,
      entryId,
      input.kind,
      createdAt,
      input.actor?.id ?? null,
      input.actor?.name ?? null,
      input.actor?.role ?? null,
      this.environment,
      this.teamScope,
      input.subject ?? null,
      input.relatedRunId ?? null,
      payloadJson,
      prevHash,
      entryHash,
    );

    return this.deserializeRow<TPayload>(
      {
        sequence,
        entry_id: entryId,
        kind: input.kind,
        created_at: createdAt,
        actor_id: input.actor?.id ?? null,
        actor_name: input.actor?.name ?? null,
        actor_role: input.actor?.role ?? null,
        environment: this.environment,
        team_scope: this.teamScope,
        subject: input.subject ?? null,
        related_run_id: input.relatedRunId ?? null,
        payload_json: payloadJson,
        prev_hash: prevHash,
        entry_hash: entryHash,
      },
      this.buildIntegrityStatus(),
    );
  }

  private verifyIntegrityInTransaction(actor: AuthenticatedActor | null): IntegrityVerificationSummary {
    const rows = this.selectRows({
      limit: Number.MAX_SAFE_INTEGER,
    }).reverse();
    const mismatches: IntegrityMismatch[] = [];
    let previousHash = GENESIS_HASH;

    for (const row of rows) {
      const expectedPrevHash = previousHash;
      if (row.prev_hash !== expectedPrevHash) {
        mismatches.push({
          sequence: row.sequence,
          reason: "prev_hash",
          expected: expectedPrevHash,
          actual: row.prev_hash,
        });
      }

      const expectedEntryHash = computeEntryHash({
        sequence: row.sequence,
        kind: row.kind,
        createdAt: row.created_at,
        prevHash: row.prev_hash,
        payloadJson: canonicalStringify(JSON.parse(row.payload_json) as Record<string, unknown>),
      });
      if (row.entry_hash !== expectedEntryHash) {
        mismatches.push({
          sequence: row.sequence,
          reason: "entry_hash",
          expected: expectedEntryHash,
          actual: row.entry_hash,
        });
      }

      previousHash = row.entry_hash;
    }

    const nextSequence = (rows.at(-1)?.sequence ?? 0) + 1;
    const createdAt = new Date().toISOString();
    const record: IntegrityVerificationSummary = {
      id: crypto.randomUUID(),
      createdAt,
      verifiedThroughSequence: nextSequence,
      latestSequence: nextSequence,
      mismatchCount: mismatches.length,
      mismatches: mismatches.slice(0, 20),
      status: mismatches.length > 0 ? "mismatch" : "verified",
      sequence: 0,
      prevHash: "",
      entryHash: "",
      environment: this.environment,
      teamScope: this.teamScope,
      chainStatus: mismatches.length > 0 ? "mismatch" : "verified",
      chainVerifiedAt: createdAt,
    };

    const entry = this.insertEntry({
      entryId: record.id,
      kind: "integrity_verification",
      createdAt,
      actor,
      subject: mismatches.length > 0 ? `${mismatches.length} mismatches` : "chain verified",
      payload: record,
    });

    return this.toIntegrityVerificationSummary(entry);
  }

  private selectRows(options?: { kinds?: LedgerKind[]; limit?: number }): LedgerRow[] {
    const db = this.getDb();
    const limit = Number.isFinite(options?.limit) ? Math.max(1, Number(options?.limit)) : 20;
    if (options?.kinds?.length) {
      const placeholders = options.kinds.map(() => "?").join(", ");
      return db.prepare(
        `
          SELECT *
          FROM ledger_entries
          WHERE kind IN (${placeholders})
          ORDER BY sequence DESC
          LIMIT ?
        `,
      ).all(...options.kinds, limit) as LedgerRow[];
    }

    return db.prepare(
      `
        SELECT *
        FROM ledger_entries
        ORDER BY sequence DESC
        LIMIT ?
      `,
    ).all(limit) as LedgerRow[];
  }

  private countRows(options?: { kinds?: LedgerKind[]; createdFrom?: string }): number {
    const db = this.getDb();
    const filters: string[] = [];
    const values: Array<string> = [];

    if (options?.kinds?.length) {
      filters.push(`kind IN (${options.kinds.map(() => "?").join(", ")})`);
      values.push(...options.kinds);
    }
    if (options?.createdFrom) {
      filters.push("created_at >= ?");
      values.push(options.createdFrom);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const row = db.prepare(`
      SELECT COUNT(*) AS count
      FROM ledger_entries
      ${whereClause}
    `).get(...values) as { count?: number } | undefined;

    return Number(row?.count ?? 0);
  }

  private selectRowsForExport(input: {
    sequenceFrom?: number;
    sequenceTo?: number;
    createdFrom?: string;
    createdTo?: string;
  }): LedgerRow[] {
    const db = this.getDb();
    const predicates: string[] = [];
    const values: Array<number | string> = [];

    const sequenceFrom = normalizeOptionalNumber(input.sequenceFrom);
    if (sequenceFrom != null) {
      predicates.push("sequence >= ?");
      values.push(sequenceFrom);
    }
    const sequenceTo = normalizeOptionalNumber(input.sequenceTo);
    if (sequenceTo != null) {
      predicates.push("sequence <= ?");
      values.push(sequenceTo);
    }
    const createdFrom = normalizeOptionalString(input.createdFrom);
    if (createdFrom) {
      predicates.push("created_at >= ?");
      values.push(createdFrom);
    }
    const createdTo = normalizeOptionalString(input.createdTo);
    if (createdTo) {
      predicates.push("created_at <= ?");
      values.push(createdTo);
    }

    const whereClause = predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}` : "";
    return db.prepare(
      `
        SELECT *
        FROM ledger_entries
        ${whereClause}
        ORDER BY sequence ASC
      `,
    ).all(...values) as LedgerRow[];
  }

  private selectRowById(entryId: string, options?: { kinds?: LedgerKind[] }): LedgerRow | null {
    const db = this.getDb();
    if (options?.kinds?.length) {
      const placeholders = options.kinds.map(() => "?").join(", ");
      return (
        (db.prepare(
          `
            SELECT *
            FROM ledger_entries
            WHERE entry_id = ?
              AND kind IN (${placeholders})
            LIMIT 1
          `,
        ).get(entryId, ...options.kinds) as LedgerRow | undefined) ?? null
      );
    }
    return (
      (db.prepare(
        `
          SELECT *
          FROM ledger_entries
          WHERE entry_id = ?
          LIMIT 1
        `,
      ).get(entryId) as LedgerRow | undefined) ?? null
    );
  }

  private selectLastRow(): LedgerRow | null {
    const db = this.getDb();
    return (
      (db.prepare(
        `
          SELECT *
          FROM ledger_entries
          ORDER BY sequence DESC
          LIMIT 1
        `,
      ).get() as LedgerRow | undefined) ?? null
    );
  }

  private getEntryCount(): number {
    const db = this.getDb();
    const row = db.prepare("SELECT COUNT(*) AS count FROM ledger_entries").get() as { count: number } | undefined;
    return row?.count ?? 0;
  }

  private deserializeRow<TPayload extends Record<string, unknown>>(
    row: LedgerRow,
    integrity: AuditIntegrityStatus,
  ): LedgerEntry<TPayload> {
    const chainStatus =
      integrity.status === "mismatch"
        ? "mismatch"
        : row.sequence <= integrity.verifiedThroughSequence && integrity.lastVerifiedAt
          ? "verified"
          : "pending";
    return {
      entryId: row.entry_id,
      kind: row.kind,
      createdAt: row.created_at,
      actorId: row.actor_id ?? undefined,
      actorName: row.actor_name ?? undefined,
      actorRole: row.actor_role ?? undefined,
      subject: row.subject ?? undefined,
      relatedRunId: row.related_run_id ?? undefined,
      payload: JSON.parse(row.payload_json) as TPayload,
      sequence: row.sequence,
      entryHash: row.entry_hash,
      prevHash: row.prev_hash,
      environment: row.environment,
      teamScope: row.team_scope,
      chainVerifiedAt: integrity.lastVerifiedAt,
      chainStatus,
    };
  }

  private buildIntegrityStatus(): AuditIntegrityStatus {
    const latestSequence = this.selectLastRow()?.sequence ?? 0;
    const latestVerificationEntry = this.selectRows({
      kinds: ["integrity_verification"],
      limit: 1,
    })[0];
    const latestVerification = latestVerificationEntry
      ? this.toIntegrityVerificationSummary(this.deserializeRow<IntegrityVerificationSummary>(latestVerificationEntry, {
          status: "pending",
          latestSequence,
          verifiedThroughSequence: 0,
          mismatchCount: 0,
          mismatches: [],
          isStale: true,
          verifyWarnHours: this.verifyWarnHours,
          environment: this.environment,
          teamScope: this.teamScope,
          sourceOfTruth: "sqlite",
          lastExport: null,
          migration: null,
        }))
      : null;
    const lastExportEntry = this.selectRows({
      kinds: ["export_batch"],
      limit: 1,
    })[0];
    const lastExport = lastExportEntry
      ? this.toExportBatchSummary(this.deserializeRow<AuditExportBatchRecord>(lastExportEntry, {
          status: latestVerification?.status ?? "pending",
          latestSequence,
          verifiedThroughSequence: latestVerification?.verifiedThroughSequence ?? 0,
          lastVerifiedAt: latestVerification?.createdAt,
          mismatchCount: latestVerification?.mismatchCount ?? 0,
          mismatches: latestVerification?.mismatches ?? [],
          isStale: true,
          verifyWarnHours: this.verifyWarnHours,
          environment: this.environment,
          teamScope: this.teamScope,
          sourceOfTruth: "sqlite",
          lastExport: null,
          migration: null,
        }))
      : null;

    const verifiedThroughSequence = latestVerification?.verifiedThroughSequence ?? 0;
    const mismatchCount = latestVerification?.mismatchCount ?? 0;
    const lastVerifiedAt = latestVerification?.createdAt;
    const status =
      mismatchCount > 0
        ? "mismatch"
        : latestSequence > 0 && latestSequence <= verifiedThroughSequence
          ? "verified"
          : "pending";
    return {
      status,
      latestSequence,
      verifiedThroughSequence,
      lastVerifiedAt,
      mismatchCount,
      mismatches: latestVerification?.mismatches ?? [],
      isStale: isVerificationStale(lastVerifiedAt, this.verifyWarnHours),
      verifyWarnHours: this.verifyWarnHours,
      environment: this.environment,
      teamScope: this.teamScope,
      sourceOfTruth: "sqlite",
      lastExport,
      migration: this.getMeta<LedgerMigrationStatus>(MIGRATION_META_KEY),
    };
  }

  private toIntegrityVerificationSummary(entry: LedgerEntry<IntegrityVerificationSummary>): IntegrityVerificationSummary {
    return {
      ...entry.payload,
      id: entry.entryId,
      createdAt: entry.createdAt,
      sequence: entry.sequence,
      entryHash: entry.entryHash,
      prevHash: entry.prevHash,
      environment: entry.environment,
      teamScope: entry.teamScope,
      chainStatus: entry.chainStatus,
      chainVerifiedAt: entry.chainVerifiedAt,
    };
  }

  private toExportBatchSummary(entry: LedgerEntry<AuditExportBatchRecord>): AuditExportBatchSummary {
    const { detail: _detail, ...summary } = entry.payload;
    return {
      ...summary,
      id: entry.entryId,
      createdAt: entry.createdAt,
      sequence: entry.sequence,
      entryHash: entry.entryHash,
      prevHash: entry.prevHash,
      environment: entry.environment,
      teamScope: entry.teamScope,
      chainStatus: entry.chainStatus,
      chainVerifiedAt: entry.chainVerifiedAt,
    };
  }

  private toExportBatchRecord(entry: LedgerEntry<AuditExportBatchRecord>): AuditExportBatchRecord {
    return {
      ...this.toExportBatchSummary(entry),
      detail: entry.payload.detail,
    };
  }

  private getMeta<T>(key: string): T | null {
    const db = this.getDb();
    const row = db.prepare("SELECT value_json FROM ledger_meta WHERE key = ? LIMIT 1").get(key) as LedgerMetaRow | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.value_json) as T;
  }

  private setMeta(key: string, value: unknown): void {
    const db = this.getDb();
    db.prepare(
      `
        INSERT INTO ledger_meta (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `,
    ).run(key, JSON.stringify(value), new Date().toISOString());
  }

  private runInTransaction<T>(work: () => T): T {
    const db = this.getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  private getDb(): DatabaseSync {
    if (!this.db) {
      throw new Error("Audit ledger is not initialized.");
    }
    return this.db;
  }
}

function toLegacyRunKind(record: Record<string, unknown>): LedgerKind {
  const type = record.type;
  if (type === "replay") {
    return "replay_run";
  }
  if (type === "probe") {
    return "probe_run";
  }
  return "decision_run";
}

function actorFromLegacyRecord(record: Record<string, unknown>): AuthenticatedActor | null {
  if (
    typeof record.actorId === "string" &&
    typeof record.actorName === "string" &&
    typeof record.actorRole === "string"
  ) {
    return {
      id: record.actorId,
      name: record.actorName,
      role: record.actorRole as AuthenticatedActor["role"],
    };
  }

  const detail = isRecord(record.detail) ? record.detail : null;
  const actor = detail && isRecord(detail.actor) ? detail.actor : null;
  if (
    actor &&
    typeof actor.id === "string" &&
    typeof actor.name === "string" &&
    typeof actor.role === "string"
  ) {
    return {
      id: actor.id,
      name: actor.name,
      role: actor.role as AuthenticatedActor["role"],
    };
  }

  return null;
}

function computeEntryHash(input: {
  sequence: number;
  kind: LedgerKind;
  createdAt: string;
  prevHash: string;
  payloadJson: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(`${input.sequence}|${input.kind}|${input.createdAt}|${input.prevHash}|${input.payloadJson}`)
    .digest("hex");
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

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function hashFile(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return hashContent(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function hashContent(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeVerifyWarnHours(value: unknown): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }
  return 24;
}

function isVerificationStale(lastVerifiedAt: string | undefined, warnHours: number): boolean {
  if (!lastVerifiedAt) {
    return true;
  }
  const lastVerified = new Date(lastVerifiedAt).getTime();
  if (!Number.isFinite(lastVerified)) {
    return true;
  }
  return Date.now() - lastVerified > warnHours * 60 * 60 * 1000;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
