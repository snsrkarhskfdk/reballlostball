import { existsSync, readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const css = readFileSync("styles.css", "utf8");
const index = readFileSync("index.html", "utf8");
const errors = [];

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
  if (!css.includes(selector)) {
    errors.push(`Missing CSS selector: ${selector}`);
  }
}

if (!index.includes('<script type="module" src="./app.js"></script>')) {
  errors.push("index.html must load app.js as an ES module");
}

if (!css.includes("@media (max-width: 720px)") && !css.includes("@media (max-width: 560px)")) {
  errors.push("Missing mobile responsive breakpoint");
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Build checks passed\n");
