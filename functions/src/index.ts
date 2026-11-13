// Firebase Functions entry point. Wraps the Express app from apps/api in a
// 2nd-gen HTTPS function so the whole /api/** routes are reachable at
//   https://<region>-<project>.cloudfunctions.net/api/...
// Environment variables are read from .env.<project> at deploy time, same as
// the local server reads apps/api/.env — so the Express app itself doesn't care
// where it runs.

import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";

// Build the Express app. Needs to be after env vars are present at import time.
import { createApp } from "../../apps/api/src/app";

// 2nd-gen defaults: Manila-friendly region, 512 MiB, 60s HTTP timeout.
setGlobalOptions({
  region: "asia-southeast1",
  memory: "512MiB",
  timeoutSeconds: 60,
  maxInstances: 10,
});

const app = createApp();

// One HTTPS function named "api" that dispatches to every /api/** route.
export const api = onRequest(app);
