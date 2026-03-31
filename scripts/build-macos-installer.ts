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
const NODE_PLATFORM = resolveNodePlatform(process.arch);

const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "dist", "macos");
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

async function main(): Promise<void> {
  ensureDarwin();
  const options = parseArgs(process.argv.slice(2));
  const outDir = options.outDir ? path.resolve(options.outDir) : DEFAULT_OUT_DIR;
  const releaseName = `${PACKAGE_SLUG}-${VERSION}-macos`;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `${PACKAGE_SLUG}-build-`));
  const buildReleaseRoot = path.join(tempRoot, releaseName);
  const appBundle = path.join(buildReleaseRoot, `${APP_NAME}.app`);
  const contentsDir = path.join(appBundle, "Contents");
  const macosDir = path.join(contentsDir, "MacOS");
  const resourcesDir = path.join(contentsDir, "Resources");
  const payloadRoot = path.join(resourcesDir, "app");
  const releaseRoot = path.join(outDir, releaseName);
  const zipPath = path.join(outDir, `${releaseName}.zip`);
  const dmgPath = path.join(outDir, `${releaseName}.dmg`);

  try {
    await fs.mkdir(macosDir, { recursive: true });
    await writeFileExecutable(path.join(macosDir, "zhouheng-finance-mesh"), renderLauncherScript());
    await fs.writeFile(path.join(contentsDir, "Info.plist"), renderInfoPlist(), "utf8");

    await bundleOfficialNodeRuntime(resourcesDir);
    await fs.mkdir(payloadRoot, { recursive: true });
    await copyProjectPayload(payloadRoot);
    await installRuntimeDependencies(payloadRoot);
    await writeSeedData(payloadRoot);
    await writeHelperFiles(buildReleaseRoot);

    signAppBundle(appBundle);
    verifyAppBundle(appBundle);

    await publishReleaseFolder(buildReleaseRoot, releaseRoot);
    await createZip(buildReleaseRoot, zipPath);
    if (!options.skipDmg) {
      await createDmg(buildReleaseRoot, dmgPath);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          appBundle: releaseRoot ? path.join(releaseRoot, `${APP_NAME}.app`) : null,
          zipPath,
          dmgPath: options.skipDmg ? null : dmgPath,
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

function ensureDarwin(): void {
  if (process.platform !== "darwin") {
    throw new Error("The macOS installer builder can only run on macOS.");
  }
}

function parseArgs(args: string[]): { skipDmg: boolean; outDir?: string } {
  let skipDmg = false;
  let outDir: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--skip-dmg") {
      skipDmg = true;
      continue;
    }
    if (arg === "--out-dir") {
      outDir = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { skipDmg, outDir };
}

function resolveNodePlatform(arch: NodeJS.Architecture): string {
  if (arch === "arm64") {
    return "darwin-arm64";
  }
  if (arch === "x64") {
    return "darwin-x64";
  }
  throw new Error(`Unsupported macOS architecture for desktop packaging: ${arch}`);
}

async function bundleOfficialNodeRuntime(resourcesDir: string): Promise<void> {
  const runtimeDir = path.join(resourcesDir, "node-runtime");
  const cacheDir = path.join(os.homedir(), "Library", "Caches", PACKAGE_SLUG, "macos-node-runtime");
  const archiveName = `node-v${NODE_VERSION}-${NODE_PLATFORM}.tar.gz`;
  const archiveUrl = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`;
  const archivePath = path.join(cacheDir, archiveName);
  const extractionRoot = path.join(cacheDir, `node-v${NODE_VERSION}-${NODE_PLATFORM}`);
  const extractedDistRoot = path.join(extractionRoot, `node-v${NODE_VERSION}-${NODE_PLATFORM}`);

  await fs.mkdir(cacheDir, { recursive: true });
  await downloadIfMissing(archiveUrl, archivePath);

  if (!(await pathExists(extractedDistRoot))) {
    await fs.rm(extractionRoot, { recursive: true, force: true });
    await fs.mkdir(extractionRoot, { recursive: true });
    runCommand("tar", ["-xzf", archivePath, "-C", extractionRoot], {
      cwd: cacheDir,
      stdio: "inherit",
    });
  }

  await fs.rm(runtimeDir, { recursive: true, force: true });
  await fs.mkdir(path.join(runtimeDir, "bin"), { recursive: true });
  await fs.copyFile(
    path.join(extractedDistRoot, "bin", "node"),
    path.join(runtimeDir, "bin", "node"),
  );
  await fs.chmod(path.join(runtimeDir, "bin", "node"), 0o755);
  await fs.cp(path.join(extractedDistRoot, "lib"), path.join(runtimeDir, "lib"), {
    recursive: true,
    force: true,
  });

  const bundledNodeBin = path.join(runtimeDir, "bin", "node");
  const probe = spawnSync(bundledNodeBin, ["-v"], {
    encoding: "utf8",
  });
  if (probe.status !== 0) {
    throw new Error(`Bundled official Node runtime failed to start: ${probe.stderr || probe.stdout || "unknown error"}`);
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
  await writeFileExecutable(
    path.join(releaseRoot, `Install ${APP_NAME}.command`),
    renderInstallCommand(),
  );
  await writeFileExecutable(
    path.join(releaseRoot, `Stop ${APP_NAME}.command`),
    renderStopCommand(),
  );
  await writeFileExecutable(
    path.join(releaseRoot, `Open ${APP_NAME} Data Folder.command`),
    renderOpenDataCommand(),
  );
  await writeFileExecutable(
    path.join(releaseRoot, `Edit ${APP_NAME} Desktop Config.command`),
    renderEditConfigCommand(),
  );
  await fs.writeFile(path.join(releaseRoot, "README.txt"), renderReleaseReadme(), "utf8");
}

async function publishReleaseFolder(sourceReleaseRoot: string, destinationReleaseRoot: string): Promise<void> {
  await fs.mkdir(path.dirname(destinationReleaseRoot), { recursive: true });
  await fs.rm(destinationReleaseRoot, { recursive: true, force: true });
  runCommand("ditto", ["--norsrc", "--noextattr", sourceReleaseRoot, destinationReleaseRoot], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

async function createZip(releaseRoot: string, zipPath: string): Promise<void> {
  await fs.mkdir(path.dirname(zipPath), { recursive: true });
  await fs.rm(zipPath, { force: true });
  runCommand("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", releaseRoot, zipPath], {
    cwd: path.dirname(releaseRoot),
    stdio: "inherit",
  });
}

async function createDmg(releaseRoot: string, dmgPath: string): Promise<void> {
  await fs.mkdir(path.dirname(dmgPath), { recursive: true });
  await fs.rm(dmgPath, { force: true });
  runCommand(
    "hdiutil",
    [
      "create",
      "-volname",
      `${APP_NAME} ${VERSION}`,
      "-srcfolder",
      releaseRoot,
      "-ov",
      "-format",
      "UDZO",
      dmgPath,
    ],
    {
      cwd: path.dirname(releaseRoot),
      stdio: "inherit",
    },
  );
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

function signAppBundle(appBundle: string): void {
  runCommand("xattr", ["-cr", appBundle], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  runCommand("codesign", ["--force", "--deep", "--sign", "-", appBundle], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

function verifyAppBundle(appBundle: string): void {
  runCommand("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appBundle], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeFileExecutable(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, "utf8");
  await fs.chmod(filePath, 0o755);
}

function renderInfoPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>com.zhouheng.finance-mesh.desktop</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>zhouheng-finance-mesh</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}

function renderLauncherScript(): string {
  return `#!/bin/zsh
set -euo pipefail

APP_NAME="${APP_NAME}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTENTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
APP_ROOT="$RESOURCES_DIR/app"
RUNTIME_ROOT="$RESOURCES_DIR/node-runtime"
BUNDLED_NODE_BIN="$RUNTIME_ROOT/bin/node"
SUPPORT_ROOT="$HOME/Library/Application Support/$APP_NAME"
DATA_ROOT="$SUPPORT_ROOT/data"
BACKUP_ROOT="$SUPPORT_ROOT/backups"
LOG_DIR="$SUPPORT_ROOT/logs"
ENV_FILE="$SUPPORT_ROOT/desktop.env"
PID_FILE="$SUPPORT_ROOT/server.pid"
LOG_FILE="$LOG_DIR/server.log"
DEFAULT_PORT="3030"

mkdir -p "$SUPPORT_ROOT" "$DATA_ROOT" "$BACKUP_ROOT" "$LOG_DIR"

create_default_env() {
  cat > "$ENV_FILE" <<EOF
# ${APP_NAME} desktop profile
# Fill OLLAMA_API_KEY here or paste it later in the System page after bootstrap.
FINANCE_MESH_PORT=$DEFAULT_PORT
FINANCE_MESH_ENVIRONMENT=desktop
FINANCE_MESH_TEAM_SCOPE=single-user
FINANCE_MESH_LOG_FORMAT=pretty
FINANCE_MESH_DATA_ROOT="$DATA_ROOT"
FINANCE_MESH_BACKUP_LOCAL_DIR="$BACKUP_ROOT"
FINANCE_MESH_RESTORE_DRILL_RETENTION_DAYS=7
FINANCE_MESH_RESTORE_DRILL_WARN_HOURS=168
FINANCE_MESH_AUDIT_VERIFY_WARN_HOURS=24
FINANCE_MESH_AUTH_ENABLED=true
FINANCE_MESH_ALLOW_LOCAL_TOKENS=true
FINANCE_MESH_COOKIE_SECURE=false
FINANCE_MESH_BASE_URL=http://127.0.0.1:$DEFAULT_PORT
OLLAMA_MODE=cloud
OLLAMA_MODEL=kimi-k2.5
OLLAMA_CLOUD_BASE_URL=https://ollama.com
FINANCE_MESH_CLOUD_API_FLAVOR=auto
OLLAMA_API_KEY=
EOF
}

if [ ! -f "$ENV_FILE" ]; then
  create_default_env
  FIRST_LAUNCH="true"
else
  FIRST_LAUNCH="false"
fi

set -a
source "$ENV_FILE"
set +a

PORT="\${FINANCE_MESH_PORT:-$DEFAULT_PORT}"
BASE_URL="\${FINANCE_MESH_BASE_URL:-http://127.0.0.1:$DEFAULT_PORT}"
export FINANCE_MESH_DATA_ROOT="\${FINANCE_MESH_DATA_ROOT:-$DATA_ROOT}"
export FINANCE_MESH_BACKUP_LOCAL_DIR="\${FINANCE_MESH_BACKUP_LOCAL_DIR:-$BACKUP_ROOT}"
export FINANCE_MESH_COOKIE_SECURE="\${FINANCE_MESH_COOKIE_SECURE:-false}"
export FINANCE_MESH_BASE_URL="$BASE_URL"

pick_node_bin() {
  if [ -x "$BUNDLED_NODE_BIN" ]; then
    echo "$BUNDLED_NODE_BIN"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  return 1
}

NODE_BIN="$(pick_node_bin || true)"
if [ -z "$NODE_BIN" ]; then
  osascript -e 'display alert "Zhouheng Finance Mesh" message "没有找到可用的 Node 运行时。请重新安装桌面包，或手动安装 Node.js 22+。"' || true
  exit 1
fi

port_is_free() {
  local port="$1"
  python3 - "$port" <<'PY'
import socket
import sys
port = int(sys.argv[1])
sock = socket.socket()
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind(("127.0.0.1", port))
except OSError:
    print("busy")
    sys.exit(1)
else:
    print("free")
    sys.exit(0)
finally:
    sock.close()
PY
}

pick_port() {
  local start="$1"
  local current="$start"
  while [ "$current" -le 3040 ]; do
    if port_is_free "$current" >/dev/null 2>&1; then
      echo "$current"
      return 0
    fi
    current=$((current + 1))
  done
  return 1
}

wait_for_health() {
  local url="$1"
  local attempts=30
  while [ "$attempts" -gt 0 ]; do
    if curl -fsS "$url/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    attempts=$((attempts - 1))
  done
  return 1
}

if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" >/dev/null 2>&1 && wait_for_health "$BASE_URL"; then
    if [ "$FIRST_LAUNCH" = "true" ]; then
      open "$BASE_URL/system.html"
    else
      open "$BASE_URL/workbench.html"
    fi
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if ! port_is_free "$PORT" >/dev/null 2>&1; then
  NEXT_PORT="$(pick_port "$PORT" || true)"
  if [ -z "$NEXT_PORT" ]; then
    osascript -e 'display alert "Zhouheng Finance Mesh" message "本地 3030-3040 端口都已被占用，请先释放一个端口后再启动。"' || true
    exit 1
  fi
  PORT="$NEXT_PORT"
  BASE_URL="http://127.0.0.1:$PORT"
  export FINANCE_MESH_PORT="$PORT"
  export FINANCE_MESH_BASE_URL="$BASE_URL"
fi

(
  cd "$APP_ROOT"
  nohup "$NODE_BIN" src/server.ts >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
)

if wait_for_health "$BASE_URL"; then
  if [ "$FIRST_LAUNCH" = "true" ]; then
    open "$BASE_URL/system.html"
  else
    open "$BASE_URL/workbench.html"
  fi
  exit 0
fi

osascript -e 'display alert "Zhouheng Finance Mesh" message "桌面版已启动失败，请查看 ~/Library/Application Support/Zhouheng Finance Mesh/logs/server.log。"' || true
exit 1
`;
}

function renderInstallCommand(): string {
  return `#!/bin/zsh
set -euo pipefail

APP_NAME="${APP_NAME}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_APP="$SCRIPT_DIR/$APP_NAME.app"
TARGET_APPS_DIR="$HOME/Applications"
TARGET_APP="$TARGET_APPS_DIR/$APP_NAME.app"
TOOLS_DIR="$HOME/Applications/$APP_NAME Tools"

mkdir -p "$TARGET_APPS_DIR" "$TOOLS_DIR"
rm -rf "$TARGET_APP"
ditto --norsrc --noextattr "$SOURCE_APP" "$TARGET_APP"
xattr -cr "$TARGET_APP" 2>/dev/null || true
xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true

for helper in \\
  "Stop $APP_NAME.command" \\
  "Open $APP_NAME Data Folder.command" \\
  "Edit $APP_NAME Desktop Config.command"; do
  cp "$SCRIPT_DIR/$helper" "$TOOLS_DIR/$helper"
  chmod +x "$TOOLS_DIR/$helper"
done

open "$TARGET_APP"
osascript -e 'display notification "已安装到 ~/Applications，并已尝试启动。" with title "Zhouheng Finance Mesh"' || true
`;
}

function renderStopCommand(): string {
  return `#!/bin/zsh
set -euo pipefail

PID_FILE="$HOME/Library/Application Support/${APP_NAME}/server.pid"
if [ ! -f "$PID_FILE" ]; then
  osascript -e 'display alert "Zhouheng Finance Mesh" message "当前没有找到运行中的本地服务。"' || true
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [ -n "$PID" ] && kill -0 "$PID" >/dev/null 2>&1; then
  kill "$PID"
fi
rm -f "$PID_FILE"
osascript -e 'display notification "本地服务已停止。" with title "Zhouheng Finance Mesh"' || true
`;
}

function renderOpenDataCommand(): string {
  return `#!/bin/zsh
set -euo pipefail
open "$HOME/Library/Application Support/${APP_NAME}"
`;
}

function renderEditConfigCommand(): string {
  return `#!/bin/zsh
set -euo pipefail

CONFIG_FILE="$HOME/Library/Application Support/${APP_NAME}/desktop.env"
mkdir -p "$(dirname "$CONFIG_FILE")"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" <<'EOF'
FINANCE_MESH_PORT=3030
FINANCE_MESH_ENVIRONMENT=desktop
FINANCE_MESH_TEAM_SCOPE=single-user
FINANCE_MESH_LOG_FORMAT=pretty
FINANCE_MESH_AUTH_ENABLED=true
FINANCE_MESH_ALLOW_LOCAL_TOKENS=true
FINANCE_MESH_COOKIE_SECURE=false
FINANCE_MESH_BASE_URL=http://127.0.0.1:3030
OLLAMA_MODE=cloud
OLLAMA_MODEL=kimi-k2.5
OLLAMA_CLOUD_BASE_URL=https://ollama.com
FINANCE_MESH_CLOUD_API_FLAVOR=auto
OLLAMA_API_KEY=
EOF
fi
open -a TextEdit "$CONFIG_FILE"
`;
}

function renderReleaseReadme(): string {
  return `Zhouheng Finance Mesh macOS package (${VERSION})

1. Double-click "Install ${APP_NAME}.command".
2. The installer copies the app into ~/Applications and launches it.
3. On first launch, the app opens the System page at http://127.0.0.1:3030/system.html.
4. Complete bootstrap, then paste your Ollama Cloud key in the runtime section if needed.

Helper scripts:
- Stop ${APP_NAME}.command
- Open ${APP_NAME} Data Folder.command
- Edit ${APP_NAME} Desktop Config.command

Local data location:
~/Library/Application Support/${APP_NAME}

This package bundles the official Node.js ${NODE_VERSION} macOS runtime, so users do not need to preinstall Node.
The app is ad-hoc signed for local distribution but not notarized. If macOS blocks the app, right-click the installed app and choose Open once.
`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
