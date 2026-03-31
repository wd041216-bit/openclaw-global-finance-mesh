import { OllamaBrainRuntime } from "../src/brain.ts";
import { RuntimeConfigStore } from "../src/runtime-config.ts";
import { buildRuntimeDiagnosis } from "../src/runtime-diagnostics.ts";
import { buildRuntimeDoctorReport } from "../src/runtime-doctor.ts";

async function main() {
  const runtimeStore = new RuntimeConfigStore();
  const runtime = new OllamaBrainRuntime();
  const config = await runtimeStore.get();
  const publicConfig = await runtimeStore.getPublic();

  if (config.mode !== "cloud") {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: "runtime mode is not cloud",
          mode: config.mode,
          model: config.model,
        },
        null,
        2,
      ),
    );
    return;
  }

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
  );

  console.log(
    JSON.stringify(
      {
        config: publicConfig,
        probe,
        diagnosis,
        doctorReport,
      },
      null,
      2,
    ),
  );
}

await main();
