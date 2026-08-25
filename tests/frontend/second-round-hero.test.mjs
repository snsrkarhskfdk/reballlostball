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
  assert.match(source, /document\.getElementById\("products"\)/);
});

test("SECOND ROUND hero uses a pinned full-screen scroll stage", () => {
  const css = read("second-round-hero.css");
  assert.match(css, /\.second-round-hero\s*\{[^}]*height:\s*460vh/s);
  assert.match(css, /\.second-round-stage\s*\{[^}]*position:\s*sticky[^}]*height:\s*100svh/s);
});

test("SECOND ROUND ends after inspection without the poster-like fourth brand scene", () => {
  const source = read("second-round-hero.mjs");
  assert.match(source, /01 \/ 03/);
  assert.match(source, /compactViewport \? "290vh" : "390vh"/);
  assert.match(source, /bridgeProgress = smoothstep\(0\.72, 0\.95, p\)/);
  assert.doesNotMatch(source, /data-second-round-copy="3"/);
  assert.doesNotMatch(source, /다시, 라운드로\./);
});
