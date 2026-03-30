import crypto from "node:crypto";

import { AuditLedgerStore } from "./audit-ledger.ts";

import type { AuthenticatedActor } from "./access-control.ts";
import type { LedgerMetadata } from "./audit-ledger.ts";

export type OperatorActivityAction =
  | "access.bootstrap_admin"
  | "access.update_config"
  | "access.create_operator"
  | "access.login_token"
  | "access.login_oidc"
  | "access.logout"
  | "access.revoke_session"
  | "access.create_binding"
  | "access.deactivate_binding"
  | "access.read_identity_status"
  | "runtime.update_config"
  | "runtime.probe"
  | "legal_library.create_document"
  | "legal_library.ingest"
  | "legal_library.update_status"
  | "decision.run"
  | "replay.run";

export type OperatorActivityOutcome = "success" | "failure";

export interface OperatorActivitySummary extends LedgerMetadata {
  id: string;
  createdAt: string;
  action: OperatorActivityAction;
  outcome: OperatorActivityOutcome;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  subject?: string;
  message: string;
  relatedRunId?: string;
}

export interface OperatorActivityRecord extends OperatorActivitySummary {
  detail: Record<string, unknown>;
}

interface OperatorActivityStoreOptions {
  ledger?: AuditLedgerStore;
  ledgerPath?: string;
  legacyRunsPath?: string;
  legacyActivityPath?: string;
  exportDir?: string;
  environment?: string;
  teamScope?: string;
  verifyWarnHours?: number;
}

export class OperatorActivityStore {
  private readonly ledger: AuditLedgerStore;

  constructor(options?: OperatorActivityStoreOptions) {
    this.ledger =
      options?.ledger ??
      new AuditLedgerStore({
        ledgerPath: options?.ledgerPath,
        legacyRunsPath: options?.legacyRunsPath,
        legacyActivityPath: options?.legacyActivityPath,
        exportDir: options?.exportDir,
        environment: options?.environment,
        teamScope: options?.teamScope,
        verifyWarnHours: options?.verifyWarnHours,
      });
  }

  async list(limit = 20): Promise<OperatorActivitySummary[]> {
    const entries = await this.ledger.listEntries<OperatorActivityRecord>({
      kinds: ["operator_activity"],
      limit,
    });
    return entries.map((entry) => this.toSummary(entry.payload, entry));
  }

  async get(id: string): Promise<OperatorActivityRecord | null> {
    const entry = await this.ledger.getEntry<OperatorActivityRecord>(id, {
      kinds: ["operator_activity"],
    });
    if (!entry) {
      return null;
    }
    return this.toRecord(entry.payload, entry);
  }

  async record(input: {
    action: OperatorActivityAction;
    outcome?: OperatorActivityOutcome;
    actor: AuthenticatedActor | null;
    subject?: string;
    message: string;
    relatedRunId?: string;
    detail?: Record<string, unknown>;
  }): Promise<OperatorActivitySummary> {
    const createdAt = new Date().toISOString();
    const record: OperatorActivityRecord = {
      id: crypto.randomUUID(),
      createdAt,
      action: input.action,
      outcome: input.outcome ?? "success",
      actorId: input.actor?.id,
      actorName: input.actor?.name,
      actorRole: input.actor?.role,
      subject: input.subject,
      message: input.message,
      relatedRunId: input.relatedRunId,
      sequence: 0,
      entryHash: "",
      prevHash: "",
      environment: "",
      teamScope: "",
      chainStatus: "pending",
      detail: input.detail ?? {},
    };

    const entry = await this.ledger.appendEntry({
      entryId: record.id,
      kind: "operator_activity",
      createdAt,
      actor: input.actor,
      subject: input.subject,
      relatedRunId: input.relatedRunId,
      payload: record,
    });

    return this.toSummary(entry.payload, entry);
  }

  private toSummary(
    payload: OperatorActivityRecord,
    metadata: Pick<
      OperatorActivityRecord,
      "sequence" | "entryHash" | "prevHash" | "environment" | "teamScope" | "chainStatus" | "chainVerifiedAt"
    >,
  ): OperatorActivitySummary {
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

  private toRecord(payload: OperatorActivityRecord, metadata: OperatorActivityRecord): OperatorActivityRecord {
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
