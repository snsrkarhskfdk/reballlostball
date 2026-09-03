import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [indexHtml, override] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("src/frontend/runtime/return-address-override.mjs", root), "utf8"),
]);

test("registered business address stays unchanged while return address uses Songnae collection location", () => {
  assert.match(override, /businessProfile\.returnAddress\s*=\s*"부천 소사구 송내동 300-12번지 1층"/);
  assert.doesNotMatch(override, /businessProfile\.address\s*=/);
});

test("return address override executes before storefront runtime", () => {
  const overrideIndex = indexHtml.indexOf("return-address-override.mjs");
  const appIndex = indexHtml.indexOf("app.js");
  assert.ok(overrideIndex >= 0);
  assert.ok(appIndex > overrideIndex);
});
