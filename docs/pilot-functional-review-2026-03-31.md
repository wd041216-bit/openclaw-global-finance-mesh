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
- `npm run verify:cloud-provider`
- `npm run smoke:restore`
- `npm run smoke:ui`

## Current conclusion

- `P0 = 0`
- `P1 = 0`
- current pilot-default runtime: `Ollama Cloud + kimi-k2.5`
- current pilot runtime gate: `verificationStatus=fully_usable`, `goLiveReady=true`, `validatedFlavor=ollama_native`
- external pilot can be considered ready when the target environment reproduces the same runtime gate with its own real key

## Review matrix

| Area | Current status | Notes |
| --- | --- | --- |
| 决策中心 | pass | 示例事件、摘要、审计记录链路已经稳定。 |
| 回放中心 | pass | baseline/candidate 差异路径已覆盖。 |
| 依据库 | pass | 搜索优先，治理动作保持 reviewer/admin 门禁。 |
| 身份与会话 | pass | local token + OIDC hybrid 基线可用。 |
| 运行时本地模式 | pass with attention | 现在会明确指出“本地模型未就绪”而不是泛化成模糊失败。 |
| 运行时云端模式 | pass | `Ollama Cloud + kimi-k2.5` 已经跑出真实 `fully_usable` 结果，并形成正式验证记录。 |
| 审计 / 导出 | pass | SQLite ledger、完整性和导出链路已覆盖。 |
| 备份 / 恢复演练 | pass | mounted-dir 与 S3-compatible 恢复演练已覆盖。 |
| Agent Hub / 三宿主 | pass | OpenClaw fixture smoke + MCP doctor 已覆盖。 |
| Docker / 在线试点环境 | pass with runbook | 单实例 VM + Docker 交付路径已文档化。 |

## Remaining P2 items

- keep a screenshot set from the final pilot environment after runtime is fully usable
- optional follow-on: verify one real `OpenAI-compatible gateway` artifact for the next provider workstream

## Exit rule

The pilot can be considered ready when:

1. `npm run review:pilot` has no required failures
2. `Ollama Cloud + kimi-k2.5` reproduces `verificationStatus=fully_usable` and `goLiveReady=true` in the target environment
3. the system page shows `可正式试点`
