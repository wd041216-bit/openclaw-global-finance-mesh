import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: string };
const VERSION = String(packageJson.version || "0.0.0");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

interface CliOptions {
  strict: boolean;
  artifactsDir: string;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const expectedArtifacts = [
    `zhouheng-finance-mesh-${VERSION}-macos.pkg`,
    `zhouheng-finance-mesh-${VERSION}-macos.dmg`,
    `zhouheng-finance-mesh-${VERSION}-macos.zip`,
    `zhouheng-finance-mesh-${VERSION}-windows.exe`,
    `zhouheng-finance-mesh-${VERSION}-windows.zip`,
    "SHA256SUMS",
  ];

  const releaseWorkflowPath = path.join(REPO_ROOT, ".github", "workflows", "release.yml");
  const releaseWorkflow = await fs.readFile(releaseWorkflowPath, "utf8");
  for (const expected of expectedArtifacts) {
    if (!workflowReferencesAsset(releaseWorkflow, expected)) {
      throw new Error(`Release workflow does not reference expected asset: ${expected}`);
    }
  }

  if (!(await exists(options.artifactsDir))) {
    if (options.strict) {
      throw new Error(`Artifacts directory not found in strict mode: ${options.artifactsDir}`);
    }
    console.log("Release artifacts smoke completed in metadata-only mode.");
    return;
  }

  const entries = await fs.readdir(options.artifactsDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  for (const expected of expectedArtifacts) {
    if (!files.includes(expected)) {
      throw new Error(`Missing release artifact: ${expected}`);
    }
  }

  const checksumsPath = path.join(options.artifactsDir, "SHA256SUMS");
  const checksumsRaw = await fs.readFile(checksumsPath, "utf8");
  const checksumMap = parseChecksumFile(checksumsRaw);

  for (const expected of expectedArtifacts.filter((item) => item !== "SHA256SUMS")) {
    const filePath = path.join(options.artifactsDir, expected);
    const actualSha = await hashFile(filePath);
    const declaredSha = checksumMap.get(expected);
    if (!declaredSha) {
      throw new Error(`SHA256SUMS is missing entry for ${expected}`);
    }
    if (declaredSha !== actualSha) {
      throw new Error(`SHA mismatch for ${expected}: declared=${declaredSha} actual=${actualSha}`);
    }
  }

  console.log("Release artifacts smoke completed successfully.");
}

function parseArgs(args: string[]): CliOptions {
  let strict = false;
  let artifactsDir = path.join(REPO_ROOT, "release-artifacts");

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    if (arg === "--artifacts-dir") {
      artifactsDir = path.resolve(args[index + 1] || "");
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    strict,
    artifactsDir,
  };
}

function parseChecksumFile(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!match) {
      continue;
    }
    map.set(match[2].trim(), match[1].toLowerCase());
  }
  return map;
}

async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function workflowReferencesAsset(workflowText: string, expectedAsset: string): boolean {
  if (workflowText.includes(expectedAsset)) {
    return true;
  }
  if (expectedAsset === "SHA256SUMS") {
    return false;
  }
  const templatedAsset = expectedAsset.replace(VERSION, "${{ needs.validate.outputs.version }}");
  return workflowText.includes(templatedAsset);
}

await main();
