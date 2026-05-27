import { defineConfig } from "@trigger.dev/sdk/v3";
import { additionalFiles } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_slexhoelcjwgbopmbzzr",
  runtime: "node",
  dirs: ["./trigger"],
  maxDuration: 300, // 5 minutos
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