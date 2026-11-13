// Firebase Functions entry. Wraps the already-built Express app from apps/api
// as a 2nd-gen HTTPS function at /api. Everything else (/me, /classes, …) is
// a sub-path of that function, so your mobile and web clients just call
//   https://<region>-<project>.cloudfunctions.net/api/me
// or, when firebase.json rewrites are active, /api/me on your own domain.

const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");

// The CJS build of the Express factory, produced by `npm run build -w @nihongo/api`.
const { createApp } = require("../apps/api/dist/app.cjs");

setGlobalOptions({
  region: "asia-southeast1",
  memory: "512MiB",
  timeoutSeconds: 60,
  maxInstances: 10,
});

const app = createApp();

exports.api = onRequest(app);
