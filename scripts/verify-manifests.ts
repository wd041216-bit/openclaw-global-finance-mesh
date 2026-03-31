import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const KUBERNETES_DIR = path.join(REPO_ROOT, "deploy", "kubernetes");
const MANIFESTS = [
  "persistentvolumeclaim.yaml",
  "configmap.yaml",
  "secret.example.yaml",
  "deployment.yaml",
  "service.yaml",
  "ingress.example.yaml",
];

async function main() {
  try {
    execFileSync("kubectl", ["version", "--client=true", "--output=yaml"], {
      stdio: "ignore",
    });
  } catch (error) {
    throw new Error(`kubectl is required for verify:manifests. ${String(error)}`);
  }

  for (const manifest of MANIFESTS) {
    const absolutePath = path.join(KUBERNETES_DIR, manifest);
    await fs.access(absolutePath);
    try {
      execFileSync(
        "kubectl",
        ["apply", "--dry-run=client", "--validate=false", "-f", absolutePath],
        {
          stdio: "inherit",
        },
      );
    } catch (error) {
      throw new Error(
        `Manifest ${manifest} failed kubectl dry-run validation. kubectl still needs API discovery, so run this command against a disposable cluster context. GitHub Actions provisions kind automatically. ${String(error)}`,
      );
    }
    console.log(`validated ${manifest}`);
  }
}

await main();
