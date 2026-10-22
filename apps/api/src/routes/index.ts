import { Router } from "express";
import { requireUser } from "../lib/auth";
import { meRouter, registerRouter } from "./auth";
import { usersRouter } from "./users";
import { notificationsRouter } from "./notifications";
import { classesRouter } from "./classes";
import { lessonsRouter } from "./lessons";
import { teacherContentRouter } from "./teacherContent";
import { libraryRouter } from "./library";
import { studyRouter } from "./study";
import { reportsRouter } from "./reports";
import { materialsRouter } from "./materials";
import { filesRouter } from "./files";
import { integrationsCallbackRouter, integrationsRouter } from "./integrations";
import { sessionsRouter } from "./sessions";
import { jobsRouter } from "./jobs";
import { devRouter, paymentsRouter } from "./payments";
import { driveRouter } from "./drive";
import { callsRouter } from "./calls";
import { env } from "../env";

/** Routes that authenticate themselves (Firebase token only, state, tickets, or secrets). */
function publicRoutes() {
  const r = Router();
  r.use(registerRouter);
  r.use(filesRouter);
  r.use(integrationsCallbackRouter);
  r.use(jobsRouter);
  return r;
}

/** Everything else requires a verified user loaded from users/{uid} (decision 16). */
function authedRoutes() {
  const r = Router();
  r.use(requireUser);
  r.use(meRouter);
  r.use(usersRouter);
  r.use(notificationsRouter);
  r.use(classesRouter);
  r.use(lessonsRouter);
  r.use(teacherContentRouter);
  r.use(libraryRouter);
  r.use(studyRouter);
  r.use(reportsRouter);
  r.use(materialsRouter);
  r.use(integrationsRouter);
  r.use(sessionsRouter);
  r.use(paymentsRouter);
  r.use(driveRouter);
  r.use(callsRouter);
  // §15: the mock PayMongo routes exist only in mock mode.
  if (env.PAYMONGO_MODE === "mock") r.use(devRouter);
  return r;
}

export function apiRouter() {
  const api = Router();
  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  api.use(publicRoutes());
  api.use(authedRoutes());
  return api;
}
