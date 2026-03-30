import crypto from "node:crypto";

export type LogLevel = "info" | "warn" | "error";
export type LogFormat = "pretty" | "json";

export class FinanceMeshLogger {
  private readonly format: LogFormat;

  constructor(format = process.env.FINANCE_MESH_LOG_FORMAT) {
    this.format = normalizeLogFormat(format);
  }

  createRequestId(): string {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }

  info(event: string, fields?: Record<string, unknown>): void {
    this.log("info", event, fields);
  }

  warn(event: string, fields?: Record<string, unknown>): void {
    this.log("warn", event, fields);
  }

  error(event: string, fields?: Record<string, unknown>): void {
    this.log("error", event, fields);
  }

  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(fields ? normalizeFields(fields) : {}),
    };

    if (this.format === "json") {
      console.log(JSON.stringify(payload));
      return;
    }

    const extras = Object.entries(payload)
      .filter(([key]) => key !== "timestamp" && key !== "level" && key !== "event")
      .map(([key, value]) => `${key}=${formatPrettyValue(value)}`)
      .join(" ");
    const line = `[${payload.timestamp}] ${level.toUpperCase()} ${event}${extras ? ` ${extras}` : ""}`;
    console.log(line);
  }
}

function normalizeLogFormat(value: unknown): LogFormat {
  return value === "json" ? "json" : "pretty";
}

function normalizeFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested)]),
  );
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, normalizeValue(nested)]),
    );
  }
  return value;
}

function formatPrettyValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) {
    return "null";
  }
  return JSON.stringify(value);
}
