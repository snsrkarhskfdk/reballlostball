import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCatalogSlug, sanitizeAssetReference } from "../../src/frontend/core/url-safety.mjs";

test("catalog slug는 route-safe 형식만 허용한다", () => {
  assert.equal(normalizeCatalogSlug("titleist-pro-v1"), "titleist-pro-v1");
  assert.equal(normalizeCatalogSlug('x" onclick="alert(1)'), "");
});

test("asset URL은 HTTPS 또는 안전한 동일 출처 경로만 허용한다", () => {
  assert.equal(sanitizeAssetReference("https://cdn.example.com/ball image.webp"), "https://cdn.example.com/ball%20image.webp");
  assert.equal(sanitizeAssetReference("/assets/ball.webp", "", "http://127.0.0.1:3000"), "/assets/ball.webp");
  assert.equal(sanitizeAssetReference("ball image.webp"), "ball%20image.webp");
  for (const unsafe of [
    'https://cdn.example/x" onerror="alert(1)',
    "data:image/svg+xml,<svg onload=alert(1)>",
    "javascript:alert(1)",
    "http://insecure.example/ball.png",
    "../secret.png",
  ]) assert.equal(sanitizeAssetReference(unsafe), "");
});
