import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./env";
import { logger } from "./logger";
import { errorHandler, notFoundHandler } from "./lib/errors";
import { apiRouter } from "./routes";
import { paymongoWebhook } from "./routes/payments";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  const origins = [env.APP_URL, ...(env.CORS_EXTRA_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean)];
  // The web app runs on another origin, so Content-Disposition must be exposed for downloads (templates, exports) to keep their file names.
  app.use(cors({ origin: origins, allowedHeaders: ["Authorization", "Content-Type", "ngrok-skip-browser-warning"], exposedHeaders: ["Content-Disposition"], maxAge: 600 }));
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== "test" }));

  // The PayMongo webhook needs the raw body for its signature, so it is
  // mounted before the global JSON parser.
  app.post("/api/webhooks/paymongo", ...paymongoWebhook);

  // Body parsing: JSON capped at 1 MB (§14).
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", apiRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
