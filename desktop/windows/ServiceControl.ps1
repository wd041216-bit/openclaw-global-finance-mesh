param(
  [ValidateSet("start", "stop", "status")]
  [string]$Command = "status"
)

$ErrorActionPreference = "Stop"

$AppName = "Zhouheng Finance Mesh"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppRoot = Join-Path $ScriptDir "app"
$NodeExe = Join-Path $ScriptDir "node-runtime\\node.exe"
$SupportRoot = Join-Path $env:LOCALAPPDATA $AppName
$DataRoot = Join-Path $SupportRoot "data"
$BackupRoot = Join-Path $SupportRoot "backups"
$LogDir = Join-Path $SupportRoot "logs"
$EnvFile = Join-Path $SupportRoot "desktop.env"
$StateFile = Join-Path $SupportRoot "runtime-state.json"
$PidFile = Join-Path $SupportRoot "server.pid"
$LaunchScript = Join-Path $SupportRoot "launch-service.cmd"
$LogFile = Join-Path $LogDir "server.log"
$DefaultPort = 3030

$script:FirstLaunch = $false
$script:Port = $DefaultPort
$script:BaseUrl = "http://127.0.0.1:$DefaultPort"
$script:CurrentPid = $null
$script:EnvMap = @{}

function Ensure-Directories {
  foreach ($path in @($SupportRoot, $DataRoot, $BackupRoot, $LogDir)) {
    if (-not (Test-Path $path)) {
      New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
  }
}

function Ensure-DefaultProfile {
  if (-not (Test-Path $EnvFile)) {
    $script:FirstLaunch = $true
    @(
      "# $AppName desktop profile"
      "FINANCE_MESH_PORT=$DefaultPort"
      "FINANCE_MESH_ENVIRONMENT=desktop"
      "FINANCE_MESH_TEAM_SCOPE=single-user"
      "FINANCE_MESH_LOG_FORMAT=pretty"
      "FINANCE_MESH_DATA_ROOT=$DataRoot"
      "FINANCE_MESH_BACKUP_LOCAL_DIR=$BackupRoot"
      "FINANCE_MESH_RESTORE_DRILL_RETENTION_DAYS=7"
      "FINANCE_MESH_RESTORE_DRILL_WARN_HOURS=168"
      "FINANCE_MESH_AUDIT_VERIFY_WARN_HOURS=24"
      "FINANCE_MESH_AUTH_ENABLED=true"
      "FINANCE_MESH_ALLOW_LOCAL_TOKENS=true"
      "FINANCE_MESH_COOKIE_SECURE=false"
      "FINANCE_MESH_BASE_URL=http://127.0.0.1:$DefaultPort"
      "OLLAMA_MODE=cloud"
      "OLLAMA_MODEL=kimi-k2.5"
      "OLLAMA_CLOUD_BASE_URL=https://ollama.com"
      "FINANCE_MESH_CLOUD_API_FLAVOR=auto"
      "OLLAMA_API_KEY="
    ) | Set-Content -Path $EnvFile -Encoding UTF8
  }
}

function Read-DesktopEnv {
  $map = @{}
  foreach ($line in Get-Content -Path $EnvFile -ErrorAction Stop) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
      continue
    }
    $parts = $line -split "=", 2
    if ($parts.Length -eq 2) {
      $map[$parts[0].Trim()] = $parts[1]
    }
  }
  return $map
}

function Load-ProfileState {
  Ensure-Directories
  Ensure-DefaultProfile
  $script:EnvMap = Read-DesktopEnv

  if (Test-Path $StateFile) {
    try {
      $state = Get-Content -Path $StateFile -Raw | ConvertFrom-Json
      if ($state.port) {
        $script:EnvMap["FINANCE_MESH_PORT"] = [string]$state.port
      }
      if ($state.baseUrl) {
        $script:EnvMap["FINANCE_MESH_BASE_URL"] = [string]$state.baseUrl
      }
    } catch {
    }
  }

  if (-not $script:EnvMap.ContainsKey("FINANCE_MESH_PORT")) {
    $script:EnvMap["FINANCE_MESH_PORT"] = [string]$DefaultPort
  }
  if (-not $script:EnvMap.ContainsKey("FINANCE_MESH_BASE_URL")) {
    $script:EnvMap["FINANCE_MESH_BASE_URL"] = "http://127.0.0.1:$($script:EnvMap['FINANCE_MESH_PORT'])"
  }

  $script:Port = [int]$script:EnvMap["FINANCE_MESH_PORT"]
  $script:BaseUrl = [string]$script:EnvMap["FINANCE_MESH_BASE_URL"]
}

function Write-State {
  @{
    port = $script:Port
    baseUrl = $script:BaseUrl
  } | ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8
}

function Remove-State {
  foreach ($target in @($StateFile, $PidFile, $LaunchScript)) {
    if (Test-Path $target) {
      Remove-Item -Path $target -Force -ErrorAction SilentlyContinue
    }
  }
}

function Test-PortFree([int]$PortNumber) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $PortNumber)
  try {
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    try { $listener.Stop() } catch {}
  }
}

function Find-FreePort([int]$StartPort) {
  for ($candidate = $StartPort; $candidate -le 3040; $candidate++) {
    if (Test-PortFree $candidate) {
      return $candidate
    }
  }
  return $null
}

function Wait-Health([string]$BaseUrl, [int]$Attempts = 20) {
  for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
    try {
      $response = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method GET -TimeoutSec 2
      if ($response.ok -eq $true) {
        return $true
      }
    } catch {
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Get-ServicePid {
  if (-not (Test-Path $PidFile)) {
    return $null
  }
  $raw = Get-Content -Path $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $raw) {
    return $null
  }
  return [int]$raw
}

function Test-ServiceRunning {
  $script:CurrentPid = Get-ServicePid
  if (-not $script:CurrentPid) {
    return $false
  }

  try {
    Get-Process -Id $script:CurrentPid -ErrorAction Stop | Out-Null
  } catch {
    return $false
  }

  return Wait-Health $script:BaseUrl 1
}

function Emit-Json([bool]$Ok, [bool]$Running, [string]$Message) {
  [PSCustomObject]@{
    action = $Command
    ok = $Ok
    running = $Running
    message = $Message
    firstLaunch = $script:FirstLaunch
    baseUrl = $script:BaseUrl
    port = $script:Port
    pid = $script:CurrentPid
    supportRoot = $SupportRoot
    dataRoot = $DataRoot
    logFile = $LogFile
    envFile = $EnvFile
  } | ConvertTo-Json -Compress
}

function Write-LaunchScript {
  $lines = @("@echo off", "setlocal")
  foreach ($entry in $script:EnvMap.GetEnumerator() | Sort-Object Name) {
    $value = [string]$entry.Value
    $value = $value.Replace("^", "^^").Replace("&", "^&").Replace("|", "^|").Replace("<", "^<").Replace(">", "^>")
    $lines += "set $($entry.Key)=$value"
  }
  $escapedLog = $LogFile.Replace('"', '""')
  $escapedNode = $NodeExe.Replace('"', '""')
  $escapedAppRoot = $AppRoot.Replace('"', '""')
  $lines += "cd /d ""$escapedAppRoot"""
  $lines += """$escapedNode"" src/server.ts >> ""$escapedLog"" 2>&1"
  $lines | Set-Content -Path $LaunchScript -Encoding ASCII
}

function Start-ServiceControl {
  Load-ProfileState
  if (-not (Test-Path $NodeExe)) {
    Emit-Json $false $false "没有找到内置 Node 运行时，请重新安装桌面包。"
    exit 1
  }

  if (Test-ServiceRunning) {
    Write-State
    Emit-Json $true $true "服务已经在运行。"
    return
  }

  if (-not (Test-PortFree $script:Port)) {
    $nextPort = Find-FreePort $script:Port
    if (-not $nextPort) {
      Emit-Json $false $false "本地 3030-3040 端口都已被占用，请先释放一个端口。"
      exit 1
    }
    $script:Port = [int]$nextPort
    $script:BaseUrl = "http://127.0.0.1:$nextPort"
    $script:EnvMap["FINANCE_MESH_PORT"] = [string]$nextPort
    $script:EnvMap["FINANCE_MESH_BASE_URL"] = $script:BaseUrl
  }

  Write-State
  Write-LaunchScript
  $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$LaunchScript`"" -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru
  $script:CurrentPid = $process.Id
  Set-Content -Path $PidFile -Value $process.Id -Encoding ASCII

  if (Wait-Health $script:BaseUrl 30) {
    Emit-Json $true $true "服务已启动。"
    return
  }

  try {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  } catch {
  }
  Remove-State
  $script:CurrentPid = $null
  Emit-Json $false $false "服务启动失败，请查看日志。"
  exit 1
}

function Stop-ServiceControl {
  Load-ProfileState
  $script:CurrentPid = Get-ServicePid
  if ($script:CurrentPid) {
    try {
      Stop-Process -Id $script:CurrentPid -Force -ErrorAction SilentlyContinue
    } catch {
    }
  }
  $script:CurrentPid = $null
  Remove-State
  Emit-Json $true $false "服务已停止。"
}

function Get-StatusControl {
  Load-ProfileState
  if (Test-ServiceRunning) {
    Write-State
    Emit-Json $true $true "服务运行中。"
    return
  }

  $script:CurrentPid = $null
  Emit-Json $true $false "服务未运行。"
}

switch ($Command) {
  "start" { Start-ServiceControl }
  "stop" { Stop-ServiceControl }
  "status" { Get-StatusControl }
}
