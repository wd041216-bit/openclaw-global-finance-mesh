import type { BrainAuthStatus, BrainEndpointCheck, BrainErrorKind, BrainProbeResult } from "./brain.ts";
import type { CloudApiFlavor } from "./runtime-config.ts";

export interface RuntimeDiagnosticSnapshot {
  mode: "local" | "cloud";
  model: string;
  hasApiKey: boolean;
  cloudApiFlavor: CloudApiFlavor;
}

export interface RuntimeCheckDiagnosis {
  title: string;
  status: "ready" | "warning" | "failure" | "pending";
  summary: string;
  selectedEndpoint?: string;
  checks: BrainEndpointCheck[];
}

export interface RuntimeDiagnosis {
  businessStatusCode:
    | "local_ok"
    | "cloud_ok"
    | "catalog_only"
    | "unauthorized"
    | "protocol_mismatch"
    | "model_not_found"
    | "network_error"
    | "pending";
  businessStatus: string;
  summary: string;
  nextActionTitle: string;
  recommendedActions: string[];
  protocolSummary: string;
  authStatus: BrainAuthStatus;
  errorKind?: BrainErrorKind;
  catalog: RuntimeCheckDiagnosis;
  inference: RuntimeCheckDiagnosis;
}

export function buildRuntimeDiagnosis(
  config: RuntimeDiagnosticSnapshot,
  probe?: BrainProbeResult | null,
): RuntimeDiagnosis {
  if (!probe) {
    return buildDiagnosisWithoutProbe(config);
  }

  if (config.mode === "local") {
    return buildLocalDiagnosis(config, probe);
  }

  if (probe.ok) {
    return {
      businessStatusCode: "cloud_ok",
      businessStatus: "云端可用",
      summary: `当前云端已通过 ${translateCloudFlavor(probe.cloudApiFlavor)} 协议完成模型目录读取和推理。`,
      nextActionTitle: "保持当前协议与模型配置",
      recommendedActions: [
        "把当前 cloud protocol 和模型名作为已验证配置保留下来。",
        "如更换模型或基础地址，先重新执行一次探针再交给业务使用。",
      ],
      protocolSummary: buildProtocolSummary(config, probe),
      authStatus: probe.authStatus,
      catalog: buildCatalogDiagnosis(probe, "云端模型目录可读"),
      inference: buildInferenceDiagnosis(probe, "云端推理已验证通过"),
    };
  }

  if (probe.listModelsOk && !probe.inferenceOk && probe.errorKind === "unauthorized") {
    return {
      businessStatusCode: "catalog_only",
      businessStatus: "仅模型目录可用",
      summary: "当前账号可读取模型目录，但还没有云端推理权限。",
      nextActionTitle: "先补 inference entitlement，不要继续改 endpoint",
      recommendedActions: [
        "确认当前 API key 或账号是否真正开通了云端推理权限。",
        "保持 cloudApiFlavor 为当前可读目录的协议，不要把授权问题误判成代码问题。",
        "必要时把 probe 结果发给云端提供方，重点说明 catalog 成功但 inference 401。",
      ],
      protocolSummary: buildProtocolSummary(config, probe),
      authStatus: probe.authStatus,
      errorKind: probe.errorKind,
      catalog: buildCatalogDiagnosis(probe, "模型目录已经可读"),
      inference: buildInferenceDiagnosis(probe, "推理请求返回未授权"),
    };
  }

  if (probe.errorKind === "unauthorized" || probe.errorKind === "missing_api_key") {
    return {
      businessStatusCode: "unauthorized",
      businessStatus: "云端未授权",
      summary:
        probe.errorKind === "missing_api_key"
          ? "云端模式缺少 API Key，当前无法完成目录读取或推理。"
          : "当前云端账号还没有足够的访问权限。",
      nextActionTitle: probe.errorKind === "missing_api_key" ? "先补 API Key" : "先核对账号与 key 权限",
      recommendedActions:
        probe.errorKind === "missing_api_key"
          ? [
              "在系统设置里填入 API Key，再重新执行探针。",
              "如需持久化到本地 secrets，请勾选保存选项后再提交。",
            ]
          : [
              "确认当前 key 是否拥有模型目录与推理的访问权限。",
              "如果目录可读但推理失败，优先找 provider 侧 entitlement，而不是改代码路径。",
            ],
      protocolSummary: buildProtocolSummary(config, probe),
      authStatus: probe.authStatus,
      errorKind: probe.errorKind,
      catalog: buildCatalogDiagnosis(probe, "目录访问未完成授权"),
      inference: buildInferenceDiagnosis(probe, "推理访问未完成授权"),
    };
  }

  if (probe.errorKind === "endpoint_not_supported") {
    return {
      businessStatusCode: "protocol_mismatch",
      businessStatus: "云端协议未匹配",
      summary: "当前 cloud protocol 没有命中可用的 provider 接口。",
      nextActionTitle: "切换 cloud protocol 后重新探针",
      recommendedActions: [
        "优先在系统设置中切换 auto / ollama_native / openai_compatible。",
        "确认 cloudBaseUrl 指向 provider 根地址，而不是错误的二级路径。",
        "只有在三种协议都失败时，才值得继续改代码。",
      ],
      protocolSummary: buildProtocolSummary(config, probe),
      authStatus: probe.authStatus,
      errorKind: probe.errorKind,
      catalog: buildCatalogDiagnosis(probe, "模型目录接口未匹配成功"),
      inference: buildInferenceDiagnosis(probe, "推理接口未匹配成功"),
    };
  }

  if (probe.errorKind === "model_not_found") {
    return {
      businessStatusCode: "model_not_found",
      businessStatus: "模型目录已变，当前模型不可用",
      summary: `当前云端没有找到 ${config.model}，需要先用可见目录回填模型名。`,
      nextActionTitle: "先读取模型目录，再改模型名",
      recommendedActions: [
        "在系统设置里先读取模型列表，确认 provider 真实暴露的模型名。",
        "把运行时模型改成目录中实际存在的名称后，再重新探针。",
      ],
      protocolSummary: buildProtocolSummary(config, probe),
      authStatus: probe.authStatus,
      errorKind: probe.errorKind,
      catalog: buildCatalogDiagnosis(probe, "模型目录可读"),
      inference: buildInferenceDiagnosis(probe, "当前模型名没有命中 provider"),
    };
  }

  if (probe.errorKind === "network_error") {
    return {
      businessStatusCode: "network_error",
      businessStatus: "云端连接失败",
      summary: "当前更像网络或基础地址问题，而不是协议或权限问题。",
      nextActionTitle: "先核对 Base URL 与网络可达性",
      recommendedActions: [
        "确认 cloudBaseUrl 是否可从当前部署环境访问。",
        "检查公司网络出口、TLS、中间代理或防火墙是否阻断了 provider 请求。",
      ],
      protocolSummary: buildProtocolSummary(config, probe),
      authStatus: probe.authStatus,
      errorKind: probe.errorKind,
      catalog: buildCatalogDiagnosis(probe, "目录请求没有稳定到达 provider"),
      inference: buildInferenceDiagnosis(probe, "推理请求没有稳定到达 provider"),
    };
  }

  return {
    businessStatusCode: "pending",
    businessStatus: "等待云端进一步诊断",
    summary: probe.error || "云端探针失败，但还没有归类到明确的失败类型。",
    nextActionTitle: "查看协议对比后再决定下一步",
    recommendedActions: [
      "优先看目录接口和推理接口分别是如何失败的。",
      "如果目录和推理都失败，再决定是协议、网络还是授权问题。",
    ],
    protocolSummary: buildProtocolSummary(config, probe),
    authStatus: probe.authStatus,
    errorKind: probe.errorKind,
    catalog: buildCatalogDiagnosis(probe, "目录状态待复核"),
    inference: buildInferenceDiagnosis(probe, "推理状态待复核"),
  };
}

function buildDiagnosisWithoutProbe(config: RuntimeDiagnosticSnapshot): RuntimeDiagnosis {
  if (config.mode === "local") {
    return {
      businessStatusCode: "local_ok",
      businessStatus: "本地模式正常",
      summary: `当前默认走本地模式，但还没有对 ${config.model} 执行探针。`,
      nextActionTitle: "先执行一次本地探针",
      recommendedActions: [
        "探针会确认本地模型目录和推理都是否正常。",
        "如果今天刚换过模型或本地服务地址，优先重新探针。",
      ],
      protocolSummary: "本地模式固定走 Ollama Native。",
      authStatus: "not_required",
      catalog: {
        title: "本地目录状态",
        status: "pending",
        summary: "等待第一次探针。",
        checks: [],
      },
      inference: {
        title: "本地推理状态",
        status: "pending",
        summary: "等待第一次探针。",
        checks: [],
      },
    };
  }

  if (!config.hasApiKey) {
    return {
      businessStatusCode: "unauthorized",
      businessStatus: "云端未授权",
      summary: "当前已切到云端模式，但还没有配置 API Key。",
      nextActionTitle: "先配置云端 API Key",
      recommendedActions: [
        "保存 API Key 后重新执行探针。",
        "如果只是临时排障，可以先不持久化到本地 secrets 文件。",
      ],
      protocolSummary: `当前 cloud protocol 为 ${translateCloudFlavor(config.cloudApiFlavor)}。`,
      authStatus: "missing_api_key",
      errorKind: "missing_api_key",
      catalog: {
        title: "云端模型目录",
        status: "pending",
        summary: "等待配置 API Key。",
        checks: [],
      },
      inference: {
        title: "云端推理",
        status: "pending",
        summary: "等待配置 API Key。",
        checks: [],
      },
    };
  }

  return {
    businessStatusCode: "pending",
    businessStatus: "等待云端诊断",
    summary: "云端模式已经配置好基础信息，但还没有执行探针。",
    nextActionTitle: "先执行一次云端探针",
    recommendedActions: [
      "探针会同时判断目录读取和推理是否都可用。",
      "如果目录可读但推理失败，系统会明确标成权限问题。",
    ],
    protocolSummary: `当前 cloud protocol 为 ${translateCloudFlavor(config.cloudApiFlavor)}。`,
    authStatus: "unknown",
    catalog: {
      title: "云端模型目录",
      status: "pending",
      summary: "等待第一次探针。",
      checks: [],
    },
    inference: {
      title: "云端推理",
      status: "pending",
      summary: "等待第一次探针。",
      checks: [],
    },
  };
}

function buildLocalDiagnosis(config: RuntimeDiagnosticSnapshot, probe: BrainProbeResult): RuntimeDiagnosis {
  if (probe.ok) {
    return {
      businessStatusCode: "local_ok",
      businessStatus: "本地模式正常",
      summary: `本地运行时 ${config.model} 已通过目录读取与推理探针。`,
      nextActionTitle: "保持当前本地模型配置",
      recommendedActions: [
        "如更换本地模型或服务地址，先重新执行一次探针。",
      ],
      protocolSummary: "本地模式固定走 Ollama Native。",
      authStatus: "not_required",
      catalog: buildCatalogDiagnosis(probe, "本地模型目录可读"),
      inference: buildInferenceDiagnosis(probe, "本地推理已验证通过"),
    };
  }

  return {
    businessStatusCode: "local_ok",
    businessStatus: "本地模式需要复核",
    summary: probe.listModelsOk
      ? "本地目录可读，但本地推理失败。"
      : "本地运行时没有通过目录探针。",
    nextActionTitle: "先检查本地 Ollama 服务与模型",
    recommendedActions: [
      "确认本地 Ollama 服务已经启动。",
      "确认模型已经实际下载到本地运行时。",
    ],
    protocolSummary: "本地模式固定走 Ollama Native。",
    authStatus: "not_required",
    errorKind: probe.errorKind,
    catalog: buildCatalogDiagnosis(probe, probe.listModelsOk ? "本地模型目录可读" : "本地目录读取失败"),
    inference: buildInferenceDiagnosis(probe, probe.inferenceOk ? "本地推理可用" : "本地推理失败"),
  };
}

function buildCatalogDiagnosis(probe: BrainProbeResult, successSummary: string): RuntimeCheckDiagnosis {
  return {
    title: "目录状态",
    status: probe.listModelsOk ? "ready" : probe.catalogChecks.length ? "failure" : "pending",
    summary: probe.listModelsOk ? successSummary : summarizeCheckFailures(probe.catalogChecks),
    selectedEndpoint: probe.selectedCatalogEndpoint,
    checks: probe.catalogChecks,
  };
}

function buildInferenceDiagnosis(probe: BrainProbeResult, successSummary: string): RuntimeCheckDiagnosis {
  return {
    title: "推理状态",
    status: probe.inferenceOk ? "ready" : probe.inferenceChecks.length ? "warning" : "pending",
    summary: probe.inferenceOk ? successSummary : summarizeCheckFailures(probe.inferenceChecks),
    selectedEndpoint: probe.selectedInferenceEndpoint,
    checks: probe.inferenceChecks,
  };
}

function summarizeCheckFailures(checks: BrainEndpointCheck[]): string {
  if (!checks.length) {
    return "等待探针。";
  }
  const failed = checks.filter((item) => !item.ok);
  if (!failed.length) {
    return "所有候选接口都通过了。";
  }
  return failed
    .map((item) => {
      const reason = item.errorKind ? translateErrorKind(item.errorKind) : "未知错误";
      const status = item.statusCode ? ` (${item.statusCode})` : "";
      return `${translateCloudFlavor(item.flavor)} ${item.endpoint}${status}: ${reason}`;
    })
    .join("；");
}

function buildProtocolSummary(config: RuntimeDiagnosticSnapshot, probe: BrainProbeResult): string {
  if (config.mode !== "cloud") {
    return "本地模式固定走 Ollama Native。";
  }
  const selected = [probe.selectedCatalogEndpoint, probe.selectedInferenceEndpoint].filter(Boolean);
  if (selected.length) {
    return `当前 cloud protocol 为 ${translateCloudFlavor(config.cloudApiFlavor)}，已命中 ${selected.join(" + ")}。`;
  }
  return `当前 cloud protocol 为 ${translateCloudFlavor(config.cloudApiFlavor)}，但还没有命中稳定可用的接口。`;
}

export function translateCloudFlavor(value: CloudApiFlavor | "ollama_native" | "openai_compatible"): string {
  if (value === "ollama_native") {
    return "Ollama Native";
  }
  if (value === "openai_compatible") {
    return "OpenAI Compatible";
  }
  return "Auto";
}

export function translateErrorKind(value: BrainErrorKind): string {
  if (value === "missing_api_key") {
    return "缺少 API Key";
  }
  if (value === "unauthorized") {
    return "未授权";
  }
  if (value === "endpoint_not_supported") {
    return "协议未匹配";
  }
  if (value === "model_not_found") {
    return "模型不存在";
  }
  if (value === "network_error") {
    return "网络错误";
  }
  return "未知错误";
}
