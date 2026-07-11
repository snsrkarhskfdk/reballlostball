import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const safetyRoot = resolve(
  process.env.REBALL_SAFETY_ROOT ?? "D:/Backup/리볼_로스트볼_safety_20260711_005440"
);
const outputPath = join(root, "docs/repair/00_SOURCE_MANIFEST_SHA256.txt");

if (!existsSync(safetyRoot)) {
  throw new Error(`Safety copy not found: ${safetyRoot}`);
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "ko"))) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await listFiles(absolute)));
    } else if (entry.isFile()) {
      paths.push(absolute);
    }
  }

  return paths;
}

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex").toUpperCase()));
  });
}

function portablePath(base, path) {
  return relative(base, path).replaceAll("\\", "/");
}

async function buildSection(label, base, files) {
  const lines = [`[${label}]`, `FILE_COUNT=${files.length}`];
  for (const path of files) {
    lines.push(`${await hashFile(path)}  ${portablePath(base, path)}`);
  }
  return lines;
}

const originalFiles = await listFiles(safetyRoot);
const trackedPaths = execFileSync(
  "git",
  ["-c", `safe.directory=${root}`, "ls-files"],
  { cwd: root, encoding: "utf8" }
)
  .split(/\r?\n/u)
  .filter(Boolean);
const integratedPaths = [...new Set([...trackedPaths, "package-lock.json"])]
  .map((path) => join(root, path))
  .filter((path) => existsSync(path))
  .sort((a, b) => a.localeCompare(b, "ko"));

const lines = [
  "# REBALL pre-repair SHA-256 manifest",
  "# Generated: 2026-07-11 Asia/Seoul",
  "# Canonical root: D:/Backup/리볼_로스트볼",
  "# Safety copy: D:/Backup/리볼_로스트볼_safety_20260711_005440",
  "# GitHub source baseline: origin/main 748d7d20ec3c460d89e99e3d7c1cf40248b552c4",
  "# The original section proves the 991-file canonical folder before source hydration.",
  "# The integrated section records restored tracked source plus the preserved local lockfile before repair edits.",
  "",
  ...(await buildSection("ORIGINAL_CANONICAL_SAFETY_COPY", safetyRoot, originalFiles)),
  "",
  ...(await buildSection("INTEGRATED_SOURCE_BASELINE", root, integratedPaths)),
  "",
];

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, lines.join("\n"), "utf8");
process.stdout.write(`Manifest written: ${outputPath}\n`);
