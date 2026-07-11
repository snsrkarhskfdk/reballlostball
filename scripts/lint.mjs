import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const requiredFiles = ["index.html", "styles.css", "app.js"];
const errors = [];

function filesUnder(directory, predicate) {
  if (!existsSync(directory)) return [];
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...filesUnder(file, predicate));
    else if (entry.isFile() && predicate(file)) output.push(file);
  }
  return output;
}

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    errors.push(`Missing required file: ${file}`);
  }
}

if (errors.length === 0) {
  const app = readFileSync("app.js", "utf8");
  const cssFiles = ["styles.css", ...filesUnder("src/frontend/ui", (file) => file.endsWith(".css"))];
  const css = cssFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  const cssForChecks = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const index = readFileSync("index.html", "utf8");

  const syntaxFiles = [
    "app.js",
    ...filesUnder("scripts", (file) => /\.m?js$/i.test(file)),
    ...filesUnder("src/frontend", (file) => /\.m?js$/i.test(file)),
  ];
  for (const file of syntaxFiles) {
    const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (check.status !== 0) errors.push(`JavaScript syntax error in ${file}: ${check.stderr.trim()}`);
  }

  const requiredFunctions = [
    "renderHome",
    "renderDetail",
    "renderCart",
    "renderCheckout",
    "renderOrder",
    "renderMypage",
    "renderAdmin",
    "renderStore",
    "addToCart",
    "createOrder",
    "hydrateFromSupabase",
  ];

  for (const name of requiredFunctions) {
    if (!app.includes(`function ${name}`)) {
      errors.push(`Missing function: ${name}`);
    }
  }

  if (!index.includes('<div id="app"></div>')) {
    errors.push("index.html must expose #app mount node");
  }

  if (app.includes("console.log")) {
    errors.push("Remove console.log from app.js");
  }

  if (app.includes("figma.com/api/mcp")) {
    errors.push("Use local assets instead of short-lived Figma asset URLs");
  }

  if (css.includes("#06140E") || css.includes("#06140e") || app.includes("#06140E") || app.includes("#06140e")) {
    errors.push("Replace exact #06140E with the approved fairway gradient colors");
  }

  for (const token of ["--fairway", "--mint", "--gold", "--gradient-deep"]) {
    if (!cssForChecks.includes(token)) {
      errors.push(`Missing CSS token: ${token}`);
    }
  }

  if (cssForChecks.includes("tailwind")) {
    errors.push("Tailwind should not be introduced for this static implementation");
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Lint checks passed\n");
