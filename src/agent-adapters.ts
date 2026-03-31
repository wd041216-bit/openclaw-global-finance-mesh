import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AgentAdapterArtifact,
  AgentAdapterSupportLevel,
} from "./agent-tool-results.ts";

export type AgentAdapterKind = "openclaw_plugin" | "mcp_connector";
export type AgentAdapterStatus = "ready" | "beta";
export type AgentAdapterInstallMode = "local-first";

export interface AgentAdapterCapability {
  id: string;
  title: string;
  description: string;
  toolNames: string[];
}

export interface AgentAdapterInstallGuide {
  title: string;
  summary: string;
  steps: string[];
  configSnippet: string;
  verification: string[];
  troubleshooting: string[];
}

export interface AgentAdapterDescriptor {
  id: string;
  name: string;
  kind: AgentAdapterKind;
  displayName: string;
  description: string;
  status: AgentAdapterStatus;
  supportLevel: AgentAdapterSupportLevel;
  installMode: AgentAdapterInstallMode;
  entrypoint: string;
  docsPath: string;
  configTemplatePath: string;
  smokeCommand: string;
  testedHosts: string[];
  artifacts: AgentAdapterArtifact[];
  capabilities: AgentAdapterCapability[];
  installGuide: AgentAdapterInstallGuide;
  troubleshooting: string[];
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
const REPO_PLACEHOLDER = "/absolute/path/to/zhouheng-global-finance-mesh";

const SHARED_CAPABILITIES: AgentAdapterCapability[] = [
  {
    id: "validate_packs",
    title: "校验 Pack 规则集",
    description: "检查规则元数据、回滚覆盖和基础卫生，避免错误规则直接进入决策链。",
    toolNames: ["finance_mesh_validate_packs"],
  },
  {
    id: "run_decision",
    title: "运行财务决策",
    description: "根据事件和 Pack 生成 Decision Packet，并给出结论、风险、建议动作和证据摘要。",
    toolNames: ["finance_mesh_run_decision"],
  },
  {
    id: "run_replay",
    title: "回放规则变更影响",
    description: "对比基线和候选 Pack，帮助宿主 Agent 在发布前评估规则漂移。",
    toolNames: ["finance_mesh_replay"],
  },
  {
    id: "search_legal_library",
    title: "检索依据库",
    description: "按关键词搜索法规与治理资料，并返回可直接展示的摘要与引文片段。",
    toolNames: ["finance_mesh_search_legal_library"],
  },
  {
    id: "read_audit_integrity",
    title: "读取审计链健康",
    description: "查看当前审计账本完整性、最近验证状态和导出摘要。",
    toolNames: ["finance_mesh_read_audit_integrity"],
  },
];

function buildClaudeConfigSnippet(): string {
  return JSON.stringify(
    {
      mcpServers: {
        "zhouheng-global-finance-mesh": {
          command: "node",
          args: [`${REPO_PLACEHOLDER}/integrations/mcp/server.ts`],
          env: {
            FINANCE_MESH_REPO_ROOT: REPO_PLACEHOLDER,
            FINANCE_MESH_MCP_PACK_ROOTS: "examples/packs",
          },
        },
      },
    },
    null,
    2,
  );
}

function buildManusConfigSnippet(): string {
  return JSON.stringify(
    {
      name: "zhouheng-global-finance-mesh",
      transport: "stdio",
      command: "node",
      args: [`${REPO_PLACEHOLDER}/integrations/mcp/server.ts`],
      env: {
        FINANCE_MESH_REPO_ROOT: REPO_PLACEHOLDER,
        FINANCE_MESH_MCP_PACK_ROOTS: "examples/packs",
      },
    },
    null,
    2,
  );
}

function buildOpenClawConfigSnippet(): string {
  return JSON.stringify(
    {
      plugins: {
        load: {
          paths: [`${REPO_PLACEHOLDER}/integrations/openclaw`],
        },
        entries: ["zhouheng-global-finance-mesh"],
      },
    },
    null,
    2,
  );
}

function buildArtifacts(input: {
  configTemplatePath: string;
  docsPath: string;
  startCommand: string;
  verifyCommand: string;
}): AgentAdapterArtifact[] {
  return [
    {
      kind: "config",
      label: "配置模板",
      value: input.configTemplatePath,
      description: "直接复制的宿主配置样例。",
    },
    {
      kind: "docs",
      label: "接入文档",
      value: input.docsPath,
      description: "本地安装、验证与排错说明。",
    },
    {
      kind: "command",
      label: "启动命令",
      value: input.startCommand,
      description: "用于本地拉起 adapter 或共享 MCP 入口。",
    },
    {
      kind: "verify",
      label: "验证命令",
      value: input.verifyCommand,
      description: "本地最小 smoke，确认宿主接入契约没有漂移。",
    },
  ];
}

const ADAPTERS: AgentAdapterDescriptor[] = [
  {
    id: "openclaw",
    name: "openclaw",
    kind: "openclaw_plugin",
    displayName: "OpenClaw Plugin",
    description: "通过原生 OpenClaw plugin 方式接入 Zhouheng 的规则校验、决策和回放能力。",
    status: "ready",
    supportLevel: "native_ready",
    installMode: "local-first",
    entrypoint: "integrations/openclaw/index.ts",
    docsPath: "integrations/openclaw/README.md",
    configTemplatePath: "integrations/openclaw/openclaw-config.example.json",
    smokeCommand: "npm run smoke:openclaw",
    testedHosts: ["OpenClaw local plugin host", "OpenClaw fixture smoke"],
    artifacts: buildArtifacts({
      configTemplatePath: "integrations/openclaw/openclaw-config.example.json",
      docsPath: "integrations/openclaw/README.md",
      startCommand: "由 OpenClaw 宿主直接加载 integrations/openclaw",
      verifyCommand: "npm run smoke:openclaw",
    }),
    capabilities: SHARED_CAPABILITIES.slice(0, 3),
    installGuide: {
      title: "把 Zhouheng 作为 OpenClaw 插件接入",
      summary: "适用于已经在使用 OpenClaw 的本地自动化环境。OpenClaw 会原生加载 Zhouheng 插件，不需要单独起 MCP 进程。",
      steps: [
        "把仓库 clone 到本机，并确认 examples/packs 与 data/ 目录可读。",
        "在 OpenClaw 的 plugins.load.paths 中指向 integrations/openclaw 目录。",
        "在 plugins.entries 中加入 zhouheng-global-finance-mesh。",
        "启动宿主后验证 pack validation、decision 和 replay 三个工具已经出现。",
      ],
      configSnippet: buildOpenClawConfigSnippet(),
      verification: [
        "确认 finance_mesh_validate_packs 可以被列出。",
        "执行一次 finance_mesh_run_decision 并返回决策摘要。",
        "执行一次 finance_mesh_replay 并返回回放摘要。",
      ],
      troubleshooting: [
        "如果 OpenClaw 没有识别插件路径，先确认 paths 指向的是 integrations/openclaw 而不是仓库根目录。",
        "如果工具列表为空，检查宿主是否加载了 zhouheng-global-finance-mesh 这个 entry。",
        "如果插件加载成功但没有 prepend guidance，检查 prependSystemGuidance 是否仍为 true。",
      ],
    },
    troubleshooting: [
      "如果 OpenClaw 没有识别插件路径，先确认 paths 指向的是 integrations/openclaw 而不是仓库根目录。",
      "如果工具列表为空，检查宿主是否加载了 zhouheng-global-finance-mesh 这个 entry。",
      "如果插件加载成功但没有 prepend guidance，检查 prependSystemGuidance 是否仍为 true。",
    ],
  },
  {
    id: "claude",
    name: "claude",
    kind: "mcp_connector",
    displayName: "Claude MCP Connector",
    description: "通过本地 stdio MCP server，把 Zhouheng 暴露给 Claude 类宿主作为结构化工具集合。",
    status: "beta",
    supportLevel: "shared_mcp_beta",
    installMode: "local-first",
    entrypoint: "integrations/mcp/server.ts",
    docsPath: "integrations/claude/README.md",
    configTemplatePath: "integrations/claude/claude.mcp.config.example.json",
    smokeCommand: "npm run smoke:mcp",
    testedHosts: ["Claude MCP local stdio host"],
    artifacts: buildArtifacts({
      configTemplatePath: "integrations/claude/claude.mcp.config.example.json",
      docsPath: "integrations/claude/README.md",
      startCommand: "npm run mcp:serve",
      verifyCommand: "npm run smoke:mcp",
    }),
    capabilities: SHARED_CAPABILITIES,
    installGuide: {
      title: "把 Zhouheng 作为 Claude 的 MCP 工具接入",
      summary: "适用于支持 MCP 的 Claude 本地客户端或开发工作流。Claude 与 Manus 共用同一个共享 MCP 入口。",
      steps: [
        "确认本机可以直接运行 npm run mcp:serve。",
        "在 Claude 的 MCP 配置中注册一个 stdio server。",
        "把 command 指向 node，args 指向 integrations/mcp/server.ts。",
        "如需自定义 Pack 根目录，设置 FINANCE_MESH_MCP_PACK_ROOTS 环境变量。",
      ],
      configSnippet: buildClaudeConfigSnippet(),
      verification: [
        "列出工具时可以看到五个 finance_mesh_* 工具。",
        "调用 finance_mesh_run_decision 时会返回 summary + structuredContent。",
        "调用 finance_mesh_search_legal_library 时会返回可直接展示的结果摘要。",
      ],
      troubleshooting: [
        "如果 Claude 无法启动 connector，先在终端单独执行 npm run mcp:serve 看看是否能正常驻留。",
        "如果看不到工具，确认 FINANCE_MESH_REPO_ROOT 指向的是仓库根目录，而不是 integrations/mcp。",
        "如果 tools/list 正常但调用失败，检查 FINANCE_MESH_MCP_PACK_ROOTS 是否仍指向 examples/packs 或你的真实 pack 目录。",
      ],
    },
    troubleshooting: [
      "如果 Claude 无法启动 connector，先在终端单独执行 npm run mcp:serve 看看是否能正常驻留。",
      "如果看不到工具，确认 FINANCE_MESH_REPO_ROOT 指向的是仓库根目录，而不是 integrations/mcp。",
      "如果 tools/list 正常但调用失败，检查 FINANCE_MESH_MCP_PACK_ROOTS 是否仍指向 examples/packs 或你的真实 pack 目录。",
    ],
  },
  {
    id: "manus",
    name: "manus",
    kind: "mcp_connector",
    displayName: "Manus MCP Connector",
    description: "通过同一套共享 MCP 入口，把 Zhouheng 作为 Manus 的规则与治理工具集接入。",
    status: "beta",
    supportLevel: "shared_mcp_beta",
    installMode: "local-first",
    entrypoint: "integrations/mcp/server.ts",
    docsPath: "integrations/manus/README.md",
    configTemplatePath: "integrations/manus/manus.mcp.config.example.json",
    smokeCommand: "npm run smoke:mcp",
    testedHosts: ["Manus MCP local stdio host"],
    artifacts: buildArtifacts({
      configTemplatePath: "integrations/manus/manus.mcp.config.example.json",
      docsPath: "integrations/manus/README.md",
      startCommand: "npm run mcp:serve",
      verifyCommand: "npm run smoke:mcp",
    }),
    capabilities: SHARED_CAPABILITIES,
    installGuide: {
      title: "把 Zhouheng 作为 Manus 的本地工具接入",
      summary: "适用于支持 MCP/stdio connector 的 Manus 型宿主环境。本轮不做 Manus 专属魔改，而是复用共享 MCP 契约。",
      steps: [
        "在本机准备好本仓库与 node 运行时。",
        "向 Manus 注册一个本地 stdio connector。",
        "command 使用 node，args 指向 integrations/mcp/server.ts。",
        "必要时通过 FINANCE_MESH_REPO_ROOT 和 FINANCE_MESH_MCP_PACK_ROOTS 指向实际仓库路径。",
      ],
      configSnippet: buildManusConfigSnippet(),
      verification: [
        "连接成功后可以看到五个 finance_mesh_* 工具。",
        "运行一次 finance_mesh_run_decision，确认 structuredContent 可被宿主读取。",
        "运行一次 finance_mesh_read_audit_integrity，确认治理读取能力可用。",
      ],
      troubleshooting: [
        "如果 Manus 侧报 stdio 启动失败，先在终端执行同一条 node 命令排查路径或环境变量问题。",
        "如果工具输出只有文本没有结构化对象，更新到当前仓库版本并确认 shared MCP server 已重启。",
        "如果决策调用报找不到 Pack，确认 Manus 配置里的 FINANCE_MESH_REPO_ROOT 指向仓库根目录。",
      ],
    },
    troubleshooting: [
      "如果 Manus 侧报 stdio 启动失败，先在终端执行同一条 node 命令排查路径或环境变量问题。",
      "如果工具输出只有文本没有结构化对象，更新到当前仓库版本并确认 shared MCP server 已重启。",
      "如果决策调用报找不到 Pack，确认 Manus 配置里的 FINANCE_MESH_REPO_ROOT 指向仓库根目录。",
    ],
  },
];

export function listAgentAdapters(): AgentAdapterDescriptor[] {
  return ADAPTERS.map(cloneAdapter);
}

export function getAgentAdapter(id: string): AgentAdapterDescriptor | null {
  const adapter = ADAPTERS.find((item) => item.id === id);
  return adapter ? cloneAdapter(adapter) : null;
}

export function getAgentAdapterOrThrow(id: string): AgentAdapterDescriptor {
  const adapter = getAgentAdapter(id);
  if (!adapter) {
    throw new Error(`Unknown adapter: ${id}`);
  }
  return adapter;
}

export function resolveRepoPath(relativePath: string): string {
  return path.join(REPO_ROOT, relativePath);
}

function cloneAdapter(adapter: AgentAdapterDescriptor): AgentAdapterDescriptor {
  return JSON.parse(JSON.stringify(adapter)) as AgentAdapterDescriptor;
}
