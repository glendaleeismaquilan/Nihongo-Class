const PROJECT = "nihongo-class-dev";

/** Clears the emulators once before the API suite runs. */
export default async function setup() {
  const ping = await fetch("http://127.0.0.1:8080/").catch(() => null);
  if (!ping) {
    throw new Error("Firestore emulator isn't running. Start it with `npm run emulators`, or run `npm test` from the repo root.");
  }
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}
