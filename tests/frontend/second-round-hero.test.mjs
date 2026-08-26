import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("SECOND ROUND hero is loaded after the main storefront assets", () => {
  const index = read("index.html");
  assert.match(index, /styles\.css[\s\S]+second-round-hero\.css/);
  assert.match(index, /app\.js[\s\S]+second-round-hero\.mjs/);
});

test("SECOND ROUND hero scrubs media with scroll and remounts after SPA renders", () => {
  const source = read("second-round-hero.mjs");
  assert.match(source, /video\.currentTime\s*=\s*nextTime/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /data-second-round-cta/);
});

test("SECOND ROUND hero uses a shorter pinned full-screen scroll stage", () => {
  const source = read("second-round-hero.mjs");
  const css = read("second-round-hero.css");
  assert.match(css, /\.second-round-hero\s*\{[^}]*height:\s*360vh/s);
  assert.match(css, /\.second-round-stage\s*\{[^}]*position:\s*sticky[^}]*height:\s*100svh/s);
  assert.match(source, /compactViewport \? "270vh" : "360vh"/);
});

test("SECOND ROUND ends after inspection without a fourth poster scene", () => {
  const source = read("second-round-hero.mjs");
  assert.match(source, /01 \/ 03/);
  assert.doesNotMatch(source, /data-second-round-copy="3"/);
  assert.doesNotMatch(source, /다시, 라운드로\./);
});

test("SECOND ROUND clean landing contains no golf-hole landing plate", () => {
  const source = read("second-round-hero.mjs");
  const css = read("second-round-hero.css");
  assert.match(source, /second-round-surface/);
  assert.match(source, /surfaceOpacity = smoothstep/);
  assert.match(css, /\.second-round-surface\s*\{/);
  assert.doesNotMatch(source, /grass_landing_plate|GRASS_PLATE|second-round-grass/);
  assert.doesNotMatch(css, /second-round-grass|grass_landing_plate/);
});

test("SECOND ROUND final bridge removes the empty media card and restores the header", () => {
  const source = read("second-round-hero.mjs");
  const css = read("second-round-hero.css");
  assert.match(source, /mediaOpacity = 1 - smoothstep\(0\.66, 0\.78, p\)/);
  assert.match(source, /--sr-media-opacity/);
  assert.match(source, /second-round-active", p < 0\.68/);
  assert.match(css, /opacity:\s*var\(--sr-media-opacity\)/);
  assert.match(css, /\.second-round-media\s*\{[^}]*transform:\s*none[^}]*box-shadow:\s*none/s);
  assert.doesNotMatch(source, /mediaX\s*=\s*bridgeProgress|mediaScale\s*=\s*1 - bridgeProgress/);
});

test("SECOND ROUND final copy is deliberately two lines and CTA is compact", () => {
  const source = read("second-round-hero.mjs");
  const css = read("second-round-hero.css");
  assert.match(source, /<h2><span>당신의 다음 라운드를<\/span><span>고르세요\.<\/span><\/h2>/);
  assert.match(css, /\.second-round-bridge h2 span\s*\{[^}]*display:\s*block[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.second-round-cta\s*\{[^}]*min-height:\s*44px[^}]*font-size:\s*12px/s);
});

test("SECOND ROUND moves products directly after the hero and CTA targets the first product card", () => {
  const source = read("second-round-hero.mjs");
  assert.match(source, /section\.after\(products\)/);
  assert.match(source, /products\.insertBefore\(productGrid, carousel\)/);
  assert.match(source, /#products \.featured-product-grid \.product-card/);
  assert.match(source, /window\.scrollTo\(\{ top, behavior:/);
});
