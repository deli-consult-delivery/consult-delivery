import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_slexhoelcjwgbopmbzzr",
  runtime: "node",
  dirs: ["./trigger"],
  maxDuration: 300, // 5 minutos — cobre tasks de análise iFood e chamadas Claude
});
