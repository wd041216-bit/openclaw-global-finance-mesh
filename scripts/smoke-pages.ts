import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

async function main() {
  const pagePath = path.join(REPO_ROOT, "site", "index.html");
  const stylePath = path.join(REPO_ROOT, "site", "styles.css");
  const readmePath = path.join(REPO_ROOT, "README.md");
  const readmeZhPath = path.join(REPO_ROOT, "README.zh-CN.md");

  const [page, styles, readme, readmeZh] = await Promise.all([
    fs.readFile(pagePath, "utf8"),
    fs.readFile(stylePath, "utf8"),
    fs.readFile(readmePath, "utf8"),
    fs.readFile(readmeZhPath, "utf8"),
  ]);

  const requiredSections = ["why", "try", "install", "connect-agents", "pilot", "download"];
  for (const sectionId of requiredSections) {
    assertContains(page, `id="${sectionId}"`, `site page section ${sectionId}`);
  }

  const hosts = ["OpenClaw", "Claude", "Manus", "Cursor", "Cline", "Cherry Studio"];
  for (const host of hosts) {
    assertContains(page, host, `site host ${host}`);
    assertContains(readme, host, `README host ${host}`);
  }

  const runtimeDefaults = [
    "OLLAMA_MODE=cloud",
    "OLLAMA_MODEL=kimi-k2.5",
    "FINANCE_MESH_CLOUD_API_FLAVOR=auto",
  ];
  for (const token of runtimeDefaults) {
    assertContains(page, token, `site runtime default ${token}`);
    assertContains(readme, token, `README runtime default ${token}`);
    assertContains(readmeZh, token, `README.zh-CN runtime default ${token}`);
  }

  const expectedAssets = [
    "zhouheng-finance-mesh-0.4.0-macos.pkg",
    "zhouheng-finance-mesh-0.4.0-macos.dmg",
    "zhouheng-finance-mesh-0.4.0-macos.zip",
    "zhouheng-finance-mesh-0.4.0-windows.exe",
    "zhouheng-finance-mesh-0.4.0-windows.zip",
    "SHA256SUMS",
  ];
  for (const asset of expectedAssets) {
    assertContains(page, asset, `site download asset ${asset}`);
  }

  assertContains(styles, "--blue:", "site styles accent color token");
  assertContains(styles, "min-height: 44px", "site styles touch target rule");

  console.log("Pages smoke completed successfully.");
}

function assertContains(content: string, needle: string, label: string) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${label}: ${needle}`);
  }
}

await main();
