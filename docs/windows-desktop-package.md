# Windows Desktop Package

This repository can now be packaged as a Windows local desktop distribution for one-click pilot install.

## What the package does

- builds a Windows release folder plus `.zip`
- bundles the official Node.js 22.22.2 Windows runtime
- installs into `%LOCALAPPDATA%\Programs\Zhouheng Finance Mesh`
- stores user state under `%LOCALAPPDATA%\Zhouheng Finance Mesh`
- creates Start Menu shortcuts
- launches a tray-based controller with start / stop / open-console actions

## Build the package

From the repo root:

```bash
npm run build:windows-package
```

Artifacts are written to:

```text
dist/windows/
```

Expected outputs:

- `zhouheng-finance-mesh-<version>-windows/`
- `zhouheng-finance-mesh-<version>-windows.zip`

## Install on Windows

1. unzip `zhouheng-finance-mesh-<version>-windows.zip`
2. double-click `Install Zhouheng Finance Mesh.cmd`
3. let the installer copy the app into `%LOCALAPPDATA%\Programs\Zhouheng Finance Mesh`
4. use the Start Menu shortcut or the launched tray icon to open the console

## First launch behavior

On first launch the tray app:

1. creates `%LOCALAPPDATA%\Zhouheng Finance Mesh\desktop.env`
2. sets desktop-safe defaults such as:
   - `OLLAMA_MODE=cloud`
   - `OLLAMA_MODEL=kimi-k2.5`
   - `FINANCE_MESH_CLOUD_API_FLAVOR=auto`
   - `FINANCE_MESH_BASE_URL=http://127.0.0.1:3030`
3. starts the local service
4. opens `getting-started.html?mode=admin&entry=desktop` as the unified first-launch onboarding

## Tray experience

The Windows package includes a tray controller that can:

- open `首次向导`
- open `工作台`
- open `系统设置`
- open `恢复中心`
- open `Agent Hub`
- restart / stop the local service
- open the desktop config
- open the data directory
- open the server log

## Runtime configuration

You do not need to edit the desktop env file before first launch.

Recommended flow:

1. install and launch the tray app
2. bootstrap the first admin in `系统设置`
3. paste the Ollama Cloud key in the runtime section
4. run runtime verification
5. run a sample decision from `工作台`

If you prefer file-based configuration, use:

- `Edit Zhouheng Finance Mesh Desktop Config.cmd`

## Important notes

- The Windows package is currently distributed as a `.zip` with a one-click installer script, not an `.msi`.
- The tray launcher is designed for Windows PowerShell / Windows desktop environments.
- Users do not need to preinstall Node.js.
- This desktop package is for local single-instance use, not hosted production rollout.
- The packaged app uses the same Ollama Cloud-first defaults as the pilot build:
  - `OLLAMA_MODE=cloud`
  - `OLLAMA_MODEL=kimi-k2.5`
  - `FINANCE_MESH_CLOUD_API_FLAVOR=auto`
