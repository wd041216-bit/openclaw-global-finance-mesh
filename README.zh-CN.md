# Zhouheng Global Finance Mesh

这是一个独立的财务控制平面产品仓库，不再把自己包装成 OpenClaw 的附属 skill。它把“宙衡 Global Finance Mesh”从规格文档推进成了可运行、可验证、可持续演进的产品基线，并补上了 OIDC-ready 身份层、服务端 session、以及基于 SQLite 的防篡改审计账本。

## 已落地内容

- 独立 Web 控制台，覆盖运行时配置、法律资料库、决策执行、回放分析、审计历史、probe 历史、operator activity、audit integrity、身份与 session 管理
- 服务端 operator session：`HttpOnly` cookie、CSRF、防登出残留、active session 查看与 revoke
- 混合身份模式：break-glass 本地 token + 标准 OIDC authorization-code 登录
- `viewer`、`operator`、`reviewer`、`admin` 四级角色，以及基于 `issuer + subject` / verified email 的 OIDC 身份绑定
- 可插拔 Ollama 大脑，支持本地与云端模式
- Pack 校验、决策生成、回放对比、审计追溯快照
- 法律资料库采集、检索、治理状态流转、引用注入链路
- 基于 SQLite 的 append-only 审计账本，统一记录 decision / replay / runtime probe / integrity verify / export batch / operator activity
- 持久化 operator activity timeline，记录 RBAC、session、运行时配置、法规治理和执行动作
- SaaS 年付预收场景示例
- 可选 OpenClaw 兼容层，集中放在 `integrations/openclaw/`

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

如果走云端模型，可以本地设置：

```bash
export OLLAMA_MODE=cloud
export OLLAMA_API_KEY=你的本地环境变量
export OLLAMA_MODEL=qwen3:8b
npm run dev
```

默认不会持久化 API key，除非你在 UI 里主动勾选保存到本地忽略文件。

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

## 审计历史

本轮开始，审计真相源已经切到 `data/audit/ledger.sqlite`。

- decision、replay、runtime probe、integrity verify、export batch 和 operator activity 全都进入同一条 hash chain
- 控制台里可以直接看到最近运行历史、完整明细和独立的 integrity 面板
- 旧的 `data/audit/runs.json` 与 `data/audit/activity.json` 如果存在，会在首次启动时一次性迁移到 SQLite，然后保留为历史备份
- 这已经是 tamper-evident 的本地审计底座，但还不是异地不可变企业存储

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

## 法律资料治理

法律资料库现在已经带状态治理。

- 新文档默认进入 `draft`
- reviewer 可以把文档推进到 `reviewed` 或 `approved`
- 默认 grounding 只会引用 `reviewed/approved` 文档
- 仓库自带的种子法规已经预设成 `approved`，开箱即用不会失去引用能力

## OpenClaw 兼容接入

如果你仍然需要接到 OpenClaw，请使用 `integrations/openclaw/` 下的适配器，而不是把整个仓库继续当成 skill 根目录。

## 企业化边界

这版已经具备产品骨架，但我不会不诚实地宣称它“已经企业标准完成”。

已具备：
- 大脑接入层
- Web 操作台
- 法律资料库基础管理
- 可解释决策与回放
- OIDC-ready 身份绑定、服务端 session、CSRF 与角色边界
- SQLite 审计账本、integrity verify 和导出链路

仍需继续补齐：
- SCIM / 群组映射 / 更强的身份联邦
- 不可变审计存储与更强的防篡改归因
- 真实 ERP / 审批流连接器
- 更大规模的法规资料装载与签核机制

## 相关文档

- [docs/identity-operations.md](./docs/identity-operations.md)
- [docs/roadmap.md](./docs/roadmap.md)
- [docs/marketing-launch.md](./docs/marketing-launch.md)
- [docs/handoff-to-openclaw-self-operator.md](./docs/handoff-to-openclaw-self-operator.md)
- [docs/long-term-evolution-plan.md](./docs/long-term-evolution-plan.md)
- [docs/audit-operations.md](./docs/audit-operations.md)
- [docs/checkpoint-2026-03-31-enterprise-beta-identity.md](./docs/checkpoint-2026-03-31-enterprise-beta-identity.md)
