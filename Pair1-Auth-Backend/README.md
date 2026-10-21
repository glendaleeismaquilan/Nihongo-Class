# Nihongo Class

A Japanese-learning web app, installable as a PWA. Students study in a teacher-led class they join with a class code, or on their own from a built-in library organized by JLPT level (N5 to N1). Teachers write text-only flashcards and quizzes for their classes, hold live classes on Google Meet, and share class materials. Teachers also get a private My Drive and quick in-app video calls. A Content Admin curates the built-in library and creates schools. A School Admin manages classes and teachers.

Classes are free for students. The app charges only for:

- **Teacher slots:** each school gets 5 teachers free; 5 more cost ₱299.00, paid once.
- **Teacher Premium:** ₱299.00, paid once and never expiring, for 15-minute video calls (5 minutes free) and 1 GB of storage (500 MB free). My Drive and uploaded class materials share that space.

- `apps/web`: React, Vite, React Router, TanStack Query, Tailwind CSS, Firebase Auth, `vite-plugin-pwa`
- `apps/api`: Node.js, Express, Firebase Admin (Firestore, Auth, Storage), zod, SheetJS, Google Calendar, PayMongo
- `packages/shared`: zod schemas, types, and constants used by both apps
- `docs/DECISIONS.md`: every decision that fills a gap in the SRS

The browser talks only to the API (decision 17). Firestore and Storage rules deny all client access.

## 1. Local run, no accounts needed

Install Node.js LTS (22 or newer), the Firebase CLI (`npm install -g firebase-tools`), and a Java runtime (21 or newer) for the Firebase emulators.

```bash
npm install
npm run setup        # writes apps/api/.env and apps/web/.env with generated local secrets
npm run emulators    # terminal 1: Auth, Firestore, and Storage emulators (UI at http://localhost:4000)
npm run seed         # terminal 2: demo school, people, classes, library, billing
npm run dev          # API on http://localhost:3000, web on http://localhost:5173
```

The seed prints every demo login; the password for all of them is `nihongo123`. Live classes use pasted Meet links, and payments run in mock mode (`PAYMONGO_MODE=mock`): buying teacher slots or Premium opens a local page with Pay and Cancel buttons that signs and posts a real `checkout_session.payment.paid` webhook to the API.

In-app video calls need camera and microphone permission. Browsers allow them on `http://localhost`; to test with two people, open a second browser profile (or a private window) and sign in as a student enrolled in the class.

Password-reset and invite emails aren't sent by the Auth emulator. It prints their links in the emulator's terminal output instead.

### Checks

```bash
npm run typecheck
npm run lint
npm test             # starts throwaway emulators and runs the shared, API, and web unit tests
npm run test:e2e     # Playwright smoke tests (free class, Premium and a two-person call, teacher slots)
```

The first time you run the end-to-end test, install its browser with `npx playwright install chromium`. The test starts the API and web dev servers itself (or reuses them if they're running) and re-seeds the demo data.

`npm test` and `npm run test:e2e` start their own emulators, so stop `npm run emulators` first; they use the same ports. While your dev emulators are running, use `npm run test:unit`, and `npx playwright test` from `apps/web`, instead. The API suite clears the emulator data before it runs, so run `npm run seed` again afterwards (decision 27).

Tests never touch a real Firebase project, Google account, or PayMongo key: Google Calendar is replaced by a fake in the tests, and PayMongo runs in mock mode.

### Useful scripts

| Script | What it does |
|---|---|
| `npm run setup` | Writes the `.env` files with generated local secrets (never overwrites) |
| `npm run seed` | Demo data in the emulators (`npm run seed -- --force` for a real project) |
| `npm run create-admin -- --role ...` | Creates a Content Admin, or a School Admin and their school |
| `node scripts/build-indexes.mjs` | Regenerates `firestore.indexes.json` after adding a query |
| `node apps/web/scripts/make-icons.mjs` | Rebuilds the logo sizes, favicon, and install icons from `apps/web/brand/logo-source.webp` |
| `POST /api/jobs/:name` | Runs `complete-sessions`, `session-reminders`, or `expire-payments` (needs `X-Job-Secret`; node-cron runs them in development) |

## 2. Firebase project

1. Create a Firebase project.
2. Enable Authentication with the Email/Password provider.
3. Create Firestore in Native mode. `asia-southeast1` (Singapore) is closest to the Philippines.
4. Register a web app and copy its config (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`) into `apps/web/.env.production`, which the production build uses (this project's is already filled in for `nihongoclass-6342b`). To run locally against the real project instead of the emulators, put the same values in `apps/web/.env` with `VITE_USE_EMULATORS=false`. The Firebase project is the `prod` alias in `.firebaserc` (`firebase deploy --project prod`).
5. Create a service-account key for the API and point `GOOGLE_APPLICATION_CREDENTIALS` at it, or use the host's default credentials on Cloud Run. Remove the three `*_EMULATOR_HOST` lines from `apps/api/.env`, and set `FIREBASE_PROJECT_ID` and `FIREBASE_STORAGE_BUCKET`.
6. Deploy the rules and indexes: `firebase deploy --only firestore,storage --project <project-id>`.

Cloud Storage for Firebase requires the pay-as-you-go Blaze plan, which still includes no-cost usage. Google's Always Free storage tier covers only buckets in US-CENTRAL1, US-EAST1, and US-WEST1, so choose one of those unless the school accepts small charges for a Singapore bucket. Set a budget alert either way.

### Files on Supabase instead (free, no card)

Sign-in and the database can stay on Firebase's free Spark plan while uploaded files go to Supabase Storage (decision 67). Skip Firebase Storage entirely, and don't deploy `storage.rules` (use `firebase deploy --only firestore`).

1. Create a project at https://supabase.com (the free plan needs no card). Pick the Southeast Asia (Singapore) region.
2. In **Project Settings → API Keys**, copy the project URL and a **secret key** (`sb_secret_...`; the legacy `service_role` key also works). The secret key goes only in `apps/api/.env`, never in the web app or a commit.
3. In `apps/api/.env`:
   ```
   STORAGE_PROVIDER=supabase
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   ```
4. Restart the API. On the first upload it creates two buckets: `nihongo-files` (private: materials and My Drive, served only through the API's 5-minute links) and `nihongo-audio` (public: built-in library audio).

The free plan holds 1 GB of files for the whole project and pauses after a week without use (unpause it from the Supabase dashboard). Since one Premium teacher may use up to 1 GB, plan on Supabase's paid plan, or Firebase Blaze, once real teachers upload. The emulators and tests keep using Firebase Storage, so `STORAGE_PROVIDER=firebase` stays the local default.

Create the first Content Admin with the CLI. After that, the Content Admin creates schools and their School Admins from the Schools page, and School Admins add their teachers. The CLI can also create a School Admin and school directly. It prints a set-password link:

```bash
npm run create-admin -- --role school_admin --email maria@example.com --name "Maria Santos" --school-name "Sakura Nihongo Center"
npm run create-admin -- --role content_admin --email kenji@example.com --name "Kenji Mori"
```

## 3. Google, for automatic Meet links

1. In the same project's Google Cloud console, enable the Google Calendar API.
2. Configure the OAuth consent screen: External, with the scopes `openid`, `email`, and `https://www.googleapis.com/auth/calendar.events`. Add each teacher's Google account as a test user.
3. Create an OAuth client of type "Web application" with `GOOGLE_OAUTH_REDIRECT_URI` (for example `http://localhost:3000/api/integrations/google/callback`) as an authorized redirect URI.
4. Copy the client ID and secret into `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

While the app's publishing status is "Testing", only listed test users can connect, and their refresh tokens expire after 7 days, so teachers reconnect weekly (the app marks the connection "needs reconnect" and falls back to pasted links). `calendar.events` is a sensitive scope, so plan for Google's app verification before opening it to every teacher. Teachers on a school Google Workspace account may need their Workspace admin to allow the app.

## 4. PayMongo, for real test payments

PayMongo issues test keys only after the account's verification (KYC) is complete.

1. Copy the test secret key into `PAYMONGO_SECRET_KEY` and set `PAYMONGO_MODE=test`.
2. Expose the local API with a tunnel: `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`.
3. In the PayMongo dashboard under Settings, Webhooks, add `https://<tunnel-host>/api/webhooks/paymongo` subscribed to `checkout_session.payment.paid`, and copy its secret into `PAYMONGO_WEBHOOK_SECRET`.

Tunnel URLs change on restart, so update the webhook when they do; reconciliation still confirms payments while the webhook is unreachable. A webhook made in test mode receives only test events, so create a separate one, with its own secret, when going live. Test cards and e-wallet test flows are in PayMongo's testing docs (for example, 4343 4343 4343 4345 is a Visa that succeeds without 3DS).

## 5. Seed data

`npm run seed` targets the emulators and refuses to touch a real project without `--force`. It creates "Demo Nihongo School" (Asia/Manila, 2 of its 5 free teacher slots used); one School Admin, one Content Admin, two Teachers (Tanaka with Premium, Sato on the free plan), and six Students; two free classes, "N5 Saturday Class" and "N4 Evening Class", each with lessons, teacher flashcards, and a quiz; built-in N5 and N4 flashcards, quizzes, a reading test, and a listening test; an upcoming live class with a pasted Meet link; a material post with a sample PDF; a My Drive folder for Tanaka; and Tanaka's paid Premium payment. It generates short placeholder tones into `apps/api/seed/audio/` for built-in audio, which the Content Admin later replaces with real recordings.

## 6. Production

1. Build and deploy the API container (`apps/api/Dockerfile`, built from the repo root). Cloud Run in `asia-southeast1` works well:
   ```bash
   docker build -f apps/api/Dockerfile -t nihongo-api .
   ```
2. Build the web app with production `VITE_*` values and deploy it to Firebase Hosting: `npm run build -w @nihongo/web && firebase deploy --only hosting`.
3. Set `APP_URL`, `API_URL`, and `GOOGLE_OAUTH_REDIRECT_URI` to the production URLs, `NODE_ENV=production`, and `PAYMONGO_MODE=live` (the API refuses to start in mock mode in production).
4. Run the API as a single instance while in-app calls are used (for Cloud Run, `--max-instances=1 --session-affinity`), because call rooms live in memory (decision 63). Add a TURN server through `TURN_URLS`, `TURN_USERNAME`, and `TURN_CREDENTIAL` so calls also connect on strict mobile and office networks.
5. Create Cloud Scheduler jobs that call `POST /api/jobs/:name` with the `X-Job-Secret` header: `complete-sessions` and `session-reminders` every 5 minutes, and `expire-payments` hourly. In development these run in-process with node-cron; in production an external scheduler is needed because a serverless host can scale to zero.
