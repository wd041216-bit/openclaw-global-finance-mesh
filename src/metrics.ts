type MetricType = "counter" | "gauge";

interface MetricSeries {
  labels: Record<string, string>;
  value: number;
}

interface MetricDefinition {
  type: MetricType;
  help: string;
  series: Map<string, MetricSeries>;
}

export class FinanceMeshMetrics {
  private readonly definitions = new Map<string, MetricDefinition>();

  constructor() {
    this.register("finance_mesh_http_requests_total", "counter", "HTTP requests served by the control plane.");
    this.register("finance_mesh_runs_total", "counter", "Decision, replay, and probe runs by outcome.");
    this.register("finance_mesh_backup_jobs_total", "counter", "Backup jobs by outcome.");
    this.register("finance_mesh_restore_drills_total", "counter", "Restore drill runs by outcome.");
    this.register("finance_mesh_restore_drill_failures_total", "counter", "Failed restore drill runs.");
    this.register("finance_mesh_integrity_verifications_total", "counter", "Audit integrity verification runs by outcome.");
    this.register("finance_mesh_active_sessions", "gauge", "Currently active authenticated sessions.");
    this.register("finance_mesh_backup_targets_configured", "gauge", "Configured off-box backup targets.");
    this.register("finance_mesh_restore_drill_last_success_timestamp", "gauge", "Unix timestamp of the latest successful restore drill.");
  }

  recordHttpRequest(input: { method: string; route: string; status: number }): void {
    this.increment("finance_mesh_http_requests_total", {
      method: input.method.toUpperCase(),
      route: input.route,
      status: String(input.status),
    });
  }

  recordRun(kind: "decision" | "replay" | "probe", outcome: "success" | "failure"): void {
    this.increment("finance_mesh_runs_total", {
      kind,
      outcome,
    });
  }

  recordBackup(status: "success" | "partial_failure" | "failure" | "not_configured"): void {
    this.increment("finance_mesh_backup_jobs_total", {
      status,
    });
  }

  recordRestoreDrill(status: "success" | "degraded" | "failure"): void {
    this.increment("finance_mesh_restore_drills_total", {
      status,
    });
    if (status === "failure") {
      this.increment("finance_mesh_restore_drill_failures_total", {});
    }
  }

  recordIntegrityVerification(status: "verified" | "pending" | "mismatch"): void {
    this.increment("finance_mesh_integrity_verifications_total", {
      status,
    });
  }

  setActiveSessions(count: number): void {
    this.set("finance_mesh_active_sessions", {}, count);
  }

  setBackupTargetsConfigured(count: number): void {
    this.set("finance_mesh_backup_targets_configured", {}, count);
  }

  setRestoreLastSuccessTimestamp(timestampSeconds: number): void {
    this.set("finance_mesh_restore_drill_last_success_timestamp", {}, timestampSeconds);
  }

  render(): string {
    const lines: string[] = [];
    for (const [name, definition] of this.definitions) {
      lines.push(`# HELP ${name} ${definition.help}`);
      lines.push(`# TYPE ${name} ${definition.type}`);
      for (const series of definition.series.values()) {
        const labels = formatLabels(series.labels);
        lines.push(`${name}${labels} ${series.value}`);
      }
    }
    return `${lines.join("\n")}\n`;
  }

  private register(name: string, type: MetricType, help: string): void {
    this.definitions.set(name, {
      type,
      help,
      series: new Map<string, MetricSeries>(),
    });
  }

  private increment(name: string, labels: Record<string, string>, by = 1): void {
    const definition = this.getDefinition(name, "counter");
    const key = serializeLabels(labels);
    const current = definition.series.get(key);
    definition.series.set(key, {
      labels,
      value: (current?.value ?? 0) + by,
    });
  }

  private set(name: string, labels: Record<string, string>, value: number): void {
    const definition = this.getDefinition(name, "gauge");
    definition.series.set(serializeLabels(labels), {
      labels,
      value,
    });
  }

  private getDefinition(name: string, type: MetricType): MetricDefinition {
    const definition = this.definitions.get(name);
    if (!definition || definition.type !== type) {
      throw new Error(`Metric ${name} is not registered as ${type}.`);
    }
    return definition;
  }
}

function serializeLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return "";
  }
  return `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(",")}}`;
}

function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}
