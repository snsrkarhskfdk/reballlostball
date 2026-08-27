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

test("light home stages keep dark readable headings", () => {
  assert.match(accessibilityCss, /\.home-stage \.home-stage-head > p[\s\S]*color: var\(--turf\) !important/);
  assert.match(accessibilityCss, /\.home-stage \.home-stage-head h2[\s\S]*color: var\(--ink\) !important/);
  assert.doesNotMatch(accessibilityCss, /#home-shipping-title[\s\S]{0,120}color: var\(--chalk\)/);
  assert.ok(contrast("#14301f", "#f7f6f1") >= 7, "home heading must exceed AAA contrast");
  assert.ok(contrast("#2e5c3f", "#f7f6f1") >= 4.5, "home eyebrow must exceed AA contrast");
});

test("SECOND ROUND final bridge is a visible panel rather than an empty paper frame", () => {
  assert.match(clarityCss, /\.second-round-paper::before/);
  assert.match(clarityCss, /radial-gradient\(circle, rgba\(20, 48, 31, 0\.12\)/);
  assert.match(clarityCss, /\.second-round-bridge \{[\s\S]*background: rgba\(255, 255, 255, 0\.92\)/);
  assert.match(clarityCss, /\.second-round-bridge h2 \{[\s\S]*color: #102a1b/);
  assert.ok(contrast("#102a1b", "#ffffff") >= 7, "final heading must exceed AAA contrast");
  assert.ok(contrast("#46594b", "#ffffff") >= 4.5, "final support copy must exceed AA contrast");
});

test("visual clarity guard loads after legacy and checkout styles", () => {
  const accessibility = indexHtml.indexOf("accessibility-fixes.css?v=20260828-01");
  const checkout = indexHtml.indexOf("checkout-fixes.css?v=20260827-01");
  const clarity = indexHtml.indexOf("visual-clarity-fixes.css?v=20260828-01");
  assert.ok(accessibility >= 0 && checkout >= 0 && clarity >= 0);
  assert.ok(clarity > accessibility && clarity > checkout, "clarity guard must be the last storefront stylesheet");
});
