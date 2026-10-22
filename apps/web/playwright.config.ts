import { defineConfig, devices } from "@playwright/test";

/**
 * §16 end-to-end smoke test, mock payments, against the emulators.
 * `npm run test:e2e` from the repo root starts throwaway emulators; the API
 * and web dev servers are started here (or reused if already running).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // The in-app call test uses a fake camera and microphone.
    permissions: ["camera", "microphone"],
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
  webServer: [
    {
      command: "npm run dev -w @nihongo/api",
      cwd: "../..",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev -w @nihongo/web",
      cwd: "../..",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
