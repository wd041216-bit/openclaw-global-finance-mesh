import { normalizeFinanceMeshConfig } from "./src/config.ts";
import { FINANCE_MESH_PROMPT_GUIDANCE } from "./src/prompt-guidance.ts";
import { createDecisionRunTool, createPackValidationTool, createReplayTool } from "./src/tool.ts";

const plugin = {
  id: "global-finance-mesh",
  name: "Global Finance Mesh",
  description: "Pack-driven finance decisioning for OpenClaw.",
  register(api: {
    pluginConfig?: unknown;
    registerTool: (tool: unknown) => void;
    on: (eventName: string, handler: (...args: unknown[]) => unknown) => void;
  }) {
    const config = normalizeFinanceMeshConfig(api.pluginConfig);

    api.registerTool(createPackValidationTool({ config }));
    api.registerTool(createDecisionRunTool({ config }));
    api.registerTool(createReplayTool({ config }));

    api.on("before_prompt_build", async () => {
      if (!config.enabled || !config.prependSystemGuidance) {
        return;
      }

      return {
        prependSystemContext: FINANCE_MESH_PROMPT_GUIDANCE,
      };
    });
  },
};

export default plugin;

