import path from "node:path";

import type { Mode, RiskLevel } from "./types.ts";

export type FinanceMeshConfig = {
  enabled: boolean;
  prependSystemGuidance: boolean;
  defaultMode: Mode;
  maxAutoExecuteRisk: RiskLevel;
  packRoots: string[];
};

export function normalizeFinanceMeshConfig(raw: unknown): FinanceMeshConfig {
  const cfg = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    enabled: cfg.enabled !== false,
    prependSystemGuidance: cfg.prependSystemGuidance !== false,
    defaultMode: normalizeMode(cfg.defaultMode),
    maxAutoExecuteRisk: normalizeRisk(cfg.maxAutoExecuteRisk),
    packRoots: normalizeStringArray(cfg.packRoots, [path.join(".", "examples", "packs")]),
  };
}

function normalizeMode(value: unknown): Mode {
  return value === "L0" || value === "L2" || value === "L3" ? value : "L1";
}

function normalizeRisk(value: unknown): RiskLevel {
  return value === "medium" || value === "high" || value === "critical" ? value : "low";
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items : fallback;
}

