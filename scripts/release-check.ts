import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

function readArgument(name: string): string | null {
  const prefix = `${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length).trim() || null;
  }
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1].trim() || null;
  }
  return null;
}

async function main() {
  const packageJson = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf8")) as {
    version?: string;
  };
  const version = String(packageJson.version || "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`package.json version must be semver. Received: ${version || "empty"}`);
  }

  const changelog = await fs.readFile(path.join(REPO_ROOT, "CHANGELOG.md"), "utf8");
  if (!changelog.includes(`## ${version}`)) {
    throw new Error(`CHANGELOG.md must contain a heading for version ${version}.`);
  }

  const tag =
    readArgument("--tag")
    || process.env.RELEASE_TAG
    || (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME || "" : "")
    || "";

  if (tag) {
    const normalizedTag = tag.replace(/^refs\/tags\//, "");
    if (!/^v\d+\.\d+\.\d+$/.test(normalizedTag)) {
      throw new Error(`Release tag must look like vX.Y.Z. Received: ${normalizedTag}`);
    }
    if (normalizedTag.slice(1) !== version) {
      throw new Error(`Release tag ${normalizedTag} does not match package.json version ${version}.`);
    }
  }

  console.log(
    JSON.stringify(
      {
        version,
        changelog: `## ${version}`,
        tag: tag || null,
      },
      null,
      2,
    ),
  );
}

await main();
