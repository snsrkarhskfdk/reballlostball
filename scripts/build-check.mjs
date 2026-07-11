import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const app = readFileSync("app.js", "utf8");
const index = readFileSync("index.html", "utf8");
const errors = [];
const projectRoot = resolve(".");
const cssFiles = [];
const visitedCss = new Set();

function projectFile(importer, reference) {
  const path = resolve(dirname(importer), reference.split(/[?#]/, 1)[0]);
  const pathFromRoot = relative(projectRoot, path);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) return null;
  return path;
}

function collectCss(file) {
  const absolutePath = resolve(file);
  if (visitedCss.has(absolutePath)) return;
  visitedCss.add(absolutePath);
  if (!existsSync(absolutePath)) {
    errors.push(`Missing CSS module: ${relative(projectRoot, absolutePath)}`);
    return;
  }
  const source = readFileSync(absolutePath, "utf8");
  cssFiles.push({ path: absolutePath, source });
  for (const match of source.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/gi)) {
    if (/^(?:https?:|data:|\/\/)/i.test(match[1])) continue;
    const dependency = projectFile(absolutePath, match[1]);
    if (!dependency) errors.push(`CSS import escapes the project root: ${match[1]}`);
    else collectCss(dependency);
  }
}

collectCss("styles.css");
const css = cssFiles.map(({ source }) => source).join("\n");
const cssForChecks = css.replace(/\/\*[\s\S]*?\*\//g, "");

for (const { path, source } of cssFiles) {
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const reference = match[1].trim();
    if (/^(?:https?:|data:|\/\/|#)/i.test(reference)) continue;
    const assetPath = projectFile(path, reference);
    if (!assetPath || !existsSync(assetPath)) {
      errors.push(`Missing CSS asset from ${relative(projectRoot, path)}: ${reference}`);
    }
  }
}

const requiredAssets = [
  "assets/figma/reball-logo.webp",
  "assets/figma/hero-poster.webp",
  "assets/figma/banner-home-main-clean.webp",
  "assets/figma/banner-store-event-clean.webp",
  "assets/figma/banner-premium-selection-clean.webp",
  "assets/figma/banner-store-event.webp",
  "assets/figma/banner-premium-selection.webp",
  "assets/figma/ball-titleist.webp",
  "assets/figma/ball-bridgestone.webp",
  "assets/figma/ball-taylormade.webp",
  "assets/figma/ball-saintnine.webp",
  "assets/figma/ball-volvik.webp",
  "assets/figma/ball-srixon.webp",
];

for (const asset of requiredAssets) {
  if (!existsSync(asset)) {
    errors.push(`Missing asset: ${asset}`);
  }
}

for (const marker of ["SUPABASE_URL", "SUPABASE_KEY", "localStorage", "renderOrder", "renderAdmin", "renderStore"]) {
  if (!app.includes(marker)) {
    errors.push(`Missing app marker: ${marker}`);
  }
}

for (const selector of [
  ".hero-carousel",
  ".detail-layout",
  ".cart-layout",
  ".checkout-layout",
  ".mypage-layout",
  ".admin-layout",
  ".store-hero",
  ".product-menu",
]) {
  if (!cssForChecks.includes(selector)) {
    errors.push(`Missing CSS selector: ${selector}`);
  }
}

if (!/<script\s+type="module"\s+src="\.\/app\.js(?:\?[^"]*)?"><\/script>/.test(index)) {
  errors.push("index.html must load app.js as an ES module");
}

if (!cssForChecks.includes("@media (max-width: 720px)") && !cssForChecks.includes("@media (max-width: 560px)")) {
  errors.push("Missing mobile responsive breakpoint");
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Build checks passed\n");
