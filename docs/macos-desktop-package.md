# macOS Desktop Package

This repository can now be packaged as a local macOS desktop app for one-click installation.

## What the package does

- builds `Zhouheng Finance Mesh.app`
- builds `zhouheng-finance-mesh-<version>-macos.pkg`
- bundles the official Node.js 22.22.2 macOS runtime inside the app
- keeps user data outside `/Applications`
- runs as a menu bar app with desktop control actions
- creates helper scripts for stop / config / data-folder access

User data and local state live in:

```text
~/Library/Application Support/Zhouheng Finance Mesh
```

That folder stores:

- desktop env profile
- runtime config and persisted API key if the user saves one
- SQLite audit ledger
- session database
- backup snapshots
- restore-drill artifacts

## Build the installer

From the repo root:

```bash
npm run build:macos-installer
```

Artifacts are written to:

```text
dist/macos/
```

Expected outputs:

- `zhouheng-finance-mesh-<version>-macos/`
- `zhouheng-finance-mesh-<version>-macos.zip`
- `zhouheng-finance-mesh-<version>-macos.dmg`
- `zhouheng-finance-mesh-<version>-macos.pkg`

Recommended distribution artifacts:

- `zhouheng-finance-mesh-<version>-macos.pkg`
- `zhouheng-finance-mesh-<version>-macos.dmg`
- `zhouheng-finance-mesh-<version>-macos.zip`

If your repo lives inside iCloud Drive or another file-provider-backed folder, the raw `.app` inside `dist/` can pick up local Finder metadata after the build. The signed `zip` and `dmg` are the supported deliverables.

If you only want the app bundle and zip:

```bash
node scripts/build-macos-installer.ts --skip-dmg --skip-pkg
```

## Install locally

Recommended:

1. double-click `zhouheng-finance-mesh-<version>-macos.pkg`
2. install into `/Applications`
3. launch `Zhouheng Finance Mesh.app`

Alternative zip / dmg flow:

Open the generated folder or DMG and run:

```text
Install Zhouheng Finance Mesh.command
```

The installer:

1. copies the app into `~/Applications`
2. copies helper scripts into `~/Applications/Zhouheng Finance Mesh Tools`
3. removes local quarantine metadata when possible
4. launches the app

## First launch behavior

On first launch the app:

1. creates `~/Library/Application Support/Zhouheng Finance Mesh/desktop.env`
2. sets desktop-safe defaults such as:
   - `FINANCE_MESH_COOKIE_SECURE=false`
   - `OLLAMA_MODE=cloud`
   - `OLLAMA_MODEL=kimi-k2.5`
   - `FINANCE_MESH_CLOUD_API_FLAVOR=auto`
   - `FINANCE_MESH_DATA_ROOT=~/Library/Application Support/Zhouheng Finance Mesh/data`
3. starts the local service
4. appears in the macOS menu bar
5. opens `system.html` for bootstrap and runtime setup

After the first launch, the menu bar app lets you:

- open `工作台`
- open `系统设置`
- open `恢复中心`
- restart or stop the local service
- open the desktop config, data folder, and server log

## Runtime configuration

You do not need to edit the desktop env file before first launch.

Recommended flow:

1. install and open the app
2. bootstrap the first admin in `系统设置`
3. paste the Ollama Cloud key in the runtime section
4. run runtime verification
5. run a sample decision from `工作台`

If you prefer file-based configuration, use:

- `Edit Zhouheng Finance Mesh Desktop Config.command`

## Helper scripts

The package includes:

- `Stop Zhouheng Finance Mesh.command`
- `Open Zhouheng Finance Mesh Data Folder.command`
- `Edit Zhouheng Finance Mesh Desktop Config.command`

These are copied into:

```text
~/Applications/Zhouheng Finance Mesh Tools
```

## Important notes

- The package is ad-hoc signed for local distribution, but it is not notarized.
- On the first run, macOS may require `right-click -> Open`.
- Users do not need to preinstall Node.js.
- This desktop package is for local single-instance use, not hosted production rollout.
- The packaged app uses the same Ollama Cloud-first defaults as the pilot build:
  - `OLLAMA_MODE=cloud`
  - `OLLAMA_MODEL=kimi-k2.5`
  - `FINANCE_MESH_CLOUD_API_FLAVOR=auto`
