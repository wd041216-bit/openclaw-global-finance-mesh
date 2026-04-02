import AppKit
import Foundation

private struct ServiceResponse: Decodable {
  let action: String?
  let ok: Bool?
  let running: Bool?
  let message: String?
  let firstLaunch: Bool?
  let baseUrl: String?
  let port: Int?
  let pid: Int?
  let supportRoot: String?
  let dataRoot: String?
  let logFile: String?
  let envFile: String?
}

private enum MenuVisualState {
  case starting
  case running
  case warning
  case stopped
}

final class MenuBarApp: NSObject, NSApplicationDelegate {
  private let queue = DispatchQueue(label: "com.zhouheng.finance-mesh.menubar")
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

  private let summaryItem = NSMenuItem(title: "状态：启动中", action: nil, keyEquivalent: "")
  private let detailItem = NSMenuItem(title: "正在准备本地控制台…", action: nil, keyEquivalent: "")
  private lazy var openOnboardingItem = NSMenuItem(title: "打开首次向导", action: #selector(openOnboarding), keyEquivalent: "")
  private lazy var openWorkbenchItem = NSMenuItem(title: "打开工作台", action: #selector(openWorkbench), keyEquivalent: "")
  private lazy var openSystemItem = NSMenuItem(title: "打开系统设置", action: #selector(openSystem), keyEquivalent: "")
  private lazy var openRecoveryItem = NSMenuItem(title: "打开恢复中心", action: #selector(openRecovery), keyEquivalent: "")
  private lazy var openAgentsItem = NSMenuItem(title: "打开 Agent Hub", action: #selector(openAgents), keyEquivalent: "")
  private lazy var startOrRestartItem = NSMenuItem(title: "重启本地服务", action: #selector(startOrRestartService), keyEquivalent: "")
  private lazy var stopItem = NSMenuItem(title: "停止本地服务", action: #selector(stopServiceNow), keyEquivalent: "")
  private lazy var openDataItem = NSMenuItem(title: "打开数据目录", action: #selector(openDataFolder), keyEquivalent: "")
  private lazy var editConfigItem = NSMenuItem(title: "编辑桌面配置", action: #selector(editConfig), keyEquivalent: "")
  private lazy var openLogItem = NSMenuItem(title: "查看服务日志", action: #selector(openLog), keyEquivalent: "")
  private lazy var quitKeepingServiceItem = NSMenuItem(title: "退出菜单栏（保留服务）", action: #selector(quitKeepingService), keyEquivalent: "")
  private lazy var quitStoppingServiceItem = NSMenuItem(title: "停止服务并退出", action: #selector(quitStoppingService), keyEquivalent: "")

  private var currentBaseURL: URL?
  private var supportRootURL: URL?
  private var logFileURL: URL?
  private var envFileURL: URL?
  private var dataRootURL: URL?
  private var healthTimer: Timer?
  private var shouldStopServiceOnTerminate = false
  private let suppressAutoOpen = ProcessInfo.processInfo.environment["FINANCE_MESH_DESKTOP_NO_OPEN"] == "1"

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    configureMenu()
    applyVisualState(.starting, tooltip: "Zhouheng Finance Mesh 正在启动")
    bootstrap()
    healthTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
      self?.refreshStatus()
    }
  }

  func applicationWillTerminate(_ notification: Notification) {
    healthTimer?.invalidate()
    if shouldStopServiceOnTerminate {
      _ = runServiceCommand(["stop"])
    }
  }

  private func configureMenu() {
    let menu = NSMenu()

    summaryItem.isEnabled = false
    detailItem.isEnabled = false
    menu.addItem(summaryItem)
    menu.addItem(detailItem)
    menu.addItem(.separator())

    for item in [
      openOnboardingItem,
      openWorkbenchItem,
      openSystemItem,
      openRecoveryItem,
      openAgentsItem,
      startOrRestartItem,
      stopItem,
      openDataItem,
      editConfigItem,
      openLogItem,
    ] {
      item.target = self
    }

    menu.addItem(openOnboardingItem)
    menu.addItem(openWorkbenchItem)
    menu.addItem(openSystemItem)
    menu.addItem(openRecoveryItem)
    menu.addItem(openAgentsItem)
    menu.addItem(.separator())
    menu.addItem(startOrRestartItem)
    menu.addItem(stopItem)
    menu.addItem(.separator())
    menu.addItem(openDataItem)
    menu.addItem(editConfigItem)
    menu.addItem(openLogItem)
    menu.addItem(.separator())
    menu.addItem(quitKeepingServiceItem)
    menu.addItem(quitStoppingServiceItem)

    quitKeepingServiceItem.target = self
    quitStoppingServiceItem.target = self

    statusItem.menu = menu
  }

  private func bootstrap() {
    startService(openPreferredPage: true, preferredPage: nil)
  }

  private func refreshStatus() {
    queue.async {
      let response = self.runServiceCommand(["status"])
      DispatchQueue.main.async {
        self.apply(response: response, openPage: nil)
      }
    }
  }

  private func startService(openPreferredPage: Bool, preferredPage: String?) {
    applyVisualState(.starting, tooltip: "Zhouheng Finance Mesh 启动中")
    queue.async {
      let response = self.runServiceCommand(["start"])
      DispatchQueue.main.async {
        self.apply(response: response, openPage: preferredPage)
        guard openPreferredPage, let response, response.ok == true, response.running == true else {
          if response?.ok == false {
            self.showAlert(title: "桌面版启动失败", message: response?.message ?? "请查看服务日志。")
          }
          return
        }

        if self.suppressAutoOpen {
          return
        }

        if response.firstLaunch == true {
          self.openPage("getting-started.html?mode=admin&entry=desktop")
        } else if let page = preferredPage {
          self.openPage(page)
        } else {
          self.openPage("workbench.html")
        }
      }
    }
  }

  private func apply(response: ServiceResponse?, openPage pageToOpen: String?) {
    if let base = response?.baseUrl, let url = URL(string: base) {
      currentBaseURL = url
    }
    if let supportRoot = response?.supportRoot {
      supportRootURL = URL(fileURLWithPath: supportRoot)
    }
    if let logFile = response?.logFile {
      logFileURL = URL(fileURLWithPath: logFile)
    }
    if let envFile = response?.envFile {
      envFileURL = URL(fileURLWithPath: envFile)
    }
    if let dataRoot = response?.dataRoot {
      dataRootURL = URL(fileURLWithPath: dataRoot)
    }

    let isRunning = response?.running == true
    let statusLabel: String
    let detailLabel: String

    if isRunning {
      statusLabel = "状态：运行中"
      if let baseUrl = response?.baseUrl {
        detailLabel = "控制台地址：\(baseUrl)"
      } else {
        detailLabel = "本地服务已启动"
      }
      applyVisualState(.running, tooltip: response?.message ?? "本地服务运行中")
    } else if response?.ok == false {
      statusLabel = "状态：需要处理"
      detailLabel = response?.message ?? "请查看日志与系统设置"
      applyVisualState(.warning, tooltip: detailLabel)
    } else {
      statusLabel = "状态：未运行"
      detailLabel = response?.message ?? "点击“启动本地服务”继续"
      applyVisualState(.stopped, tooltip: detailLabel)
    }

    summaryItem.title = statusLabel
    detailItem.title = detailLabel

    openWorkbenchItem.isEnabled = isRunning
    openOnboardingItem.isEnabled = true
    openRecoveryItem.isEnabled = isRunning
    openSystemItem.isEnabled = true
    openAgentsItem.isEnabled = isRunning
    stopItem.isEnabled = isRunning
    startOrRestartItem.title = isRunning ? "重启本地服务" : "启动本地服务"
    startOrRestartItem.isEnabled = true
    openDataItem.isEnabled = supportRootURL != nil || dataRootURL != nil
    editConfigItem.isEnabled = envFileURL != nil || supportRootURL != nil
    openLogItem.isEnabled = logFileURL != nil

    if let page = pageToOpen {
      openPage(page)
    }
  }

  private func applyVisualState(_ state: MenuVisualState, tooltip: String) {
    guard let button = statusItem.button else {
      return
    }
    button.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
    button.title = switch state {
    case .starting: "ZH…"
    case .running: "ZH"
    case .warning: "ZH!"
    case .stopped: "ZH·"
    }
    button.toolTip = tooltip
  }

  private func runServiceCommand(_ arguments: [String]) -> ServiceResponse? {
    guard let resourceURL = Bundle.main.resourceURL else {
      return nil
    }

    let scriptURL = resourceURL.appendingPathComponent("service-control.sh")
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = [scriptURL.path] + arguments

    let stdoutPipe = Pipe()
    let stderrPipe = Pipe()
    process.standardOutput = stdoutPipe
    process.standardError = stderrPipe

    do {
      try process.run()
      process.waitUntilExit()
    } catch {
      DispatchQueue.main.async {
        self.showAlert(title: "桌面控制器启动失败", message: error.localizedDescription)
      }
      return nil
    }

    let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
    let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
    let decoder = JSONDecoder()

    if let response = try? decoder.decode(ServiceResponse.self, from: stdoutData) {
      return response
    }

    if process.terminationStatus != 0 {
      let errorText = String(data: stderrData, encoding: .utf8) ?? "未知错误"
      DispatchQueue.main.async {
        self.showAlert(title: "桌面控制器执行失败", message: errorText)
      }
    }

    return nil
  }

  private func openPage(_ page: String) {
    guard let baseURL = currentBaseURL else {
      showAlert(title: "还没有可用地址", message: "请先启动本地服务。")
      return
    }

    guard let url = URL(string: page, relativeTo: baseURL)?.absoluteURL else {
      showAlert(title: "页面地址不可用", message: "请检查本地服务地址是否正常。")
      return
    }
    NSWorkspace.shared.open(url)
  }

  private func openFileURL(_ url: URL?) {
    guard let url else {
      showAlert(title: "路径还没有准备好", message: "请先启动一次桌面版服务。")
      return
    }
    NSWorkspace.shared.open(url)
  }

  private func showAlert(title: String, message: String) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = title
    alert.informativeText = message
    alert.addButton(withTitle: "知道了")
    alert.runModal()
  }

  @objc private func openOnboarding() {
    if currentBaseURL == nil {
      startService(openPreferredPage: true, preferredPage: "getting-started.html?mode=admin&entry=desktop")
      return
    }
    openPage("getting-started.html?mode=admin&entry=desktop")
  }

  @objc private func openWorkbench() {
    openPage("workbench.html")
  }

  @objc private func openSystem() {
    if currentBaseURL == nil {
      startService(openPreferredPage: true, preferredPage: "system.html")
      return
    }
    openPage("system.html")
  }

  @objc private func openRecovery() {
    openPage("recovery.html")
  }

  @objc private func openAgents() {
    openPage("agents.html")
  }

  @objc private func startOrRestartService() {
    queue.async {
      _ = self.runServiceCommand(["stop"])
      DispatchQueue.main.async {
        self.startService(openPreferredPage: false, preferredPage: nil)
      }
    }
  }

  @objc private func stopServiceNow() {
    queue.async {
      let response = self.runServiceCommand(["stop"])
      DispatchQueue.main.async {
        self.apply(response: response, openPage: nil)
      }
    }
  }

  @objc private func openDataFolder() {
    openFileURL(dataRootURL ?? supportRootURL)
  }

  @objc private func editConfig() {
    openFileURL(envFileURL)
  }

  @objc private func openLog() {
    openFileURL(logFileURL)
  }

  @objc private func quitKeepingService() {
    shouldStopServiceOnTerminate = false
    NSApp.terminate(nil)
  }

  @objc private func quitStoppingService() {
    shouldStopServiceOnTerminate = true
    NSApp.terminate(nil)
  }
}

let app = NSApplication.shared
let delegate = MenuBarApp()
app.delegate = delegate
app.run()
