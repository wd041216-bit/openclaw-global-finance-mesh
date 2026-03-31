import path from "node:path";
import { fileURLToPath } from "node:url";

export interface FinanceMeshPaths {
  repoRoot: string;
  dataRoot: string;
  runtimeDir: string;
  auditDir: string;
  backupRoot: string;
  restoreDrillRoot: string;
  legalLibraryPath: string;
}

export function resolveFinanceMeshPaths(moduleUrl: string): FinanceMeshPaths {
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));
  const repoRoot = path.resolve(moduleDir, "..");
  const configuredDataRoot = process.env.FINANCE_MESH_DATA_ROOT?.trim();
  const dataRoot = configuredDataRoot ? path.resolve(configuredDataRoot) : path.join(repoRoot, "data");

  return {
    repoRoot,
    dataRoot,
    runtimeDir: path.join(dataRoot, "runtime"),
    auditDir: path.join(dataRoot, "audit"),
    backupRoot: path.join(dataRoot, "backups"),
    restoreDrillRoot: path.join(dataRoot, "restore-drills"),
    legalLibraryPath: path.join(dataRoot, "legal-library", "library.json"),
  };
}
