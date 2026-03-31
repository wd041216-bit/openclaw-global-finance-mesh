import path from "node:path";
import { fileURLToPath } from "node:url";

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
}

export interface AgentAdapterDescriptor {
  id: string;
  name: string;
  kind: AgentAdapterKind;
  displayName: string;
  description: string;
  status: AgentAdapterStatus;
  installMode: AgentAdapterInstallMode;
  entrypoint: string;
  docsPath: string;
  configTemplatePath: string;
  capabilities: AgentAdapterCapability[];
  installGuide: AgentAdapterInstallGuide;
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
    description: "根据事件和 Pack 生成 Decision Packet，并给出证据与风险摘要。",
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
    description: "按关键词搜索法规与治理资料，并返回摘要与引文片段。",
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

const ADAPTERS: AgentAdapterDescriptor[] = [
  {
    id: "openclaw",
    name: "openclaw",
    kind: "openclaw_plugin",
    displayName: "OpenClaw Plugin",
    description: "通过原生 OpenClaw plugin 方式接入 Zhouheng 的规则校验、决策和回放能力。",
    status: "ready",
    installMode: "local-first",
    entrypoint: "integrations/openclaw/index.ts",
    docsPath: "integrations/openclaw/SKILL.md",
    configTemplatePath: "integrations/openclaw/openclaw-config.example.json",
    capabilities: SHARED_CAPABILITIES.slice(0, 3),
    installGuide: {
      title: "把 Zhouheng 作为 OpenClaw 插件接入",
      summary: "适用于已经在用 OpenClaw 的本地自动化环境。",
      steps: [
        "把仓库 clone 到本机，并确认 examples/packs 与 data/ 目录可读。",
        "在 OpenClaw 的 plugins.load.paths 中指向 integrations/openclaw 目录。",
        "在 plugins.entries 中加入 zhouheng-global-finance-mesh。",
        "启动宿主后验证三个工具已经出现在插件工具列表中。",
      ],
      configSnippet: buildOpenClawConfigSnippet(),
      verification: [
        "确认 finance_mesh_validate_packs 可以被列出。",
        "执行一次 finance_mesh_run_decision 并返回 Decision Packet 摘要。",
        "执行一次 finance_mesh_replay 并返回 drift 结果。",
      ],
    },
  },
  {
    id: "claude",
    name: "claude",
    kind: "mcp_connector",
    displayName: "Claude MCP Connector",
    description: "通过本地 stdio MCP server，把 Zhouheng 暴露给 Claude 类宿主作为工具集合。",
    status: "beta",
    installMode: "local-first",
    entrypoint: "integrations/mcp/server.ts",
    docsPath: "integrations/claude/README.md",
    configTemplatePath: "integrations/claude/claude.mcp.config.example.json",
    capabilities: SHARED_CAPABILITIES,
    installGuide: {
      title: "把 Zhouheng 作为 Claude 的 MCP 工具接入",
      summary: "适用于支持 MCP 的 Claude 本地客户端或开发工作流。",
      steps: [
        "确认本机可以直接运行 node integrations/mcp/server.ts。",
        "在 Claude 的 MCP 配置中注册一个 stdio server。",
        "把 command 指向 node，args 指向 integrations/mcp/server.ts。",
        "如需自定义 Pack 根目录，设置 FINANCE_MESH_MCP_PACK_ROOTS 环境变量。",
      ],
      configSnippet: buildClaudeConfigSnippet(),
      verification: [
        "列出工具时可以看到 finance_mesh_validate_packs 等五个工具。",
        "调用 finance_mesh_search_legal_library 能返回依据库摘要。",
        "调用 finance_mesh_read_audit_integrity 能返回当前账本状态。",
      ],
    },
  },
  {
    id: "manus",
    name: "manus",
    kind: "mcp_connector",
    displayName: "Manus MCP Connector",
    description: "通过同一套本地 MCP 入口，把 Zhouheng 作为 Manus 的规则与治理工具集接入。",
    status: "beta",
    installMode: "local-first",
    entrypoint: "integrations/mcp/server.ts",
    docsPath: "integrations/manus/README.md",
    configTemplatePath: "integrations/manus/manus.mcp.config.example.json",
    capabilities: SHARED_CAPABILITIES,
    installGuide: {
      title: "把 Zhouheng 作为 Manus 的本地工具接入",
      summary: "适用于支持 MCP/stdio connector 的 Manus 型宿主环境。",
      steps: [
        "在本机准备好本仓库与 node 运行时。",
        "向 Manus 注册一个本地 stdio connector。",
        "command 使用 node，args 指向 integrations/mcp/server.ts。",
        "必要时通过 FINANCE_MESH_REPO_ROOT 和 FINANCE_MESH_MCP_PACK_ROOTS 指向实际仓库路径。",
      ],
      configSnippet: buildManusConfigSnippet(),
      verification: [
        "连接成功后可以读取五个工具定义。",
        "运行一次决策工具能返回结构化摘要。",
        "治理查询工具能读到审计与依据库信息。",
      ],
    },
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

