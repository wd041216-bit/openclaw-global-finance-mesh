import type { CloudApiFlavor, BrainRuntimeConfig } from "./runtime-config.ts";

export interface BrainMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BrainChatResult {
  model: string;
  provider: "ollama-local" | "ollama-cloud";
  content: string;
  raw: Record<string, unknown>;
}

export type BrainErrorKind =
  | "missing_api_key"
  | "unauthorized"
  | "endpoint_not_supported"
  | "model_not_found"
  | "network_error"
  | "unknown";

export type BrainAuthStatus = "not_required" | "missing_api_key" | "authorized" | "unauthorized" | "unknown";
export type CloudApiFlavorResolved = Exclude<CloudApiFlavor, "auto">;

export interface BrainEndpointCheck {
  flavor: CloudApiFlavorResolved;
  endpoint: string;
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  authStatus: BrainAuthStatus;
  errorKind?: BrainErrorKind;
  error?: string;
  modelCount?: number;
  availableModels?: string[];
}

export interface BrainProbeResult {
  ok: boolean;
  mode: BrainRuntimeConfig["mode"];
  model: string;
  cloudApiFlavor: CloudApiFlavor;
  listModelsOk: boolean;
  inferenceOk: boolean;
  availableModels: string[];
  inferencePreview?: string;
  error?: string;
  errorKind?: BrainErrorKind;
  authStatus: BrainAuthStatus;
  selectedCatalogEndpoint?: string;
  selectedInferenceEndpoint?: string;
  catalogChecks: BrainEndpointCheck[];
  inferenceChecks: BrainEndpointCheck[];
  latencyMs?: number;
}

interface CatalogSuccess {
  ok: true;
  flavor: CloudApiFlavorResolved;
  endpoint: string;
  latencyMs: number;
  models: Array<{ name: string; digest?: string }>;
  payload: Record<string, unknown>;
}

interface InferenceSuccess {
  ok: true;
  flavor: CloudApiFlavorResolved;
  endpoint: string;
  latencyMs: number;
  payload: Record<string, unknown>;
  content: string;
}

interface RequestFailure {
  ok: false;
  flavor: CloudApiFlavorResolved;
  endpoint: string;
  latencyMs: number;
  error: string;
  errorKind: BrainErrorKind;
  authStatus: BrainAuthStatus;
  statusCode?: number;
}

type CatalogAttempt = CatalogSuccess | RequestFailure;
type InferenceAttempt = InferenceSuccess | RequestFailure;

interface EndpointDescriptor {
  flavor: CloudApiFlavorResolved;
  endpoint: string;
}

const NATIVE_CATALOG_ENDPOINT: EndpointDescriptor = {
  flavor: "ollama_native",
  endpoint: "/api/tags",
};
const OPENAI_CATALOG_ENDPOINT: EndpointDescriptor = {
  flavor: "openai_compatible",
  endpoint: "/v1/models",
};
const NATIVE_INFERENCE_ENDPOINT: EndpointDescriptor = {
  flavor: "ollama_native",
  endpoint: "/api/chat",
};
const OPENAI_INFERENCE_ENDPOINT: EndpointDescriptor = {
  flavor: "openai_compatible",
  endpoint: "/v1/chat/completions",
};

export class OllamaBrainRuntime {
  private cloudQueue: Promise<unknown> = Promise.resolve();

  async listModels(config: BrainRuntimeConfig): Promise<Array<{ name: string; digest?: string }>> {
    if (config.mode === "cloud") {
      const catalog = await this.runSerialized(() => this.resolveCatalog(config));
      if (!catalog) {
        throw new Error(buildCombinedFailureMessage("catalog", [], config));
      }
      if (!catalog.ok) {
        throw new Error(buildFailureMessage("catalog", catalog));
      }
      return catalog.models;
    }

    const catalog = await this.attemptCatalog(config, NATIVE_CATALOG_ENDPOINT);
    if (!catalog.ok) {
      throw new Error(buildFailureMessage("catalog", catalog));
    }
    return catalog.models;
  }

  async chat(config: BrainRuntimeConfig, messages: BrainMessage[]): Promise<BrainChatResult> {
    const runner = async () => {
      if (config.mode === "cloud") {
        const inference = await this.resolveInference(config, messages);
        if (!inference.ok) {
          throw new Error(buildFailureMessage("inference", inference));
        }
        return {
          model: config.model,
          provider: "ollama-cloud",
          content: inference.content,
          raw: {
            ...inference.payload,
            protocol: inference.flavor,
            endpoint: inference.endpoint,
            latencyMs: inference.latencyMs,
          },
        } satisfies BrainChatResult;
      }

      const inference = await this.attemptInference(config, NATIVE_INFERENCE_ENDPOINT, messages);
      if (!inference.ok) {
        throw new Error(buildFailureMessage("inference", inference));
      }
      return {
        model: config.model,
        provider: "ollama-local",
        content: inference.content,
        raw: {
          ...inference.payload,
          protocol: inference.flavor,
          endpoint: inference.endpoint,
          latencyMs: inference.latencyMs,
        },
      } satisfies BrainChatResult;
    };

    if (config.mode === "cloud") {
      return this.runSerialized(runner);
    }

    return runner();
  }

  async probe(config: BrainRuntimeConfig): Promise<BrainProbeResult> {
    if (config.mode === "local") {
      return this.probeLocal(config);
    }
    return this.runSerialized(() => this.probeCloud(config));
  }

  private async probeLocal(config: BrainRuntimeConfig): Promise<BrainProbeResult> {
    const catalogAttempt = await this.attemptCatalog(config, NATIVE_CATALOG_ENDPOINT);
    const catalogChecks = [toCheck(catalogAttempt)];
    if (!catalogAttempt.ok) {
      return {
        ok: false,
        mode: "local",
        model: config.model,
        cloudApiFlavor: config.cloudApiFlavor,
        listModelsOk: false,
        inferenceOk: false,
        availableModels: [],
        error: buildFailureMessage("catalog", catalogAttempt),
        errorKind: catalogAttempt.errorKind,
        authStatus: "not_required",
        catalogChecks,
        inferenceChecks: [],
      };
    }

    const inferenceAttempt = await this.attemptInference(config, NATIVE_INFERENCE_ENDPOINT, buildProbeMessages());
    const inferenceChecks = [toCheck(inferenceAttempt)];
    if (!inferenceAttempt.ok) {
      return {
        ok: false,
        mode: "local",
        model: config.model,
        cloudApiFlavor: config.cloudApiFlavor,
        listModelsOk: true,
        inferenceOk: false,
        availableModels: catalogAttempt.models.map((item) => item.name),
        error: buildFailureMessage("inference", inferenceAttempt),
        errorKind: inferenceAttempt.errorKind,
        authStatus: "not_required",
        selectedCatalogEndpoint: catalogAttempt.endpoint,
        catalogChecks,
        inferenceChecks,
      };
    }

    return {
      ok: true,
      mode: "local",
      model: config.model,
      cloudApiFlavor: config.cloudApiFlavor,
      listModelsOk: true,
      inferenceOk: true,
      availableModels: catalogAttempt.models.map((item) => item.name),
      inferencePreview: inferenceAttempt.content,
      authStatus: "not_required",
      selectedCatalogEndpoint: catalogAttempt.endpoint,
      selectedInferenceEndpoint: inferenceAttempt.endpoint,
      catalogChecks,
      inferenceChecks,
      latencyMs: inferenceAttempt.latencyMs,
    };
  }

  private async probeCloud(config: BrainRuntimeConfig): Promise<BrainProbeResult> {
    const catalogEndpoints = selectCatalogEndpoints(config);
    const inferenceEndpoints = selectInferenceEndpoints(config);
    const catalogAttempts: CatalogAttempt[] = [];
    for (const endpoint of catalogEndpoints) {
      catalogAttempts.push(await this.attemptCatalog(config, endpoint));
    }

    const inferenceAttempts: InferenceAttempt[] = [];
    for (const endpoint of inferenceEndpoints) {
      inferenceAttempts.push(await this.attemptInference(config, endpoint, buildProbeMessages()));
    }

    const successfulCatalog = catalogAttempts.find((attempt): attempt is CatalogSuccess => attempt.ok) ?? null;
    const successfulInference = inferenceAttempts.find((attempt): attempt is InferenceSuccess => attempt.ok) ?? null;
    const listModelsOk = Boolean(successfulCatalog);
    const inferenceOk = Boolean(successfulInference);
    const authStatus = summarizeAuthStatus([
      ...catalogAttempts.filter(isFailure),
      ...inferenceAttempts.filter(isFailure),
    ]);
    const primaryFailure = selectPrimaryFailure({
      catalogAttempts,
      inferenceAttempts,
      listModelsOk,
      inferenceOk,
    });

    return {
      ok: listModelsOk && inferenceOk,
      mode: "cloud",
      model: config.model,
      cloudApiFlavor: config.cloudApiFlavor,
      listModelsOk,
      inferenceOk,
      availableModels: successfulCatalog?.models.map((item) => item.name) ?? [],
      inferencePreview: successfulInference?.content,
      error: primaryFailure ? buildFailureMessage(primaryFailure.scope, primaryFailure.failure) : undefined,
      errorKind: primaryFailure?.failure.errorKind,
      authStatus,
      selectedCatalogEndpoint: successfulCatalog?.endpoint,
      selectedInferenceEndpoint: successfulInference?.endpoint,
      catalogChecks: catalogAttempts.map(toCheck),
      inferenceChecks: inferenceAttempts.map(toCheck),
      latencyMs: successfulInference?.latencyMs,
    };
  }

  private async resolveCatalog(config: BrainRuntimeConfig): Promise<CatalogAttempt> {
    const attempts: CatalogAttempt[] = [];
    for (const endpoint of selectCatalogEndpoints(config)) {
      const attempt = await this.attemptCatalog(config, endpoint);
      attempts.push(attempt);
      if (attempt.ok) {
        return attempt;
      }
    }
    return attempts[0] ?? {
      ok: false,
      flavor: "ollama_native",
      endpoint: NATIVE_CATALOG_ENDPOINT.endpoint,
      latencyMs: 0,
      error: buildCombinedFailureMessage("catalog", attempts, config),
      errorKind: "unknown",
      authStatus: config.mode === "cloud" ? "unknown" : "not_required",
    };
  }

  private async resolveInference(config: BrainRuntimeConfig, messages: BrainMessage[]): Promise<InferenceAttempt> {
    const attempts: InferenceAttempt[] = [];
    for (const endpoint of selectInferenceEndpoints(config)) {
      const attempt = await this.attemptInference(config, endpoint, messages);
      attempts.push(attempt);
      if (attempt.ok) {
        return attempt;
      }
    }
    return attempts[0] ?? {
      ok: false,
      flavor: "ollama_native",
      endpoint: NATIVE_INFERENCE_ENDPOINT.endpoint,
      latencyMs: 0,
      error: buildCombinedFailureMessage("inference", attempts, config),
      errorKind: "unknown",
      authStatus: config.mode === "cloud" ? "unknown" : "not_required",
    };
  }

  private async attemptCatalog(config: BrainRuntimeConfig, descriptor: EndpointDescriptor): Promise<CatalogAttempt> {
    const response = await this.requestJson(config, descriptor, {
      method: "GET",
    });
    if (!response.ok) {
      return response;
    }

    const models = parseModels(response.payload, descriptor.flavor);
    return {
      ok: true,
      flavor: descriptor.flavor,
      endpoint: descriptor.endpoint,
      latencyMs: response.latencyMs,
      models,
      payload: response.payload,
    };
  }

  private async attemptInference(
    config: BrainRuntimeConfig,
    descriptor: EndpointDescriptor,
    messages: BrainMessage[],
  ): Promise<InferenceAttempt> {
    const response = await this.requestJson(config, descriptor, {
      method: "POST",
      body: JSON.stringify(buildChatBody(config, descriptor.flavor, messages)),
    });
    if (!response.ok) {
      return response;
    }

    return {
      ok: true,
      flavor: descriptor.flavor,
      endpoint: descriptor.endpoint,
      latencyMs: response.latencyMs,
      payload: response.payload,
      content: parseChatContent(response.payload, descriptor.flavor),
    };
  }

  private async requestJson(
    config: BrainRuntimeConfig,
    descriptor: EndpointDescriptor,
    init: RequestInit,
  ): Promise<
    | {
        ok: true;
        payload: Record<string, unknown>;
        latencyMs: number;
      }
    | RequestFailure
  > {
    if (config.mode === "cloud" && !config.apiKey) {
      return {
        ok: false,
        flavor: descriptor.flavor,
        endpoint: descriptor.endpoint,
        latencyMs: 0,
        error: "Cloud runtime requires an API key.",
        errorKind: "missing_api_key",
        authStatus: "missing_api_key",
      };
    }

    const baseUrl = config.mode === "cloud" ? config.cloudBaseUrl : config.localBaseUrl;
    const url = `${baseUrl}${descriptor.endpoint}`;
    const headers = new Headers(init.headers ?? {});
    headers.set("Content-Type", "application/json");

    if (config.mode === "cloud" && config.apiKey) {
      headers.set("Authorization", `Bearer ${config.apiKey}`);
    }

    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        ...init,
        headers,
      });
      const latencyMs = Date.now() - startedAt;
      if (!response.ok) {
        const text = await response.text();
        return {
          ok: false,
          flavor: descriptor.flavor,
          endpoint: descriptor.endpoint,
          latencyMs,
          statusCode: response.status,
          error: text.slice(0, 400) || `${response.status} ${response.statusText}`.trim(),
          errorKind: classifyHttpError(response.status, text),
          authStatus: response.status === 401 || response.status === 403 ? "unauthorized" : "authorized",
        };
      }

      return {
        ok: true,
        payload: (await response.json()) as Record<string, unknown>,
        latencyMs,
      };
    } catch (error) {
      return {
        ok: false,
        flavor: descriptor.flavor,
        endpoint: descriptor.endpoint,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        errorKind: "network_error",
        authStatus: config.mode === "cloud" ? "unknown" : "not_required",
      };
    }
  }

  private runSerialized<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = this.cloudQueue.then(task, task);
    this.cloudQueue = nextTask.then(
      () => undefined,
      () => undefined,
    );
    return nextTask;
  }
}

function selectCatalogEndpoints(config: BrainRuntimeConfig): EndpointDescriptor[] {
  if (config.mode !== "cloud") {
    return [NATIVE_CATALOG_ENDPOINT];
  }
  if (config.cloudApiFlavor === "ollama_native") {
    return [NATIVE_CATALOG_ENDPOINT];
  }
  if (config.cloudApiFlavor === "openai_compatible") {
    return [OPENAI_CATALOG_ENDPOINT];
  }
  return [NATIVE_CATALOG_ENDPOINT, OPENAI_CATALOG_ENDPOINT];
}

function selectInferenceEndpoints(config: BrainRuntimeConfig): EndpointDescriptor[] {
  if (config.mode !== "cloud") {
    return [NATIVE_INFERENCE_ENDPOINT];
  }
  if (config.cloudApiFlavor === "ollama_native") {
    return [NATIVE_INFERENCE_ENDPOINT];
  }
  if (config.cloudApiFlavor === "openai_compatible") {
    return [OPENAI_INFERENCE_ENDPOINT];
  }
  return [NATIVE_INFERENCE_ENDPOINT, OPENAI_INFERENCE_ENDPOINT];
}

function buildProbeMessages(): BrainMessage[] {
  return [
    {
      role: "user",
      content: "Reply with exactly: cloud ok",
    },
  ];
}

function buildChatBody(
  config: BrainRuntimeConfig,
  flavor: CloudApiFlavorResolved,
  messages: BrainMessage[],
): Record<string, unknown> {
  if (flavor === "openai_compatible") {
    return {
      model: config.model,
      messages,
      stream: false,
      temperature: config.temperature,
    };
  }

  return {
    model: config.model,
    stream: false,
    messages,
    options: {
      temperature: config.temperature,
    },
  };
}

function parseModels(
  payload: Record<string, unknown>,
  flavor: CloudApiFlavorResolved,
): Array<{ name: string; digest?: string }> {
  if (flavor === "openai_compatible") {
    const models = Array.isArray(payload.data) ? payload.data : [];
    return models
      .map((item) => {
        const record = item as Record<string, unknown>;
        const name = typeof record.id === "string" ? record.id : "";
        const digest = typeof record.owned_by === "string" ? record.owned_by : undefined;
        return { name, digest };
      })
      .filter((item) => item.name);
  }

  const models = Array.isArray(payload.models) ? payload.models : [];
  return models
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        name: typeof record.name === "string" ? record.name : "",
        digest: typeof record.digest === "string" ? record.digest : undefined,
      };
    })
    .filter((item) => item.name);
}

function parseChatContent(payload: Record<string, unknown>, flavor: CloudApiFlavorResolved): string {
  if (flavor === "openai_compatible") {
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const message = choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>).message
      : null;
    if (!message || typeof message !== "object") {
      return "";
    }
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string") {
            return String((item as Record<string, unknown>).text);
          }
          return "";
        })
        .join("")
        .trim();
    }
    return "";
  }

  return String(((payload.message as Record<string, unknown> | undefined)?.content ?? ""));
}

function classifyHttpError(status: number, text: string): BrainErrorKind {
  const normalized = text.toLowerCase();
  if (normalized.includes("model") && normalized.includes("not found")) {
    return "model_not_found";
  }
  if (status === 401 || status === 403) {
    return "unauthorized";
  }
  if (status === 404 || status === 405) {
    return "endpoint_not_supported";
  }
  return "unknown";
}

function buildFailureMessage(scope: "catalog" | "inference", failure: RequestFailure): string {
  const prefix = scope === "catalog" ? "Catalog request failed" : "Inference request failed";
  const kind = failure.errorKind.replaceAll("_", " ");
  const status = failure.statusCode ? ` (${failure.statusCode})` : "";
  return `${prefix}${status} via ${failure.flavor} ${failure.endpoint}: ${kind}. ${failure.error}`.trim();
}

function buildCombinedFailureMessage(
  scope: "catalog" | "inference",
  failures: Array<RequestFailure | CatalogAttempt | InferenceAttempt>,
  config: BrainRuntimeConfig,
): string {
  const normalizedFailures = failures.filter(isFailure);
  if (normalizedFailures.length === 0) {
    return `${scope === "catalog" ? "Catalog" : "Inference"} request failed for ${config.mode} runtime.`;
  }
  return normalizedFailures
    .map((failure) => buildFailureMessage(scope, failure))
    .join(" | ");
}

function selectPrimaryFailure(input: {
  catalogAttempts: CatalogAttempt[];
  inferenceAttempts: InferenceAttempt[];
  listModelsOk: boolean;
  inferenceOk: boolean;
}): { scope: "catalog" | "inference"; failure: RequestFailure } | null {
  if (input.listModelsOk && !input.inferenceOk) {
    return firstFailure(input.inferenceAttempts, "inference");
  }
  if (!input.listModelsOk) {
    return firstFailure(input.catalogAttempts, "catalog");
  }
  return null;
}

function firstFailure(
  attempts: Array<CatalogAttempt | InferenceAttempt>,
  scope: "catalog" | "inference",
): { scope: "catalog" | "inference"; failure: RequestFailure } | null {
  const failure = attempts.find(isFailure);
  return failure ? { scope, failure } : null;
}

function summarizeAuthStatus(failures: RequestFailure[]): BrainAuthStatus {
  if (failures.some((item) => item.authStatus === "missing_api_key")) {
    return "missing_api_key";
  }
  if (failures.some((item) => item.authStatus === "unauthorized")) {
    return "unauthorized";
  }
  if (failures.length === 0) {
    return "authorized";
  }
  if (failures.every((item) => item.authStatus === "authorized")) {
    return "authorized";
  }
  return "unknown";
}

function toCheck(attempt: CatalogAttempt | InferenceAttempt): BrainEndpointCheck {
  if (attempt.ok) {
    return {
      flavor: attempt.flavor,
      endpoint: attempt.endpoint,
      ok: true,
      latencyMs: attempt.latencyMs,
      authStatus: "authorized",
      modelCount: "models" in attempt ? attempt.models.length : undefined,
      availableModels: "models" in attempt ? attempt.models.map((item) => item.name) : undefined,
    };
  }

  return {
    flavor: attempt.flavor,
    endpoint: attempt.endpoint,
    ok: false,
    latencyMs: attempt.latencyMs,
    statusCode: attempt.statusCode,
    authStatus: attempt.authStatus,
    errorKind: attempt.errorKind,
    error: attempt.error,
  };
}

function isFailure(attempt: CatalogAttempt | InferenceAttempt): attempt is RequestFailure {
  return !attempt.ok;
}
