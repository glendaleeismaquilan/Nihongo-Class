import { Router } from "express";
import { z } from "zod";
import { env } from "../env";
import { safeEqual } from "../lib/crypto";
import { unauthorized } from "../lib/errors";
import { params, parse } from "../lib/validate";
import { JOBS } from "../services/jobs";

/** Public but secret-checked: Cloud Scheduler in production, node-cron in development (§11 Jobs). */
export const jobsRouter = Router();

jobsRouter.post("/jobs/:name", async (req, res) => {
  const secret = req.header("x-job-secret") ?? "";
  if (!safeEqual(secret, env.JOB_SECRET)) throw unauthorized("A valid X-Job-Secret header is required.");
  const { name } = parse(z.object({ name: z.enum(Object.keys(JOBS) as [keyof typeof JOBS]) }), params(req));
  const result = await JOBS[name]();
  req.log?.info({ job: name, result }, "job finished");
  res.json({ job: name, result });
});
