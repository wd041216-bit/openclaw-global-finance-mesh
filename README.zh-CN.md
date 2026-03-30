# OpenClaw Global Finance Mesh

这是一个按 OpenClaw 风格组织的财务 Agent 仓库，把“宙衡 Global Finance Mesh”从规格文档落成了可运行 MVP。

## 已落地内容

- OpenClaw 插件入口
- Finance Mesh 技能包装
- 可插拔 Ollama 大脑，支持本地与云端模式
- Web UI 控制台
- 法律资料库采集、检索、引用注入链路
- Pack 校验、决策生成、回放对比、审计追溯快照
- SaaS 年付预收场景示例
- Country、Industry、Entity、Control、Output 五类 Pack 示例
- Node 原生测试

## 当前定位

它不是“财务问答机器人”，而是一个规则网格驱动的财务决策中枢骨架。

- 输入是经济事件与上下文
- 中间层是 Pack 规则和优先级
- 输出是可审计的 Decision Packet

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

## 适用团队

- CFO 与财务共享中心
- 税务和内控负责人
- 财务系统产品团队
- 想在 OpenClaw 上挂接财务治理能力的实施团队

## 企业化边界

这版已经具备企业产品骨架，但我不会不诚实地宣称它“已经企业标准完成”。

已具备：
- 大脑接入层
- Web 操作台
- 法律资料库基础管理
- 可解释决策与回放

仍需继续补齐：
- 权限与 SSO
- 持久化审计和变更治理
- 真实 ERP / 审批流连接器
- 更大规模的法规资料装载与签核机制
