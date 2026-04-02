Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$AppName = "Zhouheng Finance Mesh"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceControl = Join-Path $ScriptDir "ServiceControl.ps1"

function Invoke-ServiceCommand([string]$Command) {
  $raw = & powershell -NoProfile -ExecutionPolicy Bypass -File $ServiceControl -Command $Command
  if (-not $raw) {
    return $null
  }
  return $raw | ConvertFrom-Json
}

function Open-Page([string]$Path) {
  if (-not $script:CurrentState -or -not $script:CurrentState.running -or -not $script:CurrentState.baseUrl) {
    Start-ServiceAndMaybeOpen $Path
    return
  }
  Start-Process "$($script:CurrentState.baseUrl.TrimEnd('/'))/$Path" | Out-Null
}

function Start-ServiceAndMaybeOpen([string]$Path) {
  Update-NotifyState "正在启动本地服务…" "ZH…"
  $result = Invoke-ServiceCommand "start"
  if (-not $result) {
    [System.Windows.Forms.MessageBox]::Show("启动失败，请查看本地日志。", $AppName) | Out-Null
    return
  }
  $script:CurrentState = $result
  Refresh-MenuState
  if ($result.ok -and $result.running) {
    if ($result.firstLaunch) {
      Start-Process "$($result.baseUrl.TrimEnd('/'))/getting-started.html?mode=admin&entry=desktop" | Out-Null
    } elseif ($Path) {
      Start-Process "$($result.baseUrl.TrimEnd('/'))/$Path" | Out-Null
    } else {
      Start-Process "$($result.baseUrl.TrimEnd('/'))/workbench.html" | Out-Null
    }
  } else {
    $errorMessage = if ($result.message) { $result.message } else { "启动失败，请查看日志。" }
    [System.Windows.Forms.MessageBox]::Show($errorMessage, $AppName) | Out-Null
  }
}

function Refresh-MenuState {
  $state = Invoke-ServiceCommand "status"
  if ($state) {
    $script:CurrentState = $state
  }

  if ($script:CurrentState -and $script:CurrentState.running) {
    Update-NotifyState "运行中：$($script:CurrentState.baseUrl)" "ZH"
    $statusItem.Text = "状态：运行中"
    $detailItem.Text = "控制台地址：$($script:CurrentState.baseUrl)"
    $startItem.Text = "重启本地服务"
    $stopItem.Enabled = $true
    $openOnboardingItem.Enabled = $true
    $openWorkbenchItem.Enabled = $true
    $openSystemItem.Enabled = $true
    $openRecoveryItem.Enabled = $true
    $openAgentsItem.Enabled = $true
    $openLogItem.Enabled = [bool]$script:CurrentState.logFile
    $openConfigItem.Enabled = [bool]$script:CurrentState.envFile
    $openDataItem.Enabled = [bool]$script:CurrentState.dataRoot
  } elseif ($script:CurrentState -and -not $script:CurrentState.ok) {
    $warningMessage = if ($script:CurrentState.message) { $script:CurrentState.message } else { "需要处理" }
    Update-NotifyState $warningMessage "ZH!"
    $statusItem.Text = "状态：需要处理"
    $detailItem.Text = if ($script:CurrentState.message) { $script:CurrentState.message } else { "请检查配置与日志" }
    $startItem.Text = "重新尝试启动"
    $stopItem.Enabled = $false
    $openOnboardingItem.Enabled = $true
    $openWorkbenchItem.Enabled = $false
    $openSystemItem.Enabled = $true
    $openRecoveryItem.Enabled = $false
    $openAgentsItem.Enabled = $false
    $openLogItem.Enabled = [bool]$script:CurrentState.logFile
    $openConfigItem.Enabled = [bool]$script:CurrentState.envFile
    $openDataItem.Enabled = [bool]$script:CurrentState.dataRoot
  } else {
    Update-NotifyState "未运行" "ZH·"
    $statusItem.Text = "状态：未运行"
    $detailItem.Text = "点击“启动本地服务”继续"
    $startItem.Text = "启动本地服务"
    $stopItem.Enabled = $false
    $openOnboardingItem.Enabled = $true
    $openWorkbenchItem.Enabled = $false
    $openSystemItem.Enabled = $true
    $openRecoveryItem.Enabled = $false
    $openAgentsItem.Enabled = $false
    $openLogItem.Enabled = [bool]$script:CurrentState.logFile
    $openConfigItem.Enabled = [bool]$script:CurrentState.envFile
    $openDataItem.Enabled = [bool]$script:CurrentState.dataRoot
  }
}

function Update-NotifyState([string]$Text, [string]$Prefix) {
  $script:NotifyIcon.Text = ($AppName + " - " + $Text).Substring(0, [Math]::Min(63, ($AppName + " - " + $Text).Length))
  $script:NotifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}

$script:CurrentState = $null

[System.Windows.Forms.Application]::EnableVisualStyles()
$script:NotifyIcon = New-Object System.Windows.Forms.NotifyIcon
$script:NotifyIcon.Visible = $true
$script:NotifyIcon.Icon = [System.Drawing.SystemIcons]::Application
$script:NotifyIcon.Text = $AppName

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$statusItem = New-Object System.Windows.Forms.ToolStripMenuItem "状态：启动中"
$statusItem.Enabled = $false
$detailItem = New-Object System.Windows.Forms.ToolStripMenuItem "正在准备本地控制台…"
$detailItem.Enabled = $false
$openOnboardingItem = New-Object System.Windows.Forms.ToolStripMenuItem "打开首次向导"
$openWorkbenchItem = New-Object System.Windows.Forms.ToolStripMenuItem "打开工作台"
$openSystemItem = New-Object System.Windows.Forms.ToolStripMenuItem "打开系统设置"
$openRecoveryItem = New-Object System.Windows.Forms.ToolStripMenuItem "打开恢复中心"
$openAgentsItem = New-Object System.Windows.Forms.ToolStripMenuItem "打开 Agent Hub"
$startItem = New-Object System.Windows.Forms.ToolStripMenuItem "重启本地服务"
$stopItem = New-Object System.Windows.Forms.ToolStripMenuItem "停止本地服务"
$openDataItem = New-Object System.Windows.Forms.ToolStripMenuItem "打开数据目录"
$openConfigItem = New-Object System.Windows.Forms.ToolStripMenuItem "编辑桌面配置"
$openLogItem = New-Object System.Windows.Forms.ToolStripMenuItem "查看服务日志"
$quitKeepItem = New-Object System.Windows.Forms.ToolStripMenuItem "退出托盘（保留服务）"
$quitStopItem = New-Object System.Windows.Forms.ToolStripMenuItem "停止服务并退出"

$openOnboardingItem.Add_Click({ Open-Page "getting-started.html?mode=admin&entry=desktop" })
$openWorkbenchItem.Add_Click({ Open-Page "workbench.html" })
$openSystemItem.Add_Click({ Open-Page "system.html" })
$openRecoveryItem.Add_Click({ Open-Page "recovery.html" })
$openAgentsItem.Add_Click({ Open-Page "agents.html" })
$startItem.Add_Click({
  $null = Invoke-ServiceCommand "stop"
  Start-ServiceAndMaybeOpen ""
})
$stopItem.Add_Click({
  $script:CurrentState = Invoke-ServiceCommand "stop"
  Refresh-MenuState
})
$openDataItem.Add_Click({
  if ($script:CurrentState -and $script:CurrentState.dataRoot) {
    Start-Process $script:CurrentState.dataRoot | Out-Null
  }
})
$openConfigItem.Add_Click({
  if ($script:CurrentState -and $script:CurrentState.envFile) {
    Start-Process "notepad.exe" $script:CurrentState.envFile | Out-Null
  }
})
$openLogItem.Add_Click({
  if ($script:CurrentState -and $script:CurrentState.logFile) {
    Start-Process "notepad.exe" $script:CurrentState.logFile | Out-Null
  }
})
$quitKeepItem.Add_Click({
  $script:NotifyIcon.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})
$quitStopItem.Add_Click({
  $null = Invoke-ServiceCommand "stop"
  $script:NotifyIcon.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$menu.Items.Add($statusItem) | Out-Null
$menu.Items.Add($detailItem) | Out-Null
$menu.Items.Add("-") | Out-Null
$menu.Items.Add($openOnboardingItem) | Out-Null
$menu.Items.Add($openWorkbenchItem) | Out-Null
$menu.Items.Add($openSystemItem) | Out-Null
$menu.Items.Add($openRecoveryItem) | Out-Null
$menu.Items.Add($openAgentsItem) | Out-Null
$menu.Items.Add("-") | Out-Null
$menu.Items.Add($startItem) | Out-Null
$menu.Items.Add($stopItem) | Out-Null
$menu.Items.Add("-") | Out-Null
$menu.Items.Add($openDataItem) | Out-Null
$menu.Items.Add($openConfigItem) | Out-Null
$menu.Items.Add($openLogItem) | Out-Null
$menu.Items.Add("-") | Out-Null
$menu.Items.Add($quitKeepItem) | Out-Null
$menu.Items.Add($quitStopItem) | Out-Null

$script:NotifyIcon.ContextMenuStrip = $menu
$script:NotifyIcon.Add_DoubleClick({ Open-Page "workbench.html" })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({ Refresh-MenuState })
$timer.Start()

Start-ServiceAndMaybeOpen ""
Refresh-MenuState
[System.Windows.Forms.Application]::Run()
$timer.Stop()
$script:NotifyIcon.Visible = $false
