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

test("SECOND ROUND scrubs the actual video with scroll and remounts after SPA renders", () => {
  const source = read("second-round-hero.mjs");
  assert.match(source, /video\.currentTime\s*=\s*nextTime/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /scrub = clamp\(p \/ 0\.995\)/);
});

test("SECOND ROUND uses a compact pinned sequence before the normal storefront", () => {
  const source = read("second-round-hero.mjs");
  const css = read("second-round-hero.css");
  assert.match(css, /\.second-round-hero\s*\{[^}]*height:\s*220vh/s);
  assert.match(css, /\.second-round-stage\s*\{[^}]*position:\s*sticky[^}]*height:\s*100svh/s);
  assert.match(source, /compactViewport \? "190vh" : "220vh"/);
});

test("SECOND ROUND has no post-video frame sequence or decorative final scene", () => {
  const source = read("second-round-hero.mjs");
  const css = read("second-round-hero.css");
  assert.match(source, /01 \/ 03/);
  assert.doesNotMatch(source, /DROP_FRAME_COUNT|\/hero\/drop\/|data-second-round-frame/);
  assert.doesNotMatch(source, /data-second-round-copy="3"/);
  assert.doesNotMatch(source, /data-second-round-bridge|data-second-round-cta|second-round-paper|second-round-surface/);
  assert.doesNotMatch(source, /당신의 다음 라운드를|READY FOR YOUR ROUND/);
  assert.match(css, /\.second-round-frame,[\s\S]*\.second-round-cta\s*\{[\s\S]*display:\s*none !important/s);
});

test("SECOND ROUND ends the actual video at the storefront boundary", () => {
  const source = read("second-round-hero.mjs");
  assert.match(source, /p \/ 0\.995/);
  assert.match(source, /second-round-active", p < 0\.99/);
  assert.doesNotMatch(source, /frameOpacity|surfaceOpacity|bridgeProgress|mediaOpacity/);
});

test("SECOND ROUND moves normal products directly after the cinematic section", () => {
  const source = read("second-round-hero.mjs");
  const css = read("second-round-hero.css");
  assert.match(source, /section\.after\(products\)/);
  assert.match(source, /products\.insertBefore\(productGrid, carousel\)/);
  assert.match(css, /\.second-round-hero \+ #products[\s\S]*background: var\(--paper, #f7f6f1\)/);
  assert.doesNotMatch(source, /scrollToFirstProductCard|window\.scrollTo/);
});
