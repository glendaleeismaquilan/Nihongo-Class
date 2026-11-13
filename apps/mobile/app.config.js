// A dev run can point the app at another API, another Firebase project, or the
// local Auth emulator — the same overrides the web app takes through VITE_* vars.
// EAS builds set none of these, so a build always uses app.json's values.
module.exports = ({ config }) => {
  const env = process.env;
  const extra = { ...config.extra };
  if (env.EXPO_PUBLIC_API_URL) extra.apiUrl = env.EXPO_PUBLIC_API_URL;
  if (env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) extra.firebaseProjectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (env.EXPO_PUBLIC_USE_EMULATORS === "true") {
    extra.authEmulatorHost = env.EXPO_PUBLIC_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  }
  return { ...config, extra };
};
