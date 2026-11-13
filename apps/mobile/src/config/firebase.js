// Firebase initialization for Expo. Decision 17: the app uses the Firebase SDK
// for Auth only — every read and write goes through the API. AsyncStorage
// persistence keeps the session across app restarts. Config values come from
// app.json's expo.extra block (dev overrides: app.config.js).
import Constants from "expo-constants";
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth, getReactNativePersistence, connectAuthEmulator } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const extra = Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? Constants.manifest?.extra ?? {};

const firebaseConfig = {
  apiKey: extra.firebaseApiKey,
  authDomain: extra.firebaseAuthDomain,
  projectId: extra.firebaseProjectId,
  appId: extra.firebaseAppId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function createAuth() {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Web build (no React Native persistence) or already initialised by fast refresh.
    return getAuth(app);
  }
}
const auth = createAuth();

// Same switch as the web app's VITE_USE_EMULATORS (set through app.config.js).
if (extra.authEmulatorHost && !auth.emulatorConfig) {
  const host = extra.authEmulatorHost;
  connectAuthEmulator(auth, /^https?:\/\//.test(host) ? host : `http://${host}`, { disableWarnings: true });
}

export { auth };
export default app;
