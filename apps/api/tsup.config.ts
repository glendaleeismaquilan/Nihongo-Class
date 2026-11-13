import { defineConfig } from "tsup";

export default defineConfig({
  // server.ts is the standalone dev entry; app.ts is what Firebase Functions wraps.
  entry: ["src/server.ts", "src/app.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // The shared package ships TypeScript source, so bundle it into the API.
  noExternal: ["@nihongo/shared"],
});
