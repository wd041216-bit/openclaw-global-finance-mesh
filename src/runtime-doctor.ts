import type { BrainProbeResult, CloudApiFlavorResolved } from "./brain.ts";
import type { CloudApiFlavor } from "./runtime-config.ts";
import {
  buildRuntimeDiagnosis,
  translateCloudFlavor,
  translateErrorKind,
  type RuntimeDiagnosticSnapshot,
  type RuntimeDiagnosis,
} from "./runtime-diagnostics.ts";

export interface RuntimeDoctorSnapshot extends RuntimeDiagnosticSnapshot {
  localBaseUrl: string;
  cloudBaseUrl: string;
}

export interface RuntimeDoctorProviderGuess {
  id:
    | "local_ollama"
    | "ollama_cloud"
    | "openai_compatible_gateway"
    | "azure_openai_gateway"
    | "custom_cloud";
  label: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface RuntimeDoctorCommand {
  id: string;
  scope: "catalog" | "inference";
  flavor: CloudApiFlavorResolved;
  endpoint: string;
  title: string;
  command: string;
  expectedOutcome: string;
}

export interface RuntimeDoctorReport {
  summary: string;
  provider: RuntimeDoctorProviderGuess;
  verificationStatus:
    | "not_verified"
    | "local_ready"
    | "local_attention"
    | "fully_usable"
    | "catalog_only_entitlement_blocked"
    | "cloud_unauthorized"
    | "protocol_mismatch"
    | "model_visibility_gap"
    | "network_or_tls_failure";
  verificationLabel: string;
  lastVerifiedAt?: string;
  currentFlavor: CloudApiFlavor;
  currentFlavorLabel: string;
  recommendedFlavor: CloudApiFlavor;
  recommendedFlavorLabel: string;
  validatedFlavor?: CloudApiFlavorResolved;
  validatedFlavorLabel?: string;
  catalogAccess: "ready" | "blocked" | "not_checked";
  inferenceAccess: "ready" | "blocked" | "not_checked";
  blockedReason?: string;
  recommendedAction: string;
  configuredModelVisible: boolean;
  visibleModelCount: number;
  visibleModels: string[];
  suggestedModels: string[];
  operatorChecklist: string[];
  manualChecks: RuntimeDoctorCommand[];
  escalationTitle?: string;
  escalationNote?: string;
  escalationTemplate?: string;
}

export function buildRuntimeDoctorReport(
  config: RuntimeDoctorSnapshot,
  probe?: BrainProbeResult | null,
  diagnosis: RuntimeDiagnosis = buildRuntimeDiagnosis(config, probe),
  options?: { lastVerifiedAt?: string },
): RuntimeDoctorReport {
  const provider = guessProvider(config, probe);
  const visibleModels = uniqueStrings(probe?.availableModels ?? []);
  const configuredModelVisible = visibleModels.some((item) => normalizeModelName(item) === normalizeModelName(config.model));
  const suggestedModels = configuredModelVisible
    ? []
    : rankSuggestedModels(config.model, visibleModels).slice(0, 3);
  const validatedFlavor = detectValidatedFlavor(probe);
  const recommendedFlavor = selectRecommendedFlavor(config, diagnosis, validatedFlavor);
  const escalation = buildEscalation(config, diagnosis, probe, recommendedFlavor);
  const verificationStatus = determineVerificationStatus(config, diagnosis);

  return {
    summary: diagnosis.summary,
    provider,
    verificationStatus,
    verificationLabel: translateVerificationStatus(verificationStatus),
    lastVerifiedAt: options?.lastVerifiedAt,
    currentFlavor: config.cloudApiFlavor,
    currentFlavorLabel: translateCloudFlavor(config.cloudApiFlavor),
    recommendedFlavor,
    recommendedFlavorLabel: translateCloudFlavor(recommendedFlavor),
    validatedFlavor: validatedFlavor || undefined,
    validatedFlavorLabel: validatedFlavor ? translateCloudFlavor(validatedFlavor) : undefined,
    catalogAccess: determineAccessStatus(probe?.listModelsOk, probe?.catalogChecks.length),
    inferenceAccess: determineAccessStatus(probe?.inferenceOk, probe?.inferenceChecks.length),
    blockedReason: buildBlockedReason(config, diagnosis, configuredModelVisible),
    recommendedAction: diagnosis.nextActionTitle,
    configuredModelVisible,
    visibleModelCount: visibleModels.length,
    visibleModels,
    suggestedModels,
    operatorChecklist: buildChecklist(config, diagnosis, recommendedFlavor, configuredModelVisible, suggestedModels),
    manualChecks: buildManualChecks(config, diagnosis, probe, recommendedFlavor),
    ...escalation,
    escalationTemplate: escalation.escalationNote,
  };
}

function guessProvider(
  config: RuntimeDoctorSnapshot,
  probe?: BrainProbeResult | null,
): RuntimeDoctorProviderGuess {
  const baseUrl = config.mode === "cloud" ? config.cloudBaseUrl : config.localBaseUrl;
  const host = parseHost(baseUrl);

  if (config.mode === "local") {
    return {
      id: "local_ollama",
      label: "本地 Ollama",
      confidence: "high",
      reason: "当前运行时处于 local 模式，固定通过本地 Ollama 暴露目录和推理接口。",
    };
  }

  if (host.includes("ollama.com")) {
    return {
      id: "ollama_cloud",
      label: "Ollama Cloud",
      confidence: "high",
      reason: "cloudBaseUrl 指向 ollama.com，和当前探针的协议形态一致。",
    };
  }

  if (host.includes("openai.com")) {
    return {
      id: "openai_compatible_gateway",
      label: "OpenAI Compatible Service",
      confidence: "high",
      reason: "cloudBaseUrl 命中了 openai.com，默认更像 OpenAI Compatible 接口。",
    };
  }

  if (host.includes("azure.com")) {
    return {
      id: "azure_openai_gateway",
      label: "Azure-hosted OpenAI Compatible Gateway",
      confidence: "medium",
      reason: "cloudBaseUrl 命中了 azure.com，通常需要按 OpenAI Compatible 方式探测。",
    };
  }

  const validatedFlavor = detectValidatedFlavor(probe);
  if (validatedFlavor === "openai_compatible" || config.cloudApiFlavor === "openai_compatible") {
    return {
      id: "openai_compatible_gateway",
      label: "OpenAI Compatible Gateway",
      confidence: validatedFlavor ? "medium" : "low",
      reason: validatedFlavor
        ? "最近一次探针已经命中 OpenAI Compatible 目录或推理接口。"
        : "当前 cloud protocol 被显式配置成 openai_compatible。",
    };
  }

  if (validatedFlavor === "ollama_native" || config.cloudApiFlavor === "ollama_native") {
    return {
      id: "custom_cloud",
      label: "Custom Ollama-native Gateway",
      confidence: validatedFlavor ? "medium" : "low",
      reason: validatedFlavor
        ? "最近一次探针已经命中 Ollama Native 目录或推理接口。"
        : "当前 cloud protocol 被显式配置成 ollama_native。",
    };
  }

  return {
    id: "custom_cloud",
    label: "Custom Cloud Provider",
    confidence: "low",
    reason: "Base URL 不是已知托管域名，当前更像自定义 provider 或企业网关。",
  };
}

function buildChecklist(
  config: RuntimeDoctorSnapshot,
  diagnosis: RuntimeDiagnosis,
  recommendedFlavor: CloudApiFlavor,
  configuredModelVisible: boolean,
  suggestedModels: string[],
): string[] {
  switch (diagnosis.businessStatusCode) {
    case "cloud_ok":
      return [
        `记录当前已验证的协议 ${translateCloudFlavor(recommendedFlavor)} 和模型 ${config.model}，避免团队下次重新猜。`,
        "把同一套配置再跑一次真实业务请求，而不只是探针。",
        "如果后续换 provider 或 base URL，先重新执行云端联调报告。",
      ];
    case "catalog_only":
      return [
        "先保持当前能读到目录的协议，不要把 entitlement 问题误判成 endpoint 问题。",
        "执行下方推理命令，确认它仍然返回 401 unauthorized。",
        "把目录 200 + 推理 401 的结果发给 provider，要求确认 inference entitlement。",
      ];
    case "unauthorized":
      return diagnosis.errorKind === "missing_api_key"
        ? [
            "先在系统设置里填入 API Key，然后重新执行云端探针。",
            "确认浏览器里只是临时使用，还是要持久化到本地 secrets。",
          ]
        : [
            "先用下方目录和推理命令确认到底是全局未授权，还是只有推理未授权。",
            "如果两条命令都返回 401，就优先排查账号或 key 权限。",
          ];
    case "protocol_mismatch":
      return [
        "优先把 cloud protocol 切到 auto，重新执行探针。",
        "如果 auto 仍然失败，再分别尝试 ollama_native 和 openai_compatible。",
        "只有三种协议都失败时，才值得继续改代码或怀疑 provider 网关。",
      ];
    case "model_not_found":
      return [
        "先读取当前 provider 暴露的模型目录，不要继续沿用旧模型名。",
        suggestedModels.length
          ? `优先尝试这些更接近的模型名：${suggestedModels.join(" / ")}。`
          : "当前没有足够的模型列表来给出替代名，先重新读取目录。",
        configuredModelVisible
          ? "模型名已经出现在目录里，下一步要检查推理侧到底是协议还是权限问题。"
          : `把运行时模型改成 provider 实际可见的名称，再重新探针。`,
      ];
    case "network_error":
      return [
        "先在当前部署环境直接执行下方目录命令，确认请求是否真的能到达 provider。",
        "核对 cloudBaseUrl、DNS、TLS、中间代理和公司网络出口策略。",
        "网络问题修复后，再用同一份联调报告复核目录和推理。",
      ];
    case "pending":
      return [
        "先执行一次探针，让系统拿到目录与推理两条链路的真实结果。",
        `当前建议先按 ${translateCloudFlavor(recommendedFlavor)} 这条协议开始排查。`,
      ];
    default:
      return config.mode === "local"
        ? [
            "确认本地 Ollama 已启动，且模型已经下载完成。",
            "如果今天换过本地模型名，先重跑一次本地探针。",
          ]
        : [
            diagnosis.nextActionTitle,
            ...diagnosis.recommendedActions,
          ];
  }
}

function buildManualChecks(
  config: RuntimeDoctorSnapshot,
  diagnosis: RuntimeDiagnosis,
  probe: BrainProbeResult | null | undefined,
  recommendedFlavor: CloudApiFlavor,
): RuntimeDoctorCommand[] {
  const commands = new Map<string, RuntimeDoctorCommand>();
  const checks = [
    ...(probe?.catalogChecks ?? []).map((item) => ({ scope: "catalog" as const, flavor: item.flavor, endpoint: item.endpoint })),
    ...(probe?.inferenceChecks ?? []).map((item) => ({ scope: "inference" as const, flavor: item.flavor, endpoint: item.endpoint })),
  ];

  const descriptors = checks.length
    ? checks
    : buildDefaultDescriptors(config.mode, recommendedFlavor);

  for (const descriptor of descriptors) {
    const key = `${descriptor.scope}:${descriptor.flavor}:${descriptor.endpoint}`;
    if (commands.has(key)) {
      continue;
    }
    commands.set(key, {
      id: key,
      scope: descriptor.scope,
      flavor: descriptor.flavor,
      endpoint: descriptor.endpoint,
      title: descriptor.scope === "catalog"
        ? `验证 ${translateCloudFlavor(descriptor.flavor)} 目录接口`
        : `验证 ${translateCloudFlavor(descriptor.flavor)} 推理接口`,
      command: buildCurlCommand(config, descriptor.scope, descriptor.flavor, descriptor.endpoint),
      expectedOutcome: buildExpectedOutcome(diagnosis, descriptor.scope),
    });
  }

  return Array.from(commands.values());
}

function buildEscalation(
  config: RuntimeDoctorSnapshot,
  diagnosis: RuntimeDiagnosis,
  probe: BrainProbeResult | null | undefined,
  recommendedFlavor: CloudApiFlavor,
): Pick<RuntimeDoctorReport, "escalationTitle" | "escalationNote"> {
  if (diagnosis.businessStatusCode === "catalog_only" || diagnosis.businessStatusCode === "unauthorized") {
    const catalogEndpoint = probe?.selectedCatalogEndpoint || guessEndpoint("catalog", recommendedFlavor);
    const inferenceEndpoint = probe?.selectedInferenceEndpoint || guessEndpoint("inference", recommendedFlavor);
    return {
      escalationTitle: "可直接发给 provider 的描述",
      escalationNote:
        `我们当前在 ${config.cloudBaseUrl} 上使用 ${translateCloudFlavor(recommendedFlavor)} 协议联调。` +
        ` 模型目录通过 ${catalogEndpoint} 可读，但推理接口 ${inferenceEndpoint} ` +
        `${diagnosis.businessStatusCode === "catalog_only" ? "返回 401 unauthorized" : `仍然表现为 ${translateErrorKind(diagnosis.errorKind || "unknown")}`}` +
        `。当前模型为 ${config.model}，请协助确认账号或 API key 是否具备 inference entitlement。`,
    };
  }

  if (diagnosis.businessStatusCode === "network_error") {
    return {
      escalationTitle: "可直接发给平台 / 网络团队的描述",
      escalationNote:
        `当前控制面从 ${config.cloudBaseUrl} 发起云端目录与推理请求时表现为网络失败。` +
        " 请协助检查当前部署环境到 provider 的 DNS、TLS、中间代理或出网策略。",
    };
  }

  return {};
}

function determineVerificationStatus(
  config: RuntimeDoctorSnapshot,
  diagnosis: RuntimeDiagnosis,
): RuntimeDoctorReport["verificationStatus"] {
  if (config.mode === "local") {
    return diagnosis.businessStatusCode === "local_ok" ? "local_ready" : "local_attention";
  }

  switch (diagnosis.businessStatusCode) {
    case "cloud_ok":
      return "fully_usable";
    case "catalog_only":
      return "catalog_only_entitlement_blocked";
    case "unauthorized":
      return "cloud_unauthorized";
    case "protocol_mismatch":
      return "protocol_mismatch";
    case "model_not_found":
      return "model_visibility_gap";
    case "network_error":
      return "network_or_tls_failure";
    default:
      return "not_verified";
  }
}

function translateVerificationStatus(
  status: RuntimeDoctorReport["verificationStatus"],
): string {
  switch (status) {
    case "local_ready":
      return "本地模式正常";
    case "local_attention":
      return "本地模式待处理";
    case "fully_usable":
      return "云端可用";
    case "catalog_only_entitlement_blocked":
      return "仅目录可用";
    case "cloud_unauthorized":
      return "云端未授权";
    case "protocol_mismatch":
      return "协议未匹配";
    case "model_visibility_gap":
      return "模型不可用";
    case "network_or_tls_failure":
      return "网络或 TLS 失败";
    default:
      return "等待验证";
  }
}

function determineAccessStatus(
  ok: boolean | undefined,
  checkCount: number | undefined,
): RuntimeDoctorReport["catalogAccess"] {
  if (ok === true) {
    return "ready";
  }
  if ((checkCount || 0) > 0) {
    return "blocked";
  }
  return "not_checked";
}

function buildBlockedReason(
  config: RuntimeDoctorSnapshot,
  diagnosis: RuntimeDiagnosis,
  configuredModelVisible: boolean,
): string | undefined {
  if (config.mode === "local" && diagnosis.businessStatusCode === "local_attention") {
    if (!configuredModelVisible) {
      return `当前本地模型 ${config.model} 不在目录里。`;
    }
    return diagnosis.summary;
  }
  if (diagnosis.businessStatusCode === "cloud_ok") {
    return undefined;
  }
  return diagnosis.summary;
}

function buildCurlCommand(
  config: RuntimeDoctorSnapshot,
  scope: "catalog" | "inference",
  flavor: CloudApiFlavorResolved,
  endpoint: string,
): string {
  const baseUrl = config.mode === "cloud" ? config.cloudBaseUrl : config.localBaseUrl;
  const authHeader = config.mode === "cloud"
    ? "  -H \"Authorization: Bearer ${OLLAMA_API_KEY}\" \\\n"
    : "";

  if (scope === "catalog") {
    return [
      "curl -i -sS \\",
      authHeader.trimEnd() || "",
      `  "${baseUrl}${endpoint}"`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const body = flavor === "openai_compatible"
    ? JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "Return the single word ready." }],
      })
    : JSON.stringify({
        model: config.model,
        stream: false,
        messages: [{ role: "user", content: "Return the single word ready." }],
      });

  return [
    "curl -i -sS \\",
    authHeader.trimEnd() || "",
    "  -H \"Content-Type: application/json\" \\",
    `  -d '${body}' \\`,
    `  "${baseUrl}${endpoint}"`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildExpectedOutcome(
  diagnosis: RuntimeDiagnosis,
  scope: "catalog" | "inference",
): string {
  if (scope === "catalog") {
    if (diagnosis.businessStatusCode === "protocol_mismatch") {
      return "如果这里是 404 / 405，而另一种协议可用，说明要切换 cloud protocol。";
    }
    return "期待返回 200 和模型目录；如果这里只有 401，说明连目录权限都没有开。";
  }

  if (diagnosis.businessStatusCode === "catalog_only") {
    return "如果这里继续是 401，而目录命令是 200，说明问题在推理 entitlement。";
  }
  if (diagnosis.businessStatusCode === "protocol_mismatch") {
    return "如果这里是 404 / 405，优先切换协议而不是继续改代码。";
  }
  if (diagnosis.businessStatusCode === "model_not_found") {
    return "如果这里提示模型不存在，优先把模型名改成目录里真实可见的名称。";
  }
  return "期待返回 200 和一条最小推理结果；否则继续按错误分类排查。";
}

function buildDefaultDescriptors(
  mode: RuntimeDoctorSnapshot["mode"],
  recommendedFlavor: CloudApiFlavor,
): Array<{ scope: "catalog" | "inference"; flavor: CloudApiFlavorResolved; endpoint: string }> {
  if (mode === "local") {
    return [
      { scope: "catalog", flavor: "ollama_native", endpoint: "/api/tags" },
      { scope: "inference", flavor: "ollama_native", endpoint: "/api/chat" },
    ];
  }

  if (recommendedFlavor === "ollama_native") {
    return [
      { scope: "catalog", flavor: "ollama_native", endpoint: "/api/tags" },
      { scope: "inference", flavor: "ollama_native", endpoint: "/api/chat" },
    ];
  }

  if (recommendedFlavor === "openai_compatible") {
    return [
      { scope: "catalog", flavor: "openai_compatible", endpoint: "/v1/models" },
      { scope: "inference", flavor: "openai_compatible", endpoint: "/v1/chat/completions" },
    ];
  }

  return [
    { scope: "catalog", flavor: "ollama_native", endpoint: "/api/tags" },
    { scope: "inference", flavor: "ollama_native", endpoint: "/api/chat" },
    { scope: "catalog", flavor: "openai_compatible", endpoint: "/v1/models" },
    { scope: "inference", flavor: "openai_compatible", endpoint: "/v1/chat/completions" },
  ];
}

function selectRecommendedFlavor(
  config: RuntimeDoctorSnapshot,
  diagnosis: RuntimeDiagnosis,
  validatedFlavor: CloudApiFlavorResolved | null,
): CloudApiFlavor {
  if (config.mode === "local") {
    return "ollama_native";
  }
  if (validatedFlavor && diagnosis.businessStatusCode !== "protocol_mismatch") {
    return validatedFlavor;
  }

  if (diagnosis.businessStatusCode === "protocol_mismatch") {
    return "auto";
  }

  return config.cloudApiFlavor;
}

function detectValidatedFlavor(probe?: BrainProbeResult | null): CloudApiFlavorResolved | null {
  if (!probe) {
    return null;
  }
  if (probe.selectedInferenceEndpoint?.startsWith("/v1/")) {
    return "openai_compatible";
  }
  if (probe.selectedInferenceEndpoint?.startsWith("/api/")) {
    return "ollama_native";
  }
  if (probe.selectedCatalogEndpoint?.startsWith("/v1/")) {
    return "openai_compatible";
  }
  if (probe.selectedCatalogEndpoint?.startsWith("/api/")) {
    return "ollama_native";
  }
  const successfulCatalog = probe.catalogChecks.find((item) => item.ok);
  const successfulInference = probe.inferenceChecks.find((item) => item.ok);
  return successfulInference?.flavor || successfulCatalog?.flavor || null;
}

function guessEndpoint(scope: "catalog" | "inference", flavor: CloudApiFlavor): string {
  if (scope === "catalog") {
    if (flavor === "openai_compatible") {
      return "/v1/models";
    }
    return "/api/tags";
  }
  if (flavor === "openai_compatible") {
    return "/v1/chat/completions";
  }
  return "/api/chat";
}

function parseHost(input: string): string {
  try {
    return new URL(input).host.toLowerCase();
  } catch {
    return input.toLowerCase();
  }
}

function normalizeModelName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rankSuggestedModels(target: string, models: string[]): string[] {
  const normalizedTarget = normalizeModelName(target);
  return [...models]
    .map((item) => ({
      item,
      score: scoreModel(normalizedTarget, normalizeModelName(item)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.localeCompare(right.item))
    .map((entry) => entry.item);
}

function scoreModel(target: string, candidate: string): number {
  if (!target || !candidate) {
    return 0;
  }
  if (target === candidate) {
    return 100;
  }
  if (candidate.includes(target) || target.includes(candidate)) {
    return 80;
  }

  let overlap = 0;
  for (const char of new Set(target.split(""))) {
    if (candidate.includes(char)) {
      overlap += 1;
    }
  }

  if (!overlap) {
    return 0;
  }

  const prefixBonus = commonPrefixLength(target, candidate);
  return overlap * 5 + prefixBonus * 8;
}

function commonPrefixLength(left: string, right: string): number {
  const size = Math.min(left.length, right.length);
  let count = 0;
  for (let index = 0; index < size; index += 1) {
    if (left[index] !== right[index]) {
      break;
    }
    count += 1;
  }
  return count;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
