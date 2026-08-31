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
  assert.match(source, /scrub = clamp\(p \/ 0\.84\)/);
});

test("SECOND ROUND keeps a compact ending beat before the normal storefront", () => {
  const source = read("second-round-hero.mjs");
  const css = read("second-round-hero.css");
  assert.match(css, /\.second-round-hero\s*\{[^}]*height:\s*240vh/s);
  assert.match(css, /\.second-round-stage\s*\{[^}]*position:\s*sticky[^}]*height:\s*100svh/s);
  assert.match(source, /compactViewport \? "205vh" : "240vh"/);
});

test("SECOND ROUND restores one intentional golf ending still without the retired landing UI", () => {
  const source = read("second-round-hero.mjs");
  const css = read("second-round-hero.css");
  assert.match(source, /HERO_ENDING = "\/hero\/drop\/10\.webp"/);
  assert.match(source, /data-second-round-ending/);
  assert.doesNotMatch(source, /DROP_FRAME_COUNT|Array\.from\(\{ length:.*drop/i);
  assert.doesNotMatch(source, /data-second-round-copy="3"/);
  assert.doesNotMatch(source, /data-second-round-bridge|data-second-round-cta|second-round-paper|second-round-surface/);
  assert.doesNotMatch(source, /당신의 다음 라운드를|READY FOR YOUR ROUND/);
  assert.match(css, /\.second-round-video,[\s\S]*\.second-round-ending\s*\{[\s\S]*object-fit:\s*contain/s);
  assert.match(css, /\.second-round-frame,[\s\S]*\.second-round-cta\s*\{[\s\S]*display:\s*none !important/s);
});

test("SECOND ROUND crossfades before the sky-only tail and holds the intentional ending until storefront", () => {
  const source = read("second-round-hero.mjs");
  assert.match(source, /endingPhase = smoothstep\(0\.80, 0\.89, p\)/);
  assert.match(source, /--sr-video-opacity/);
  assert.match(source, /--sr-ending-opacity/);
  assert.match(source, /second-round-active", p < 0\.99/);
  assert.doesNotMatch(source, /surfaceOpacity|bridgeProgress|mediaOpacity/);
});

test("SECOND ROUND moves normal products directly after the cinematic section", () => {
  const source = read("second-round-hero.mjs");
  const css = read("second-round-hero.css");
  assert.match(source, /section\.after\(products\)/);
  assert.match(source, /products\.insertBefore\(productGrid, carousel\)/);
  assert.match(css, /\.second-round-hero \+ #products[\s\S]*background: var\(--paper, #f7f6f1\)/);
  assert.doesNotMatch(source, /scrollToFirstProductCard|window\.scrollTo/);
});
