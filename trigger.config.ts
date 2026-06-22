import { defineConfig } from "@trigger.dev/sdk/v3";
import { additionalFiles } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_slexhoelcjwgbopmbzzr",
  runtime: "node",
  dirs: ["./trigger"],
  maxDuration: 600, // 10 minutos — permite gerar-imagem (LLM ~120s + 2 imagens ~180s cada)
  build: {
    extensions: [
      additionalFiles({
        files: [
          "./trigger/_shared/**/*.ts",
          "./trigger/knowledge-base/**/*.md",
          "./src/agents/**/*.ts",
        ],
      }),
    ],
  },
});