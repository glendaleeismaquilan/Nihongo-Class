import cron from "node-cron";
import { env } from "./env";
import { createApp } from "./app";
import { logger } from "./logger";
import { JOBS, type JobName } from "./services/jobs";
import { attachCallSignaling } from "./services/calls";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, paymongoMode: env.PAYMONGO_MODE }, "Nihongo Class API listening");
});
// In-app video call signaling shares the API port (/api/calls/ws).
attachCallSignaling(server);

// In development the jobs run in-process. In production an external scheduler
// (Cloud Scheduler) calls POST /api/jobs/:name, because in-process cron stops
// when a serverless host scales to zero.
if (env.NODE_ENV === "development") {
  const run = (name: JobName) => () =>
    void JOBS[name]()
      .then((result) => logger.debug({ job: name, result }, "job finished"))
      .catch((err) => logger.error({ err, job: name }, "job failed"));
  cron.schedule("*/5 * * * *", run("complete-sessions"));
  cron.schedule("*/5 * * * *", run("session-reminders"));
  cron.schedule("7 * * * *", run("expire-payments"));
  logger.info("dev jobs scheduled with node-cron");
}
