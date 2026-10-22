import pino from "pino";
import { env } from "./env";

/** §14 Security: redact auth headers, OAuth tokens, webhook signatures, and keys. */
export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === "test" ? "silent" : "info"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['paymongo-signature']",
      "req.headers['x-job-secret']",
      "*.refreshToken",
      "*.refresh_token",
      "*.access_token",
      "*.accessToken",
      "*.id_token",
      "*.refreshTokenEncrypted",
      "*.secretKey",
      "*.password",
      "tokens",
    ],
    censor: "[redacted]",
  },
});
