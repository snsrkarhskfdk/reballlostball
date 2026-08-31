import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [accessibilityCss, clarityCss, heroCss, heroJs, indexHtml] = await Promise.all([
  readFile(new URL("../../src/frontend/ui/accessibility-fixes.css", import.meta.url), "utf8"),
  readFile(new URL("../../src/frontend/ui/visual-clarity-fixes.css", import.meta.url), "utf8"),
  readFile(new URL("../../second-round-hero.css", import.meta.url), "utf8"),
  readFile(new URL("../../second-round-hero.mjs", import.meta.url), "utf8"),
  readFile(new URL("../../index.html", import.meta.url), "utf8"),
]);

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace("#", "");
  const [red, green, blue] = [0, 2, 4].map((offset) => channel(Number.parseInt(value.slice(offset, offset + 2), 16)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(left, right) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("home stages own a paper background and dark readable copy", () => {
  assert.match(accessibilityCss, /\.home-stage--trust,[\s\S]*background: var\(--paper, #f7f6f1\) !important/);
  assert.match(accessibilityCss, /\.home-stage \.home-stage-head > p,[\s\S]*color: var\(--turf, #2e5c3f\) !important/);
  assert.match(accessibilityCss, /\.home-stage \.home-stage-head h2,[\s\S]*color: var\(--ink, #14301f\) !important/);
  assert.ok(contrast("#14301f", "#f7f6f1") >= 7, "home heading must exceed AAA contrast");
  assert.ok(contrast("#2e5c3f", "#f7f6f1") >= 4.5, "home eyebrow must exceed AA contrast");
});

test("SECOND ROUND keeps the real ending still but retires decorative landing UI", () => {
  assert.match(heroJs, /HERO_ENDING = "\/hero\/drop\/10\.webp"/);
  assert.match(heroCss, /\.second-round-video,[\s\S]*\.second-round-ending\s*\{[\s\S]*object-fit:\s*contain/s);
  assert.match(clarityCss, /\.second-round-paper,[\s\S]*\.second-round-cta\s*\{[\s\S]*display:\s*none !important/s);
  assert.match(clarityCss, /\.second-round-paper::before,[\s\S]*content:\s*none !important/s);
  assert.doesNotMatch(clarityCss, /radial-gradient\(circle, rgba\(20, 48, 31, 0\.12\)/);
  assert.doesNotMatch(clarityCss, /READY FOR YOUR ROUND/);
});

test("visual clarity guard loads last while the Toss path base remains intact", () => {
  const baseIndex = indexHtml.indexOf('<base href="/" />');
  const accessibilityIndex = indexHtml.indexOf("accessibility-fixes.css");
  const checkoutIndex = indexHtml.indexOf("checkout-fixes.css");
  const clarityIndex = indexHtml.indexOf("visual-clarity-fixes.css");
  assert.ok(baseIndex > 0, "Toss path-form success redirect requires the root base href");
  assert.ok(accessibilityIndex > 0 && checkoutIndex > accessibilityIndex && clarityIndex > checkoutIndex);
  assert.match(indexHtml, /second-round-hero\.css\?v=20260901-01/);
  assert.match(indexHtml, /second-round-hero\.mjs\?v=20260901-01/);
});
