import { OllamaBrainRuntime } from "../src/brain.ts";
import { RuntimeConfigStore } from "../src/runtime-config.ts";
import { buildRuntimeDiagnosis } from "../src/runtime-diagnostics.ts";

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

  console.log(
    JSON.stringify(
      {
        config: publicConfig,
        probe,
        diagnosis,
      },
      null,
      2,
    ),
  );
}

await main();
