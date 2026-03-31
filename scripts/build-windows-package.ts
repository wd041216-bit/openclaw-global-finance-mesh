import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: string };

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const APP_NAME = "Zhouheng Finance Mesh";
const PACKAGE_SLUG = "zhouheng-finance-mesh";
const VERSION = packageJson.version || "0.0.0";
const NODE_VERSION = "22.22.2";
const NODE_PLATFORM = "win-x64";
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "dist", "windows");
const WINDOWS_DESKTOP_DIR = path.join(REPO_ROOT, "desktop", "windows");

const PROJECT_DIRS = ["src", "web", "examples", "integrations", "docs"] as const;
const PROJECT_FILES = [
  "package.json",
  "package-lock.json",
  "README.md",
  "README.zh-CN.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
] as const;

interface CliOptions {
  outDir?: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const outDir = options.outDir ? path.resolve(options.outDir) : DEFAULT_OUT_DIR;
  const releaseName = `${PACKAGE_SLUG}-${VERSION}-windows`;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `${PACKAGE_SLUG}-windows-`));
  const buildReleaseRoot = path.join(tempRoot, releaseName);
  const payloadRoot = path.join(buildReleaseRoot, "app");
  const runtimeRoot = path.join(buildReleaseRoot, "node-runtime");
  const releaseRoot = path.join(outDir, releaseName);
  const zipPath = path.join(outDir, `${releaseName}.zip`);

  try {
    await fs.mkdir(buildReleaseRoot, { recursive: true });
    await bundleOfficialWindowsRuntime(runtimeRoot);
    await copyDesktopScripts(buildReleaseRoot);
    await fs.mkdir(payloadRoot, { recursive: true });
    await copyProjectPayload(payloadRoot);
    await installRuntimeDependencies(payloadRoot);
    await writeSeedData(payloadRoot);
    await writeHelperFiles(buildReleaseRoot);
    await removeFinderMetadata(buildReleaseRoot);

    await publishReleaseFolder(buildReleaseRoot, releaseRoot);
    await createZip(buildReleaseRoot, zipPath);

    console.log(
      JSON.stringify(
        {
          ok: true,
          releaseRoot,
          zipPath,
          nodeVersion: NODE_VERSION,
          version: VERSION,
        },
        null,
        2,
      ),
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function parseArgs(args: string[]): CliOptions {
  let outDir: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out-dir") {
      outDir = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { outDir };
}

async function bundleOfficialWindowsRuntime(runtimeRoot: string): Promise<void> {
  const cacheDir = path.join(os.homedir(), "Library", "Caches", PACKAGE_SLUG, "windows-node-runtime");
  const archiveName = `node-v${NODE_VERSION}-${NODE_PLATFORM}.zip`;
  const archiveUrl = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`;
  const archivePath = path.join(cacheDir, archiveName);
  const extractionRoot = path.join(cacheDir, `node-v${NODE_VERSION}-${NODE_PLATFORM}`);
  const extractedDistRoot = path.join(extractionRoot, `node-v${NODE_VERSION}-${NODE_PLATFORM}`);

  await fs.mkdir(cacheDir, { recursive: true });
  await downloadIfMissing(archiveUrl, archivePath);

  if (!(await pathExists(extractedDistRoot))) {
    await fs.rm(extractionRoot, { recursive: true, force: true });
    await fs.mkdir(extractionRoot, { recursive: true });
    runCommand("ditto", ["-x", "-k", archivePath, extractionRoot], {
      cwd: cacheDir,
      stdio: "inherit",
    });
  }

  await fs.rm(runtimeRoot, { recursive: true, force: true });
  await fs.mkdir(runtimeRoot, { recursive: true });
  await fs.copyFile(path.join(extractedDistRoot, "node.exe"), path.join(runtimeRoot, "node.exe"));
}

async function copyDesktopScripts(releaseRoot: string): Promise<void> {
  for (const fileName of ["ServiceControl.ps1", "TrayApp.ps1"]) {
    const source = path.join(WINDOWS_DESKTOP_DIR, fileName);
    if (!(await pathExists(source))) {
      throw new Error(`Missing Windows desktop script: ${source}`);
    }
    await fs.copyFile(source, path.join(releaseRoot, fileName));
  }
}

async function copyProjectPayload(payloadRoot: string): Promise<void> {
  for (const directory of PROJECT_DIRS) {
    await fs.cp(path.join(REPO_ROOT, directory), path.join(payloadRoot, directory), {
      recursive: true,
      force: true,
    });
  }
  for (const file of PROJECT_FILES) {
    await fs.copyFile(path.join(REPO_ROOT, file), path.join(payloadRoot, file));
  }
}

async function installRuntimeDependencies(payloadRoot: string): Promise<void> {
  runCommand("npm", ["ci", "--omit=dev", "--ignore-scripts"], {
    cwd: payloadRoot,
    stdio: "inherit",
  });
}

async function writeSeedData(payloadRoot: string): Promise<void> {
  const dataRoot = path.join(payloadRoot, "data");
  await fs.mkdir(path.join(dataRoot, "runtime"), { recursive: true });
  await fs.mkdir(path.join(dataRoot, "audit", "exports"), { recursive: true });
  await fs.mkdir(path.join(dataRoot, "legal-library"), { recursive: true });
  await fs.writeFile(path.join(dataRoot, "runtime", ".gitkeep"), "", "utf8");
  await fs.writeFile(path.join(dataRoot, "audit", ".gitkeep"), "", "utf8");
  await fs.writeFile(path.join(dataRoot, "audit", "exports", ".gitkeep"), "", "utf8");
  await fs.copyFile(
    path.join(REPO_ROOT, "data", "legal-library", "library.json"),
    path.join(dataRoot, "legal-library", "library.json"),
  );
}

async function writeHelperFiles(releaseRoot: string): Promise<void> {
  await fs.writeFile(path.join(releaseRoot, `Install ${APP_NAME}.cmd`), renderInstallCmd(), "utf8");
  await fs.writeFile(path.join(releaseRoot, `Install-${APP_NAME}.ps1`), renderInstallPs1(), "utf8");
  await fs.writeFile(path.join(releaseRoot, `Start ${APP_NAME}.cmd`), renderStartCmd(), "utf8");
  await fs.writeFile(path.join(releaseRoot, `Stop ${APP_NAME}.cmd`), renderStopCmd(), "utf8");
  await fs.writeFile(path.join(releaseRoot, `Open ${APP_NAME} Data Folder.cmd`), renderOpenDataCmd(), "utf8");
  await fs.writeFile(path.join(releaseRoot, `Edit ${APP_NAME} Desktop Config.cmd`), renderEditConfigCmd(), "utf8");
  await fs.writeFile(path.join(releaseRoot, `Edit-${APP_NAME}-Desktop-Config.ps1`), renderEditConfigPs1(), "utf8");
  await fs.writeFile(path.join(releaseRoot, "README.txt"), renderReleaseReadme(), "utf8");
}

async function publishReleaseFolder(sourceReleaseRoot: string, destinationReleaseRoot: string): Promise<void> {
  await fs.mkdir(path.dirname(destinationReleaseRoot), { recursive: true });
  await fs.rm(destinationReleaseRoot, { recursive: true, force: true });
  await fs.cp(sourceReleaseRoot, destinationReleaseRoot, {
    recursive: true,
    force: true,
  });
  await removeFinderMetadata(destinationReleaseRoot);
}

async function createZip(releaseRoot: string, zipPath: string): Promise<void> {
  await fs.mkdir(path.dirname(zipPath), { recursive: true });
  await fs.rm(zipPath, { force: true });
  runCommand("zip", ["-q", "-r", "-X", zipPath, path.basename(releaseRoot)], {
    cwd: path.dirname(releaseRoot),
    stdio: "inherit",
  });
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; stdio: "inherit" | "ignore" | "pipe" },
): void {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: options.stdio,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

async function downloadIfMissing(url: string, destinationPath: string): Promise<void> {
  if (await pathExists(destinationPath)) {
    return;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destinationPath, bytes);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function removeFinderMetadata(targetRoot: string): Promise<void> {
  const entries = await fs.readdir(targetRoot, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      await removeFinderMetadata(entryPath);
      continue;
    }
    if (entry.name === ".DS_Store" || entry.name.startsWith("._")) {
      await fs.rm(entryPath, { force: true });
    }
  }
}

function renderInstallCmd(): string {
  return `@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Install-${APP_NAME}.ps1" -SourceRoot "%SCRIPT_DIR%" -Launch
`;
}

function renderInstallPs1(): string {
  return `param(
  [string]$SourceRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path),
  [switch]$Launch
)

$ErrorActionPreference = "Stop"
$AppName = "${APP_NAME}"
$TargetRoot = Join-Path $env:LOCALAPPDATA "Programs\\$AppName"
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs\\$AppName"

if (Test-Path $TargetRoot) {
  Remove-Item -Path $TargetRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
Copy-Item -Path (Join-Path $SourceRoot "*") -Destination $TargetRoot -Recurse -Force

if (Test-Path $StartMenuDir) {
  Remove-Item -Path $StartMenuDir -Recurse -Force
}
New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null

$shell = New-Object -ComObject WScript.Shell

function New-Shortcut([string]$ShortcutPath, [string]$TargetPath, [string]$Arguments, [string]$WorkingDirectory) {
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $TargetPath
  $shortcut.Arguments = $Arguments
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.Save()
}

New-Shortcut (Join-Path $StartMenuDir "$AppName.lnk") "cmd.exe" "/c \`"$TargetRoot\\Start ${APP_NAME}.cmd\`"" $TargetRoot
New-Shortcut (Join-Path $StartMenuDir "Stop $AppName.lnk") "cmd.exe" "/c \`"$TargetRoot\\Stop ${APP_NAME}.cmd\`"" $TargetRoot
New-Shortcut (Join-Path $StartMenuDir "Edit $AppName Config.lnk") "cmd.exe" "/c \`"$TargetRoot\\Edit ${APP_NAME} Desktop Config.cmd\`"" $TargetRoot

if ($Launch) {
  Start-Process (Join-Path $TargetRoot "Start ${APP_NAME}.cmd") | Out-Null
}

Write-Host "Installed to $TargetRoot"
`;
}

function renderStartCmd(): string {
  return `@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%TrayApp.ps1"
`;
}

function renderStopCmd(): string {
  return `@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%ServiceControl.ps1" -Command stop
`;
}

function renderOpenDataCmd(): string {
  return `@echo off
setlocal
start "" "%LOCALAPPDATA%\\${APP_NAME}"
`;
}

function renderEditConfigCmd(): string {
  return `@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Edit-${APP_NAME}-Desktop-Config.ps1"
`;
}

function renderEditConfigPs1(): string {
  return `$ErrorActionPreference = "Stop"
$SupportRoot = Join-Path $env:LOCALAPPDATA "${APP_NAME}"
$EnvFile = Join-Path $SupportRoot "desktop.env"
if (-not (Test-Path $SupportRoot)) {
  New-Item -ItemType Directory -Path $SupportRoot -Force | Out-Null
}
if (-not (Test-Path $EnvFile)) {
  @(
    "FINANCE_MESH_PORT=3030"
    "FINANCE_MESH_ENVIRONMENT=desktop"
    "FINANCE_MESH_TEAM_SCOPE=single-user"
    "FINANCE_MESH_LOG_FORMAT=pretty"
    "FINANCE_MESH_AUTH_ENABLED=true"
    "FINANCE_MESH_ALLOW_LOCAL_TOKENS=true"
    "FINANCE_MESH_COOKIE_SECURE=false"
    "FINANCE_MESH_BASE_URL=http://127.0.0.1:3030"
    "OLLAMA_MODE=cloud"
    "OLLAMA_MODEL=kimi-k2.5"
    "OLLAMA_CLOUD_BASE_URL=https://ollama.com"
    "FINANCE_MESH_CLOUD_API_FLAVOR=auto"
    "OLLAMA_API_KEY="
  ) | Set-Content -Path $EnvFile -Encoding UTF8
}
Start-Process "notepad.exe" $EnvFile | Out-Null
`;
}

function renderReleaseReadme(): string {
  return `Zhouheng Finance Mesh Windows desktop package (${VERSION})

Included artifacts:
- ${releaseNamePlaceholder()}
- Install ${APP_NAME}.cmd
- Start ${APP_NAME}.cmd
- Stop ${APP_NAME}.cmd

What this package gives you:
- a local Windows install under %LOCALAPPDATA%\\Programs\\${APP_NAME}
- an official Node.js ${NODE_VERSION} Windows runtime bundled inside the package
- a tray launcher with start / stop / open-console actions
- local data under %LOCALAPPDATA%\\${APP_NAME}

Recommended flow:
1. Unzip the package.
2. Double-click "Install ${APP_NAME}.cmd".
3. Let the installer create Start Menu shortcuts and launch the tray app.
4. Fill in OLLAMA_API_KEY from the desktop config or the system page.
`;
}

function releaseNamePlaceholder(): string {
  return `${PACKAGE_SLUG}-${VERSION}-windows.zip`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
