// Runs the Firebase CLI with $JAVA_HOME/bin first on PATH, so the emulators
// use the JDK that JAVA_HOME names (21+) even when an older java comes first
// on the system PATH. Arguments pass through unchanged.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

const env = { ...process.env };
const javaBin = env.JAVA_HOME && join(env.JAVA_HOME, "bin");
if (javaBin && existsSync(javaBin)) {
  const key = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  env[key] = `${javaBin}${delimiter}${env[key] ?? ""}`;
}

// Find the CLI's entry file (local install, then the global npm install) so
// this works even when the shell's PATH doesn't include npm's global bin.
const prefix = env.npm_config_global_prefix;
const cli = [
  join(root, "node_modules"),
  prefix && join(prefix, "node_modules"),
  prefix && join(prefix, "lib", "node_modules"),
]
  .filter(Boolean)
  .map((dir) => join(dir, "firebase-tools", "lib", "bin", "firebase.js"))
  .find((file) => existsSync(file));

const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
const child = cli
  ? spawn(process.execPath, [cli, ...args], { env, stdio: "inherit" })
  : spawn(["firebase", ...args.map(quote)].join(" "), { env, stdio: "inherit", shell: true });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
