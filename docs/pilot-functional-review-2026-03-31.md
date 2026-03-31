# Pilot Functional Review — 2026-03-31

## Goal

Convert the current repo from “feature-complete engineering beta” to “safe for a small external pilot”.

## Automated review commands

Run:

```bash
npm run review:pilot
```

The review currently covers:

- `npm test`
- `npm run verify:server`
- `npm run doctor:hosts`
- `npm run smoke:cloud`
- `npm run smoke:restore`
- `npm run smoke:ui`

## Current conclusion

- `P0 = 0`
- `P1 = 0`
- external blocker: no real cloud key is present in the current workspace, so provider entitlement validation must be completed with `npm run verify:cloud-provider`

## Review matrix

| Area | Current status | Notes |
| --- | --- | --- |
| 决策中心 | pass | 示例事件、摘要、审计记录链路已经稳定。 |
| 回放中心 | pass | baseline/candidate 差异路径已覆盖。 |
| 依据库 | pass | 搜索优先，治理动作保持 reviewer/admin 门禁。 |
| 身份与会话 | pass | local token + OIDC hybrid 基线可用。 |
| 运行时本地模式 | pass with attention | 现在会明确指出“本地模型未就绪”而不是泛化成模糊失败。 |
| 运行时云端模式 | pending real key | 代码路径、协议选择和诊断都已就绪，真实 provider entitlement 仍需用真实 key 验证。 |
| 审计 / 导出 | pass | SQLite ledger、完整性和导出链路已覆盖。 |
| 备份 / 恢复演练 | pass | mounted-dir 与 S3-compatible 恢复演练已覆盖。 |
| Agent Hub / 三宿主 | pass | OpenClaw fixture smoke + MCP doctor 已覆盖。 |
| Docker / 在线试点环境 | pass with runbook | 单实例 VM + Docker 交付路径已文档化。 |

## Remaining P2 items

- capture one real `Ollama Cloud` verification artifact
- capture one real `OpenAI-compatible gateway` verification artifact
- keep a screenshot set from the final pilot environment after runtime is fully usable

## Exit rule

The pilot can be considered ready when:

1. `npm run review:pilot` has no required failures
2. both provider classes have at least one real verification artifact
3. the system page shows a clear runtime conclusion instead of `not_verified`
