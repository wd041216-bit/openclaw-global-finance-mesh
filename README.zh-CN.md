# OpenClaw Global Finance Mesh

这是一个按 OpenClaw 风格组织的财务 Agent 仓库，把“宙衡 Global Finance Mesh”从规格文档落成了可运行 MVP。

## 已落地内容

- OpenClaw 插件入口
- Finance Mesh 技能包装
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
```

## 适用团队

- CFO 与财务共享中心
- 税务和内控负责人
- 财务系统产品团队
- 想在 OpenClaw 上挂接财务治理能力的实施团队

