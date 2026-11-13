import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { isValidTimeZone } from "@nihongo/shared";

const envPath = resolve(process.cwd(), ".env");
if (process.env.NODE_ENV !== "test" && existsSync(envPath)) process.loadEnvFile(envPath);

const base64Bytes = (min: number, exact = false) =>
  z.string().refine(
    (v) => {
      const n = Buffer.from(v, "base64").length;
      return exact ? n === min : n >= min;
    },
    { error: exact ? `must be exactly ${min} bytes, base64-encoded` : `must be at least ${min} bytes, base64-encoded` },
  );

const schema = z
  .object({
    PORT: z.coerce.number().int().default(3000),
    APP_URL: z.url(),
    API_URL: z.url(),
    /** Extra browser origins allowed by CORS, comma-separated (e.g. the mobile app's web build in development). */
    CORS_EXTRA_ORIGINS: z.string().optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_STORAGE_BUCKET: z.string().min(1),
    FIRESTORE_EMULATOR_HOST: z.string().optional(),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
    FIREBASE_STORAGE_EMULATOR_HOST: z.string().optional(),

    // Where uploaded files go: Firebase (default, works with the emulators)
    // or Supabase Storage, which has a free plan without a card.
    STORAGE_PROVIDER: z.enum(["firebase", "supabase"]).default("firebase"),
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SECRET_KEY: z.string().optional(),
    SUPABASE_BUCKET: z.string().min(1).default("nihongo-files"),
    SUPABASE_PUBLIC_BUCKET: z.string().min(1).default("nihongo-audio"),

    DEFAULT_TIME_ZONE: z.string().refine(isValidTimeZone).default("Asia/Manila"),
    FILE_TICKET_SECRET: base64Bytes(32),
    TOKEN_ENCRYPTION_KEY: base64Bytes(32, true),
    JOB_SECRET: z.string().min(16),

    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    GOOGLE_OAUTH_REDIRECT_URI: z.url().optional(),

    PAYMONGO_MODE: z.enum(["mock", "test", "live"]).default("mock"),
    PAYMONGO_SECRET_KEY: z.string().optional(),
    PAYMONGO_WEBHOOK_SECRET: z.string().min(1),
    PAYMONGO_PAYMENT_METHODS: z
      .string()
      .default("gcash,paymaya,qrph,card")
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    // In-app video calls: optional TURN relay for networks where direct
    // peer-to-peer connections fail. STUN alone works for most home networks.
    TURN_URLS: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [])),
    TURN_USERNAME: z.string().optional(),
    TURN_CREDENTIAL: z.string().optional(),
    MATERIAL_MAX_FILE_MB: z.coerce.number().int().min(1).max(100).default(25),
    LOG_LEVEL: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.PAYMONGO_MODE === "mock" && e.NODE_ENV === "production") {
      ctx.addIssue({ code: "custom", path: ["PAYMONGO_MODE"], message: "mock mode is not allowed in production" });
    }
    if (e.PAYMONGO_MODE !== "mock" && !e.PAYMONGO_SECRET_KEY) {
      ctx.addIssue({ code: "custom", path: ["PAYMONGO_SECRET_KEY"], message: "required unless PAYMONGO_MODE=mock" });
    }
    if (e.STORAGE_PROVIDER === "supabase") {
      if (!e.SUPABASE_URL) ctx.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "required when STORAGE_PROVIDER=supabase" });
      if (!e.SUPABASE_SECRET_KEY) ctx.addIssue({ code: "custom", path: ["SUPABASE_SECRET_KEY"], message: "required when STORAGE_PROVIDER=supabase" });
    }
  });

export type Env = z.infer<typeof schema>;

function load(): Env {
  // Treat empty assignments in .env (KEY=) as unset.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(env)"}: ${i.message}`);
    console.error(`Nihongo Class API refused to start. Fix these environment variables:\n${lines.join("\n")}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = load();

if (env.FIRESTORE_EMULATOR_HOST) {
  // Against the emulators no credentials are needed: ignore a key path that
  // doesn't exist and skip the GCE metadata lookup.
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath && !existsSync(resolve(process.cwd(), keyPath))) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.METADATA_SERVER_DETECTION ??= "none";
}

export const googleConfigured = Boolean(
  env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REDIRECT_URI,
);
export const usingEmulators = Boolean(env.FIRESTORE_EMULATOR_HOST);
