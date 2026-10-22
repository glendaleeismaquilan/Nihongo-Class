import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      APP_URL: "http://localhost:5173",
      API_URL: "http://localhost:3000",
      FIREBASE_PROJECT_ID: "nihongo-class-dev",
      FIREBASE_STORAGE_BUCKET: "nihongo-class-dev.firebasestorage.app",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
      FILE_TICKET_SECRET: Buffer.alloc(32, 7).toString("base64"),
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
      JOB_SECRET: "test-job-secret-0123456789",
      PAYMONGO_MODE: "mock",
      PAYMONGO_WEBHOOK_SECRET: "whsk_test_secret",
      PAYMONGO_PAYMENT_METHODS: "gcash,paymaya,qrph,card",
      MATERIAL_MAX_FILE_MB: "25",
      GOOGLE_OAUTH_CLIENT_ID: "test-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "test-client-secret",
      GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/integrations/google/callback",
    },
  },
});
