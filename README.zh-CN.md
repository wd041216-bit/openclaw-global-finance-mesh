# Zhouheng Global Finance Mesh

[![CI](https://github.com/wd041216-bit/zhouheng-global-finance-mesh/actions/workflows/ci.yml/badge.svg)](https://github.com/wd041216-bit/zhouheng-global-finance-mesh/actions/workflows/ci.yml)
[![Release](https://github.com/wd041216-bit/zhouheng-global-finance-mesh/actions/workflows/release.yml/badge.svg)](https://github.com/wd041216-bit/zhouheng-global-finance-mesh/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@wd041216-bit/zhouheng-global-finance-mesh)](https://www.npmjs.com/package/@wd041216-bit/zhouheng-global-finance-mesh)
[![GHCR](https://img.shields.io/badge/GHCR-zhouheng--global--finance--mesh-blue)](https://github.com/wd041216-bit/zhouheng-global-finance-mesh/pkgs/container/zhouheng-global-finance-mesh)

这是一个独立的财务控制平面产品仓库，不再把自己包装成 OpenClaw 的附属 skill。  
它面向“开发者可快速上手 + 企业试点可可信落地”双轨目标。

- 10 秒理解价值：决策、回放、法规依据、审计治理一体化
- 3 分钟完成安装：桌面包一键安装 + 首次向导
- 10 分钟接入宿主：OpenClaw / Claude / Manus / Cursor / Cline / Cherry Studio

英文主文档: [README](./README.md)

## 控制台截图

<p align="center">
  <img src="./docs/assets/workbench-apple-ui.png" alt="工作台：推荐动作与最近摘要" width="15%" />
  <img src="./docs/assets/decisions-apple-ui.png" alt="决策中心：三段式任务流" width="15%" />
  <img src="./docs/assets/governance-apple-ui.png" alt="治理中心：摘要优先的完整性与导出状态" width="15%" />
  <img src="./docs/assets/system-apple-ui.png" alt="系统设置：身份与运行时摘要" width="15%" />
  <img src="./docs/assets/recovery-apple-ui.png" alt="恢复中心：备份与恢复就绪度" width="15%" />
  <img src="./docs/assets/agents-apple-ui.png" alt="Agent Hub：OpenClaw + Claude/Manus/Cursor/Cline/Cherry Studio 接入卡片" width="15%" />
</p>

## Why

- 业务决策与规则回放用同一条可解释链路承载，降低规则变更风险。
- 法规依据库与治理动作拆层，业务可读、审核可追责。
- 审计账本、备份复制、恢复演练形成可信运维闭环。
- 桌面首启向导 + 多页面 IA，非技术人员也能上手。

## Try

```bash
npm install
npm test
npm run dev
```

访问 `http://127.0.0.1:3030`，按引导完成首次链路。

云端默认建议：

```bash
export OLLAMA_MODE=cloud
export OLLAMA_MODEL=kimi-k2.5
export FINANCE_MESH_CLOUD_API_FLAVOR=auto
export OLLAMA_API_KEY=你的 key
```

## Install

- macOS 产物：`.pkg`、`.dmg`、`.zip`
- Windows 产物：`.exe`（NSIS）+ `.zip` fallback
- 桌面首次启动统一打开：
  - `getting-started.html?mode=admin&entry=desktop`

构建命令：

```bash
npm run build:macos-installer
npm run build:windows-package
```

## Connect Agents

- OpenClaw：原生 plugin 适配（`integrations/openclaw/`）
- Claude / Manus / Cursor / Cline / Cherry Studio：共享 MCP 入口（`integrations/mcp/server.ts`）

验证命令：

```bash
npm run mcp:serve
npm run smoke:mcp
npm run smoke:openclaw
npm run doctor:hosts
```

## Pilot

- 外部试点基线：单实例自托管
- 放行门禁：`verificationStatus=fully_usable` 且 `goLiveReady=true`
- 运维门禁：备份目标已配置 + 恢复演练已完成

关键文档：

- [docs/cloud-runtime-operations.md](./docs/cloud-runtime-operations.md)
- [docs/external-pilot-runbook.md](./docs/external-pilot-runbook.md)
- [docs/v0.4.0-launch-checklist.md](./docs/v0.4.0-launch-checklist.md)

## Download

本轮 release 统一附带并校验：

- `zhouheng-finance-mesh-0.4.0-macos.pkg`
- `zhouheng-finance-mesh-0.4.0-macos.dmg`
- `zhouheng-finance-mesh-0.4.0-macos.zip`
- `zhouheng-finance-mesh-0.4.0-windows.exe`
- `zhouheng-finance-mesh-0.4.0-windows.zip`
- `SHA256SUMS`

下载入口: [GitHub Releases](https://github.com/wd041216-bit/zhouheng-global-finance-mesh/releases)
网页入口: [wd041216-bit.github.io/zhouheng-global-finance-mesh](https://wd041216-bit.github.io/zhouheng-global-finance-mesh/)

## 当前定位

它不是“财务问答机器人”，也不是“某个宿主的附属插件壳”，而是一个规则网格驱动的财务决策中枢骨架。

- 输入是经济事件与上下文
- 中间层是 Pack 规则和优先级
- 输出是可审计的 Decision Packet 与可回放的变更结果

## 快速开始

```bash
npm install
npm test
npm run dev
```

然后访问 `http://127.0.0.1:3030`。

默认入口现在是 `首页`，随后进入 `业务工作台`。先给业务可读结论和推荐动作，原始 JSON 与底层技术字段都收进了高级详情。

如果走云端模型，可以本地设置：

```bash
export OLLAMA_MODE=cloud
export OLLAMA_API_KEY=你的本地环境变量
export OLLAMA_MODEL=kimi-k2.5
export FINANCE_MESH_CLOUD_API_FLAVOR=auto
npm run dev
```

默认不会持久化 API key，除非你在 UI 里主动勾选保存到本地忽略文件。

当前云端模式支持三种协议策略：

- `auto`：同时探测 Ollama Native 与 OpenAI Compatible 两套目录/推理接口，再优先复用探测成功的那条链路
- `ollama_native`：固定走 `/api/tags` 和 `/api/chat`
- `openai_compatible`：固定走 `/v1/models` 和 `/v1/chat/completions`

当前外部试点的正式默认路径已经收敛为 `Ollama Cloud + kimi-k2.5`。OpenAI-compatible gateway 仍然支持，但不再阻塞这轮试点放行。

最小云端验证命令：

```bash
curl -s http://127.0.0.1:3030/api/runtime/config
curl -s -X POST http://127.0.0.1:3030/api/runtime/probe
npm run smoke:cloud
npm run doctor:cloud
npm run verify:cloud-provider -- --out output/cloud-verification.json
```

结果判断原则：

- `listModelsOk=true` 且 `inferenceOk=true`：云端推理可用
- `listModelsOk=true` 且 `inferenceOk=false`：当前账号只能读模型目录，还没有推理权限
- `errorKind=unauthorized`：优先检查 key / 账号权限
- `errorKind=endpoint_not_supported`：优先切换 `FINANCE_MESH_CLOUD_API_FLAVOR` 或确认服务端兼容面

当前试点的目标结果是：

- provider：`Ollama Cloud`
- model：`kimi-k2.5`
- `verificationStatus=fully_usable`
- `goLiveReady=true`
- `validatedFlavor=ollama_native`

要特别注意：能读模型目录，不代表能做云端推理。

系统设置页现在还会生成一份云端联调报告，里面会直接给出：

- provider 判断与可信度
- 推荐协议与已验证协议
- 当前模型是否真实可见，以及替代模型建议
- 可直接复制的目录 / 推理 `curl` 命令
- 当目录可读但推理被挡住时，可直接发给 provider 的升级说明
- 标准化验证结论：`fully_usable`、`catalog_only_entitlement_blocked`、`cloud_unauthorized`、`protocol_mismatch`、`model_visibility_gap`、`network_or_tls_failure`
- 正式试点放行字段：`verifiedModel`、`validatedFlavor`、`goLiveReady`、`goLiveBlockers`、`requiresProviderAction`

完整排障路径见 [docs/cloud-runtime-operations.md](./docs/cloud-runtime-operations.md)。
外部试点落地顺序见 [docs/external-pilot-runbook.md](./docs/external-pilot-runbook.md)。

## macOS 一键安装包

如果你想像普通本地软件一样直接安装试用，而不是手动 `npm run dev`，仓库现在已经带了 macOS 桌面打包脚本。

构建命令：

```bash
npm run build:macos-installer
```

会生成：

- `dist/macos/zhouheng-finance-mesh-<version>-macos.pkg`
- `dist/macos/zhouheng-finance-mesh-<version>-macos.dmg`
- `dist/macos/zhouheng-finance-mesh-<version>-macos.zip`
- 一个包含 `Zhouheng Finance Mesh.app` 和辅助脚本的发布目录

推荐安装方式：

- 直接双击 `zhouheng-finance-mesh-<version>-macos.pkg`
- 安装到 `/Applications`
- 启动 `Zhouheng Finance Mesh.app`

桌面版现在会以菜单栏 app 的形式运行，把用户数据放到 `~/Library/Application Support/Zhouheng Finance Mesh`，首次启动自动打开 `getting-started.html?mode=admin&entry=desktop`，并默认使用：

- `OLLAMA_MODE=cloud`
- `OLLAMA_MODEL=kimi-k2.5`
- `FINANCE_MESH_CLOUD_API_FLAVOR=auto`

安装包现在会直接内置官方 Node.js 22.22.2 macOS runtime，所以用户不需要预先安装 Node。
如果要分发给别人，优先使用生成出来的 `.pkg`、`.dmg` 或 `.zip`；如果你在 iCloud 同步目录里本地构建，`dist/` 里的裸 `.app` 可能会被系统额外打上 Finder 元数据。

详细说明见 [docs/macos-desktop-package.md](./docs/macos-desktop-package.md)。

## Windows 桌面安装包

仓库现在也带了 Windows 桌面打包脚本。

构建命令：

```bash
npm run build:windows-package
```

会生成：

- `dist/windows/zhouheng-finance-mesh-<version>-windows.exe`
- `dist/windows/zhouheng-finance-mesh-<version>-windows.zip`
- 一个包含安装 / 启动 / 停止脚本的发布目录

Windows 版本会直接内置官方 Node.js 22.22.2 runtime，安装到 `%LOCALAPPDATA%\Programs\Zhouheng Finance Mesh`，把用户数据放到 `%LOCALAPPDATA%\Zhouheng Finance Mesh`，并通过托盘入口提供首次向导 / 启动 / 停止 / 打开控制台等动作。

推荐安装顺序：

- 优先用 `.exe`（NSIS 一键安装）
- `.zip` 作为策略受限场景的 fallback

详细说明见 [docs/windows-desktop-package.md](./docs/windows-desktop-package.md)。

## 身份与访问控制

当前版本已经具备企业 beta 的身份与会话基线。

- 可以在 Access Control 面板里 bootstrap 第一个 admin
- 也可以通过 `FINANCE_MESH_BOOTSTRAP_ADMIN_*` 环境变量预置第一个管理员
- 本地 token 不再作为浏览器长期凭据，而是用来 mint 服务端 session
- 打开 OIDC 后，可以通过 subject / verified email binding 把企业身份映射到平台角色
- 所有 cookie session 的写请求都要带 `x-finance-mesh-csrf`
- admin 可以直接查看和撤销活动 session，reviewer/admin 可以继续查看审计完整性

最小 OIDC 配置示例：

```bash
export FINANCE_MESH_AUTH_ENABLED=true
export FINANCE_MESH_BASE_URL=https://finance-mesh.example.com
export FINANCE_MESH_OIDC_ISSUER=https://id.example.com
export FINANCE_MESH_OIDC_CLIENT_ID=finance-mesh-console
export FINANCE_MESH_OIDC_CLIENT_SECRET=replace_me
export FINANCE_MESH_OIDC_SCOPES="openid profile email"
export FINANCE_MESH_ALLOW_LOCAL_TOKENS=true
npm run dev
```

完整流程见 [docs/identity-operations.md](./docs/identity-operations.md)。

## 多页面控制台

控制台已经不再是单页切 tab 的后台壳。

- `index.html`：品牌首页
- `workbench.html`：业务首页，直接使用 `/api/dashboard/overview` 的推荐动作
- `decisions.html`：三段式决策执行页
- `replays.html`：三段式回放分析页
- `library.html`：搜索优先的依据库阅读页
- `governance.html`：治理中心
- `recovery.html`：恢复中心
- `system.html`：系统设置
- `agents.html`：Agent Hub

这样做的目标很直接：让非技术人员先看懂页面边界，再决定要不要进入高级详情。

## 外部试点使用顺序

建议按下面顺序把产品交给外部试点用户：

1. 先把 `.env.pilot.example` 复制成 `.env`
2. 填入真实可用的 `OLLAMA_API_KEY`
3. 启动 Docker 单实例
4. 在 `系统设置` 完成管理员初始化和登录
5. 先用 `npm run verify:cloud-provider` 验证 `kimi-k2.5`
6. 再跑 `npm run review:pilot`，确认 runtime gate 已通过
7. 确认备份和恢复演练已经通过，再开放给外部用户

当前复查结论见 [docs/pilot-functional-review-2026-03-31.md](./docs/pilot-functional-review-2026-03-31.md)。

## 多 Agent 兼容层

这轮开始，仓库不再只有 OpenClaw 一条兼容路径。

- `integrations/openclaw/`：原生 OpenClaw 插件适配
- `integrations/mcp/server.ts`：共享 MCP server 入口
- `integrations/claude/`：Claude 本地接入说明与示例配置
- `integrations/manus/`：Manus 本地接入说明与示例配置
- `integrations/cursor/`：Cursor 本地接入说明与示例配置
- `integrations/cline/`：Cline 本地接入说明与示例配置
- `integrations/cherry-studio/`：Cherry Studio 本地接入说明与示例配置
- `npm run mcp:serve`：直接启动共享 MCP connector
- `npm run smoke:mcp`：本地验证五个工具可见，并真实调用决策与法规搜索
- `npm run smoke:openclaw`：在 fixture host 里加载 OpenClaw 原生插件并验证三类工具与 prompt guidance
- `npm run doctor:hosts`：统一检查六家宿主配置模板、接入文档、共享 MCP smoke 和 OpenClaw fixture smoke

当前统一暴露的工具面包括：

- Pack 校验
- 决策运行
- 回放运行
- 法律资料检索
- 审计完整性读取

这五个共享 MCP 工具现在都固定返回：

- 一段宿主可直接展示的人类摘要
- 稳定的 `structuredContent`
- 明确的 `outputSchema`

这样 Claude / Manus / Cursor / Cline / Cherry Studio 共用同一套本地契约，OpenClaw 则继续走原生插件面，但静态清单和 smoke 也会被同一套契约持续校验。

## 审计历史

本轮开始，审计真相源已经切到 `data/audit/ledger.sqlite`。

- decision、replay、runtime probe、integrity verify、export batch 和 operator activity 全都进入同一条 hash chain
- 控制台里可以直接看到最近运行历史、完整明细和独立的 integrity 面板
- 旧的 `data/audit/runs.json` 与 `data/audit/activity.json` 如果存在，会在首次启动时一次性迁移到 SQLite，然后保留为历史备份
- 这已经是 tamper-evident 的审计底座，并且支持把快照复制到目录或 S3-compatible 目标，但还不是不可变归档级企业存储

## Operator Activity

治理动作现在也进入同一条 SQLite 审计链。

- bootstrap admin、访问控制开关、operator 发放、runtime 配置变更、法规状态流转、probe、decision、replay 都会写入 Operator Activity 时间线
- integrity verify 和 export batch 作为账本原生事件展示在 Audit Integrity 面板和导出详情里
- 控制台提供独立的 Operator Activity 面板，方便 admin 直接复盘后台治理动作
- 开启 auth 后会附带操作者身份；本地开发模式下即使 auth 关闭也会继续落盘

## Integrity 与导出

- reviewer 可以查看 `GET /api/audit/integrity` 和导出结果
- admin 可以触发 `POST /api/audit/integrity/verify` 以及 `POST /api/audit/exports`
- 导出物会落到 `data/audit/exports/`，包含 NDJSON 数据文件和 JSON manifest
- 运维恢复时可以恢复 `ledger.sqlite`，重新执行 integrity verify，再核对 export manifest hash

## 备份与观测

- `GET /api/operations/health`：面向运维和系统页的详细健康状态
- `GET /api/metrics`：Prometheus 文本指标
- `POST /api/operations/backups/run`：手动生成快照并复制到已配置目标
- `GET /api/operations/restores`、`POST /api/operations/restores/run`、`GET /api/operations/restores/:id`：在隔离目录里执行恢复演练并返回摘要结果
- `FINANCE_MESH_BACKUP_LOCAL_DIR`：挂载目录复制
- `FINANCE_MESH_BACKUP_S3_*`：S3-compatible 对象存储复制
- `FINANCE_MESH_RESTORE_DRILL_RETENTION_DAYS`：控制 `data/restore-drills/` 下恢复演练目录的保留天数
- `FINANCE_MESH_RESTORE_DRILL_WARN_HOURS`：控制恢复就绪度在概览页和健康检查中多久后判定为过期
- `FINANCE_MESH_LOG_FORMAT=json`：容器化环境推荐的结构化日志模式

恢复演练不会覆盖运行中的 `data/`。系统会先把备份副本展开到 `data/restore-drills/<timestamp>-<drillId>/restored/`，然后校验 `manifest.json`、恢复后的账本完整性，以及身份状态文件是否可读，再给出就绪度结论。

## 部署基线

- `Dockerfile` + `docker-compose.yml`：单实例容器运行基线
- `deploy/kubernetes/`：ConfigMap、Secret 示例、Deployment、Service、PVC、Ingress 示例
- 当前明确按“单副本 + 持久卷”的 beta 自托管方式设计，不宣称高可用

## CI 与发布基线

- `.github/workflows/ci.yml` 会在 PR 和 `main` 上执行 `npm ci`、`npm test`、`npm run verify:server`、`npm run verify:manifests`、`docker build`、`npm run smoke:restore`、`npm run smoke:ui`
- `.github/workflows/release.yml` 只会在 `workflow_dispatch` 或 `v0.4.0` 这种 semver tag 上触发发布
- `npm run release:check -- --tag v0.4.0` 会强校验 git tag、`package.json` 版本和 `CHANGELOG.md` 标题一致
- CI 会在 `npm run verify:manifests` 前临时拉起一个 kind 集群，因为 `kubectl` 的 dry-run 仍然需要 API discovery 来识别内置资源
- 发布产物固定是 `ghcr.io/wd041216-bit/zhouheng-global-finance-mesh` 容器镜像和 npm 公共包

## 法律资料治理

法律资料库现在已经带状态治理。

- 新文档默认进入 `draft`
- reviewer 可以把文档推进到 `reviewed` 或 `approved`
- 默认 grounding 只会引用 `reviewed/approved` 文档
- 仓库自带的种子法规已经预设成 `approved`，开箱即用不会失去引用能力

## 宿主接入

如果你仍然需要接到 OpenClaw，请使用 `integrations/openclaw/` 下的适配器，而不是把整个仓库继续当成 skill 根目录。

如果是 Claude、Manus、Cursor、Cline、Cherry Studio 这类支持 MCP 的宿主，则直接使用共享入口：

```bash
npm run mcp:serve
```

对应说明见：

- [integrations/mcp/README.md](./integrations/mcp/README.md)
- [integrations/claude/README.md](./integrations/claude/README.md)
- [integrations/manus/README.md](./integrations/manus/README.md)
- [integrations/cursor/README.md](./integrations/cursor/README.md)
- [integrations/cline/README.md](./integrations/cline/README.md)
- [integrations/cherry-studio/README.md](./integrations/cherry-studio/README.md)

## 企业化边界

这版已经具备产品骨架，但我不会不诚实地宣称它“已经企业标准完成”。

已具备：
- 大脑接入层
- 中文 Web 操作台
- 法律资料库基础管理
- 可解释决策与回放
- OIDC-ready 身份绑定、服务端 session、CSRF 与角色边界
- SQLite 审计账本、integrity verify 和导出链路
- 目录 / S3-compatible 备份复制
- 非破坏性恢复演练与恢复就绪度摘要
- CI 校验与 semver 发布基线
- Docker / Kubernetes 单实例部署与基础观测

仍需继续补齐：
- SCIM / 群组映射 / 更强的身份联邦
- 不可变审计存储与更强的防篡改归因
- 真实 ERP / 审批流连接器
- 更大规模的法规资料装载与签核机制

## 相关文档

- [docs/identity-operations.md](./docs/identity-operations.md)
- [docs/cloud-runtime-operations.md](./docs/cloud-runtime-operations.md)
- [docs/restore-drill-operations.md](./docs/restore-drill-operations.md)
- [docs/deployment-baseline.md](./docs/deployment-baseline.md)
- [docs/host-integration-matrix.md](./docs/host-integration-matrix.md)
- [docs/v0.4.0-launch-checklist.md](./docs/v0.4.0-launch-checklist.md)
- [docs/roadmap.md](./docs/roadmap.md)
- [docs/marketing-launch.md](./docs/marketing-launch.md)
- [docs/handoff-to-openclaw-self-operator.md](./docs/handoff-to-openclaw-self-operator.md)
- [docs/long-term-evolution-plan.md](./docs/long-term-evolution-plan.md)
- [docs/audit-operations.md](./docs/audit-operations.md)
- [docs/checkpoint-2026-03-31-enterprise-beta-identity.md](./docs/checkpoint-2026-03-31-enterprise-beta-identity.md)
- [docs/checkpoint-2026-03-31-runtime-ci-cloud-diagnostics.md](./docs/checkpoint-2026-03-31-runtime-ci-cloud-diagnostics.md)
- [docs/checkpoint-2026-03-31-cloud-doctor-report.md](./docs/checkpoint-2026-03-31-cloud-doctor-report.md)
- [docs/checkpoint-2026-03-31-console-backup-observability.md](./docs/checkpoint-2026-03-31-console-backup-observability.md)
- [docs/checkpoint-2026-03-31-recovery-ci-release.md](./docs/checkpoint-2026-03-31-recovery-ci-release.md)
- [docs/checkpoint-2026-03-31-apple-ui-agent-hub.md](./docs/checkpoint-2026-03-31-apple-ui-agent-hub.md)
- [SECURITY.md](./SECURITY.md)
- [SUPPORT.md](./SUPPORT.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
