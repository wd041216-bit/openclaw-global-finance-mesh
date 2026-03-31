import fs from "node:fs/promises";
import path from "node:path";

import { OllamaBrainRuntime } from "../src/brain.ts";
import { RuntimeConfigStore, type BrainRuntimeConfig, type CloudApiFlavor } from "../src/runtime-config.ts";
import { buildRuntimeDiagnosis } from "../src/runtime-diagnostics.ts";
import { buildRuntimeDoctorReport } from "../src/runtime-doctor.ts";

function parseArgs(argv: string[]) {
  const result: { out?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--out" && argv[index + 1]) {
      result.out = argv[index + 1];
      index += 1;
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtimeStore = new RuntimeConfigStore();
  const runtime = new OllamaBrainRuntime();
  const storedConfig = await runtimeStore.get();
  const config = applyRuntimeEnvOverrides(storedConfig);
  const publicConfig = toPublicConfig(config);
  const usingEnvOverrides = hasRuntimeEnvOverrides();

  if (config.mode !== "cloud") {
    const skipped = {
      skipped: true,
      reason: "runtime mode is not cloud",
      mode: config.mode,
      model: config.model,
      provider: "unknown",
      verificationStatus: "not_verified",
      goLiveReady: false,
      goLiveBlockers: ["当前还没有切到 Ollama Cloud 试点路径。"],
      recommendedAction: "先把运行时切到 cloud 模式，再执行真实 provider 联调。",
      usingEnvOverrides,
    };
    await emitResult(skipped, args.out);
    return;
  }

  const checkedAt = new Date().toISOString();
  const probe = await runtime.probe(config);
  const diagnosis = buildRuntimeDiagnosis(
    {
      mode: publicConfig.mode,
      model: publicConfig.model,
      hasApiKey: publicConfig.hasApiKey,
      cloudApiFlavor: publicConfig.cloudApiFlavor,
    },
    probe,
  );
  const doctorReport = buildRuntimeDoctorReport(
    {
      mode: publicConfig.mode,
      model: publicConfig.model,
      hasApiKey: publicConfig.hasApiKey,
      localBaseUrl: publicConfig.localBaseUrl,
      cloudBaseUrl: publicConfig.cloudBaseUrl,
      cloudApiFlavor: publicConfig.cloudApiFlavor,
    },
    probe,
    diagnosis,
    {
      lastVerifiedAt: checkedAt,
    },
  );

  const verification = {
    checkedAt,
    mode: publicConfig.mode,
    model: publicConfig.model,
    cloudBaseUrl: publicConfig.cloudBaseUrl,
    provider: doctorReport.provider,
    verificationStatus: doctorReport.verificationStatus,
    verificationLabel: doctorReport.verificationLabel,
    verifiedModel: doctorReport.verifiedModel,
    currentFlavor: doctorReport.currentFlavor,
    currentFlavorLabel: doctorReport.currentFlavorLabel,
    validatedFlavor: doctorReport.validatedFlavor,
    validatedFlavorLabel: doctorReport.validatedFlavorLabel,
    goLiveReady: doctorReport.goLiveReady,
    goLiveBlockers: doctorReport.goLiveBlockers,
    requiresProviderAction: doctorReport.requiresProviderAction,
    catalog: {
      access: doctorReport.catalogAccess,
      ok: probe.listModelsOk,
      selectedEndpoint: probe.selectedCatalogEndpoint,
      summary: diagnosis.catalog.summary,
    },
    inference: {
      access: doctorReport.inferenceAccess,
      ok: probe.inferenceOk,
      selectedEndpoint: probe.selectedInferenceEndpoint,
      summary: diagnosis.inference.summary,
    },
    visibleModels: probe.availableModels,
    blockedReason: doctorReport.blockedReason,
    recommendedAction: doctorReport.recommendedAction,
    manualChecks: doctorReport.manualChecks,
    escalationTemplate: doctorReport.escalationTemplate,
  };

  await emitResult(
    {
      config: publicConfig,
      usingEnvOverrides,
      probe,
      diagnosis,
      doctorReport,
      verification,
    },
    args.out,
  );
}

function applyRuntimeEnvOverrides(config: BrainRuntimeConfig): BrainRuntimeConfig {
  const cloudApiFlavor = parseCloudApiFlavor(
    process.env.FINANCE_MESH_CLOUD_API_FLAVOR ?? process.env.OLLAMA_CLOUD_API_FLAVOR,
  );

  return {
    ...config,
    mode: process.env.OLLAMA_MODE === "cloud" ? "cloud" : process.env.OLLAMA_MODE === "local" ? "local" : config.mode,
    model: process.env.OLLAMA_MODEL?.trim() ? process.env.OLLAMA_MODEL.trim() : config.model,
    localBaseUrl: process.env.OLLAMA_BASE_URL?.trim()
      ? stripTrailingSlash(process.env.OLLAMA_BASE_URL.trim())
      : config.localBaseUrl,
    cloudBaseUrl: process.env.OLLAMA_CLOUD_BASE_URL?.trim()
      ? stripTrailingSlash(process.env.OLLAMA_CLOUD_BASE_URL.trim())
      : config.cloudBaseUrl,
    cloudApiFlavor: cloudApiFlavor ?? config.cloudApiFlavor,
    apiKey: process.env.OLLAMA_API_KEY?.trim() ? process.env.OLLAMA_API_KEY.trim() : config.apiKey,
    temperature: parseTemperature(process.env.OLLAMA_TEMPERATURE, config.temperature),
    systemPrompt: process.env.OLLAMA_SYSTEM_PROMPT?.trim() ? process.env.OLLAMA_SYSTEM_PROMPT.trim() : config.systemPrompt,
  };
}

function hasRuntimeEnvOverrides(): boolean {
  return [
    "OLLAMA_MODE",
    "OLLAMA_MODEL",
    "OLLAMA_BASE_URL",
    "OLLAMA_CLOUD_BASE_URL",
    "FINANCE_MESH_CLOUD_API_FLAVOR",
    "OLLAMA_CLOUD_API_FLAVOR",
    "OLLAMA_API_KEY",
    "OLLAMA_TEMPERATURE",
    "OLLAMA_SYSTEM_PROMPT",
  ].some((key) => Boolean(process.env[key]?.trim()));
}

function toPublicConfig(config: BrainRuntimeConfig) {
  return {
    mode: config.mode,
    model: config.model,
    localBaseUrl: config.localBaseUrl,
    cloudBaseUrl: config.cloudBaseUrl,
    cloudApiFlavor: config.cloudApiFlavor,
    temperature: config.temperature,
    systemPrompt: config.systemPrompt,
    hasApiKey: Boolean(config.apiKey),
  };
}

function parseCloudApiFlavor(value: string | undefined): CloudApiFlavor | null {
  if (value === "ollama_native" || value === "openai_compatible" || value === "auto") {
    return value;
  }
  return null;
}

function parseTemperature(value: string | undefined, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(2, numeric));
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

async function emitResult(payload: Record<string, unknown>, outPath?: string) {
  const content = JSON.stringify(payload, null, 2);
  if (outPath) {
    const absolutePath = path.resolve(outPath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${content}\n`, "utf8");
  }
  console.log(content);
}

await main();
