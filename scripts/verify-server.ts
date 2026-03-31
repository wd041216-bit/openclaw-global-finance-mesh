import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FILES = [
  "src/server.ts",
  "src/backup-store.ts",
  "src/restore-drill-store.ts",
  "src/operations-service.ts",
  "web/app.js",
];

for (const relativePath of FILES) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  execFileSync(process.execPath, ["--check", absolutePath], {
    stdio: "inherit",
  });
  console.log(`verified ${relativePath}`);
}
