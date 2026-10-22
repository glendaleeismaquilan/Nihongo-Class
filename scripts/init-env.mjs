// Creates apps/api/.env and apps/web/.env from the examples for a local
// emulator run, generating the API secrets. Never overwrites existing files.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function init(dir, fill) {
  const target = join(root, dir, ".env");
  if (existsSync(target)) {
    console.log(`${dir}/.env already exists, leaving it alone`);
    return;
  }
  let text = readFileSync(join(root, dir, ".env.example"), "utf8");
  for (const [key, value] of Object.entries(fill)) {
    text = text.replace(new RegExp(`^${key}=[^\\n#]*`, "m"), `${key}=${value} `);
  }
  writeFileSync(target, text);
  console.log(`wrote ${dir}/.env`);
}

init("apps/api", {
  FILE_TICKET_SECRET: randomBytes(32).toString("base64"),
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  JOB_SECRET: randomBytes(24).toString("hex"),
  PAYMONGO_WEBHOOK_SECRET: `whsk_mock_${randomBytes(12).toString("hex")}`,
});
init("apps/web", { VITE_FIREBASE_API_KEY: "demo-api-key" });
