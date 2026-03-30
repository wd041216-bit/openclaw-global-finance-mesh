# Zhouheng Global Finance Mesh

这是一个独立的财务控制平面产品仓库，不再把自己包装成 OpenClaw 的附属 skill。它把“宙衡 Global Finance Mesh”从规格文档推进成了可运行、可验证、可持续演进的产品基线。

## 已落地内容

- 独立 Web 控制台，覆盖运行时配置、法律资料库、决策执行、回放分析、审计历史
- 基于 token 的访问控制，支持 `viewer`、`operator`、`reviewer`、`admin` 四级角色
- 可插拔 Ollama 大脑，支持本地与云端模式
- Pack 校验、决策生成、回放对比、审计追溯快照
- 法律资料库采集、检索、引用注入链路
- 本地持久化审计历史，decision / replay 结果会落盘保存
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

## 访问控制

控制台现在已经支持本地 RBAC。

- 可以在 Access Control 面板里 bootstrap 第一个 admin
- 也可以通过 `FINANCE_MESH_BOOTSTRAP_ADMIN_*` 环境变量预置第一个管理员
- decision、replay、资料库写操作和审计查看都已经按角色做了限制
- 开启 auth 后，审计历史会记录操作者身份

## 审计历史

本轮开始，decision 和 replay 的运行结果会持久化到 `data/audit/runs.json`。

- 控制台里可以直接看到最近运行历史和完整明细
- 重启服务后历史仍然保留，便于 demo、排障、复盘
- 这还是 MVP 级审计存储，不等于不可篡改的企业级审计底座

## OpenClaw 兼容接入

如果你仍然需要接到 OpenClaw，请使用 `integrations/openclaw/` 下的适配器，而不是把整个仓库继续当成 skill 根目录。

## 企业化边界

这版已经具备产品骨架，但我不会不诚实地宣称它“已经企业标准完成”。

已具备：
- 大脑接入层
- Web 操作台
- 法律资料库基础管理
- 可解释决策与回放
- token 级访问控制与角色边界
- 本地持久化审计历史

仍需继续补齐：
- SSO 与更强的身份体系
- 不可变审计存储与操作归因
- 真实 ERP / 审批流连接器
- 更大规模的法规资料装载与签核机制

## 相关文档

- [docs/roadmap.md](./docs/roadmap.md)
- [docs/marketing-launch.md](./docs/marketing-launch.md)
- [docs/handoff-to-openclaw-self-operator.md](./docs/handoff-to-openclaw-self-operator.md)
- [docs/long-term-evolution-plan.md](./docs/long-term-evolution-plan.md)
