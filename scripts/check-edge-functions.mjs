import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(process.cwd(), "supabase", "functions");
const entries = readdirSync(root)
  .map((name) => join(root, name, "index.ts"))
  .filter((file) => {
    try { return statSync(file).isFile(); } catch { return false; }
  });

if (entries.length > 0) {
  const isWindows = process.platform === "win32";
  const npmBin = process.env.npm_execpath
    ? dirname(process.env.npm_execpath)
    : join(dirname(process.execPath), "node_modules", "npm", "bin");
  const command = isWindows ? process.execPath : "npx";
  const args = isWindows
    ? [join(npmBin, "npx-cli.js"), "--yes", "deno", "check", ...entries]
    : ["--yes", "deno", "check", ...entries];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.error) {
    process.stderr.write(`Unable to run Deno: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

process.stdout.write(`Deno checked ${entries.length} Edge Functions\n`);
