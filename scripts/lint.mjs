import { existsSync, readFileSync } from "node:fs";

const requiredFiles = ["index.html", "styles.css", "app.js"];
const errors = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    errors.push(`Missing required file: ${file}`);
  }
}

if (errors.length === 0) {
  const app = readFileSync("app.js", "utf8");
  const css = readFileSync("styles.css", "utf8");
  const index = readFileSync("index.html", "utf8");

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
    if (!css.includes(token)) {
      errors.push(`Missing CSS token: ${token}`);
    }
  }

  if (css.includes("tailwind")) {
    errors.push("Tailwind should not be introduced for this static implementation");
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Lint checks passed\n");
