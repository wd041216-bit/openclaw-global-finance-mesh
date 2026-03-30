import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AuthenticatedActor } from "./access-control.ts";

export type OperatorActivityAction =
  | "access.bootstrap_admin"
  | "access.update_config"
  | "access.create_operator"
  | "runtime.update_config"
  | "runtime.probe"
  | "legal_library.create_document"
  | "legal_library.ingest"
  | "legal_library.update_status"
  | "decision.run"
  | "replay.run";

export type OperatorActivityOutcome = "success" | "failure";

export interface OperatorActivitySummary {
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

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
const ACTIVITY_PATH = path.join(REPO_ROOT, "data", "audit", "activity.json");

export class OperatorActivityStore {
  private readonly activityPath: string;

  constructor(activityPath = ACTIVITY_PATH) {
    this.activityPath = activityPath;
  }

  async list(limit = 20): Promise<OperatorActivitySummary[]> {
    const payload = await this.load();
    return payload.events
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(1, limit))
      .map(({ detail: _detail, ...summary }) => summary);
  }

  async get(id: string): Promise<OperatorActivityRecord | null> {
    const payload = await this.load();
    return payload.events.find((item) => item.id === id) ?? null;
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
    const record: OperatorActivityRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      action: input.action,
      outcome: input.outcome ?? "success",
      actorId: input.actor?.id,
      actorName: input.actor?.name,
      actorRole: input.actor?.role,
      subject: input.subject,
      message: input.message,
      relatedRunId: input.relatedRunId,
      detail: input.detail ?? {},
    };

    const payload = await this.load();
    payload.events.push(record);
    await this.save(payload);
    return toSummary(record);
  }

  private async load(): Promise<{ events: OperatorActivityRecord[] }> {
    try {
      const content = await fs.readFile(this.activityPath, "utf8");
      const payload = JSON.parse(content) as { events?: OperatorActivityRecord[] };
      return {
        events: Array.isArray(payload.events) ? payload.events : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const seed = { events: [] as OperatorActivityRecord[] };
        await this.save(seed);
        return seed;
      }
      throw error;
    }
  }

  private async save(payload: { events: OperatorActivityRecord[] }): Promise<void> {
    await fs.mkdir(path.dirname(this.activityPath), { recursive: true });
    await fs.writeFile(this.activityPath, JSON.stringify(payload, null, 2), "utf8");
  }
}

function toSummary(record: OperatorActivityRecord): OperatorActivitySummary {
  const { detail: _detail, ...summary } = record;
  return summary;
}
