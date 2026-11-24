// Starts an ngrok tunnel to the local API on the fixed https address the Android
// app is built with (apps/mobile/app.json → expo.extra.apiUrl), so phones reach
// this laptop from any network and the laptop's own IP no longer matters.
// Needs ngrok installed and signed in once (ngrok config add-authtoken ...).
// Usage: npm run tunnel   (API port: PORT, default 3000)
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = JSON.parse(readFileSync(join(root, "apps", "mobile", "app.json"), "utf8"));
const apiUrl = app.expo?.extra?.apiUrl ?? "";

let host = "";
try {
  const url = new URL(apiUrl);
  if (url.protocol === "https:") host = url.host;
} catch {}
if (!host) {
  console.error(
    `apps/mobile/app.json has apiUrl "${apiUrl}". Set it to your ngrok address, for example ` +
      `https://your-name.ngrok-free.dev, then run npm run tunnel again (and rebuild the APK).`,
  );
  process.exit(1);
}

const found = spawnSync(process.platform === "win32" ? "where" : "which", ["ngrok"], { stdio: "ignore" });
if (found.status !== 0) {
  console.error("ngrok isn't installed. Install it (winget install ngrok.ngrok), open a new terminal, then run ngrok config add-authtoken <your token>.");
  process.exit(1);
}

const port = process.env.PORT || "3000";
console.log(`Tunnel: https://${host} → http://localhost:${port}. Keep this window open while the app is used.`);
// --domain works on every ngrok v3 (newer versions also call it --url). ngrok is an .exe on Windows, so no shell is needed.
const child = spawn("ngrok", ["http", `--domain=${host}`, port], { stdio: "inherit" });
child.on("error", () => {
  console.error("Couldn't start ngrok. Install it (winget install ngrok.ngrok), then run ngrok config add-authtoken <your token>.");
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
