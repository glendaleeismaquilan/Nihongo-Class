import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Request } from "express";
import { env } from "../env";

/**
 * §14 rate limits. Keyed by user when signed in, otherwise by IP. Disabled
 * under NODE_ENV=test unless RATE_LIMIT_IN_TESTS is set.
 */
export function limiter(name: string, limit: number, windowMinutes = 15) {
  return rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test" && !process.env.RATE_LIMIT_IN_TESTS,
    keyGenerator: (req: Request) =>
      `${name}:${req.user?.uid ?? req.firebase?.uid ?? ipKeyGenerator(req.ip ?? "unknown")}`,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: "rate_limited", message: "Too many attempts. Wait a few minutes and try again." } });
    },
  });
}
