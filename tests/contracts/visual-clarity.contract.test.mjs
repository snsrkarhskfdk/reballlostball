import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [accessibilityCss, clarityCss, indexHtml] = await Promise.all([
  readFile(new URL("../../src/frontend/ui/accessibility-fixes.css", import.meta.url), "utf8"),
  readFile(new URL("../../src/frontend/ui/visual-clarity-fixes.css", import.meta.url), "utf8"),
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

test("SECOND ROUND final bridge has an intentional visible panel", () => {
  assert.match(clarityCss, /\.second-round-paper::before/);
  assert.match(clarityCss, /\.second-round-bridge \{[\s\S]*background: rgba\(255, 255, 255, 0\.92\)/);
  assert.match(clarityCss, /\.second-round-bridge h2 \{[\s\S]*color: #102a1b/);
  assert.match(clarityCss, /@media \(max-width: 760px\)[\s\S]*max-height: calc\(100svh - 28px\)/);
});

test("visual clarity guard loads last while the Toss path base remains intact", () => {
  const baseIndex = indexHtml.indexOf('<base href="/" />');
  const accessibilityIndex = indexHtml.indexOf("accessibility-fixes.css");
  const checkoutIndex = indexHtml.indexOf("checkout-fixes.css");
  const clarityIndex = indexHtml.indexOf("visual-clarity-fixes.css");
  assert.ok(baseIndex > 0, "Toss path-form success redirect requires the root base href");
  assert.ok(accessibilityIndex > 0 && checkoutIndex > accessibilityIndex && clarityIndex > checkoutIndex);
});
