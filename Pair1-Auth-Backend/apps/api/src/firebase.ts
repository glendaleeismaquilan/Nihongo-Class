import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { env } from "./env";

// Credentials come from GOOGLE_APPLICATION_CREDENTIALS or the host's default
// credentials; the emulators need none.
const app =
  getApps()[0] ??
  initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  });

export const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });
export const adminAuth = getAuth(app);
export const storage = getStorage(app);
export const bucket = storage.bucket();
