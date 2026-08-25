import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const legacyNames = ["app-current.js", "index-current.html"];
const shippingRoots = ["index.html", "app.js", "styles.css", "src", "scripts"];
const errors = [];
const notes = [];

function walk(path) {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "check-legacy-entrypoints.mjs") return [];
    return walk(join(path, entry.name));
  });
}

function isTextCandidate(path) {
  return /\.(?:html?|m?js|css|json|md)$/i.test(path);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const shippingFiles = shippingRoots.flatMap(walk).filter(isTextCandidate);
for (const file of shippingFiles) {
  const source = readFileSync(file, "utf8");
  for (const legacy of legacyNames) {
    if (source.includes(legacy)) {
      errors.push(`Shipping file ${relative(".", file)} references legacy entrypoint ${legacy}`);
    }
  }
}

for (const legacy of legacyNames) {
  if (!existsSync(legacy)) continue;
  notes.push(`${legacy}: bytes=${statSync(legacy).size} sha256=${sha256(legacy)}`);
}

if (existsSync("app-current.js") && existsSync("app.js")) {
  const same = sha256("app-current.js") === sha256("app.js");
  notes.push(`app-current.js vs app.js: ${same ? "IDENTICAL" : "DIVERGED"}`);
}
if (existsSync("index-current.html") && existsSync("index.html")) {
  const same = sha256("index-current.html") === sha256("index.html");
  notes.push(`index-current.html vs index.html: ${same ? "IDENTICAL" : "DIVERGED"}`);
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Legacy entrypoint guard passed\n${notes.join("\n")}\n`);
