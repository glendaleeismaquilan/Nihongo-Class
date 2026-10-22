import { execSync } from "node:child_process";
import { resolve } from "node:path";

const PROJECT = "nihongo-class-dev";

/** Fresh demo data for the smoke test (the seed only ever targets the emulators). */
export default async function globalSetup() {
  // Clear what earlier runs left behind, so reruns against long-running emulators match a fresh start.
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" }).catch(() => undefined);
  execSync("npm run seed", { cwd: resolve(import.meta.dirname, "../../.."), stdio: "inherit" });
}
