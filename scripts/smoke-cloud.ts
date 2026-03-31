import fs from "node:fs/promises";
import path from "node:path";

import { OllamaBrainRuntime } from "../src/brain.ts";
import { RuntimeConfigStore } from "../src/runtime-config.ts";
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
  const config = await runtimeStore.get();
  const publicConfig = await runtimeStore.getPublic();

  if (config.mode !== "cloud") {
    const skipped = {
      skipped: true,
      reason: "runtime mode is not cloud",
      mode: config.mode,
      model: config.model,
      recommendedAction: "先把运行时切到 cloud 模式，再执行真实 provider 联调。",
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
    currentFlavor: doctorReport.currentFlavor,
    currentFlavorLabel: doctorReport.currentFlavorLabel,
    validatedFlavor: doctorReport.validatedFlavor,
    validatedFlavorLabel: doctorReport.validatedFlavorLabel,
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
      probe,
      diagnosis,
      doctorReport,
      verification,
    },
    args.out,
  );
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
