import fs from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";

import type { EventPayload, FinancePack, LoadedPack } from "./types.ts";

export async function loadFinancePacksFromPaths(
  inputPaths: string[],
  cwd = process.cwd(),
): Promise<LoadedPack[]> {
  const filePaths = await resolveStructuredFiles(inputPaths, cwd);
  const packs: LoadedPack[] = [];

  for (const filePath of filePaths) {
    const payload = await readStructuredFile(filePath);
    packs.push({
      path: filePath,
      pack: payload as FinancePack,
    });
  }

  return packs;
}

export async function loadEventsFromPaths(
  inputPaths: string[],
  cwd = process.cwd(),
): Promise<EventPayload[]> {
  const filePaths = await resolveStructuredFiles(inputPaths, cwd);
  const events: EventPayload[] = [];

  for (const filePath of filePaths) {
    const payload = await readStructuredFile(filePath);
    events.push(payload as EventPayload);
  }

  return events;
}

export async function readStructuredFile(filePath: string): Promise<unknown> {
  const absolutePath = path.resolve(filePath);
  const content = await fs.readFile(absolutePath, "utf8");

  if (absolutePath.endsWith(".json")) {
    return JSON.parse(content);
  }

  if (absolutePath.endsWith(".yaml") || absolutePath.endsWith(".yml")) {
    return YAML.parse(content);
  }

  throw new Error(`Unsupported structured file type: ${absolutePath}`);
}

export async function resolveStructuredFiles(inputPaths: string[], cwd = process.cwd()): Promise<string[]> {
  const results = new Set<string>();

  for (const inputPath of inputPaths) {
    const absolute = path.resolve(cwd, inputPath);
    await collectStructuredFiles(absolute, results);
  }

  return Array.from(results).sort();
}

async function collectStructuredFiles(targetPath: string, results: Set<string>): Promise<void> {
  const stats = await fs.stat(targetPath);

  if (stats.isDirectory()) {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      await collectStructuredFiles(path.join(targetPath, entry.name), results);
    }
    return;
  }

  if (
    targetPath.endsWith(".json") ||
    targetPath.endsWith(".yaml") ||
    targetPath.endsWith(".yml")
  ) {
    results.add(targetPath);
  }
}

