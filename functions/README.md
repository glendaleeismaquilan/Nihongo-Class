# Firebase Functions deploy for the Express API

Wraps `apps/api`'s Express app in a 2nd-gen HTTPS function so the mobile app and the web app can call `/api/**` at a stable Firebase URL — no laptop, no tunnel, no LAN IP.

## One-time setup (local machine)

```bash
# 1. Firebase CLI (if you don't have it)
npm install -g firebase-tools
firebase login

# 2. From the project root, make sure this repo is linked to your Firebase project
firebase use nihongoclass-6342b

# 3. Install functions deps
cd functions
npm install
cd ..
```

## Environment variables

Secrets live at `functions/.env.nihongoclass-6342b` (project-scoped `.env` file for Firebase Functions v2). Copy the values from `apps/api/.env`:

```
APP_URL=https://nihongoclass-6342b.web.app
API_URL=https://asia-southeast1-nihongoclass-6342b.cloudfunctions.net/api
NODE_ENV=production
FIREBASE_PROJECT_ID=nihongoclass-6342b
FIREBASE_STORAGE_BUCKET=nihongoclass-6342b.firebasestorage.app
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<your-supabase>.supabase.co
SUPABASE_SECRET_KEY=<from local .env>
SUPABASE_BUCKET=nihongo-files
SUPABASE_PUBLIC_BUCKET=nihongo-audio
DEFAULT_TIME_ZONE=Asia/Manila
FILE_TICKET_SECRET=<32-byte base64 from local .env>
TOKEN_ENCRYPTION_KEY=<32-byte base64 from local .env>
JOB_SECRET=<16+ char from local .env>
PAYMONGO_MODE=mock
PAYMONGO_WEBHOOK_SECRET=<from local .env>
```

Keep this file **out of git** (`functions/.gitignore` already excludes `.env.*`).

## Deploy

From the repo root:

```bash
# Build the Express app bundle
npm run build -w @nihongo/api

# Deploy just the function
firebase deploy --only functions
```

After a successful deploy, your API is live at:

```
https://asia-southeast1-nihongoclass-6342b.cloudfunctions.net/api
```

Point the mobile app at it: edit `apps/mobile/app.json` →

```json
"extra": { "apiUrl": "https://asia-southeast1-nihongoclass-6342b.cloudfunctions.net/api", ... }
```

Then rebuild the APK (`eas build --platform android --profile preview` or the local gradle command). That's it — no tunnel, no laptop, no LAN IP.

## What DOESN'T move to Functions

- **In-app WebRTC signaling** (`/api/calls/ws` WebSocket). Cloud Functions are HTTP-only; they can't hold a long-lived socket. If you want in-app video calls in production you'd put just that service on Cloud Run or keep a tiny signaling server elsewhere. Everything else (classes, lessons, flashcards, payments, materials, drive) runs fine as a function.

## Testing locally without deploying

```bash
npm run build -w @nihongo/api
firebase emulators:start --only functions
```

Local URL: `http://localhost:5001/nihongoclass-6342b/asia-southeast1/api`.
