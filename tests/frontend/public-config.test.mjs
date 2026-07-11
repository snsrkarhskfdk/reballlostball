import test from "node:test";
import assert from "node:assert/strict";

import { injectPublicConfig } from "../../scripts/public-config.mjs";

const template = `
<meta name="reball-supabase-url" content="" />
<meta name="reball-supabase-publishable-key" content="" />
<meta name="reball-toss-client-key" content="" />
<meta name="reball-captcha-provider" content="" />
<meta name="reball-captcha-site-key" content="" />`;

test("공개 런타임 설정을 정적 HTML meta에 주입한다", () => {
  const output = injectPublicConfig(template, {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
    TOSS_CLIENT_KEY: "test_ck_public",
    AUTH_CAPTCHA_PROVIDER: "turnstile",
    AUTH_CAPTCHA_SITE_KEY: "captcha-public",
  });
  assert.match(output, /reball-supabase-url" content="https:\/\/example\.supabase\.co"/);
  assert.match(output, /reball-captcha-provider" content="turnstile"/);
  assert.match(output, /reball-toss-client-key" content="test_ck_public"/);
});

test("Vercel build는 공개 Supabase metadata만 안전한 기본값으로 사용한다", () => {
  const output = injectPublicConfig(template, { VERCEL: "1" });
  assert.match(output, /reball-supabase-url" content="https:\/\/qbftalhhyfcndanrcwpy\.supabase\.co"/);
  assert.match(output, /reball-supabase-publishable-key" content="sb_publishable_[A-Za-z0-9_-]+"/);
  assert.match(output, /reball-toss-client-key" content=""/);
  assert.match(output, /reball-captcha-site-key" content=""/);
});

test("짝이 맞지 않는 공개 설정은 빌드 전에 거부한다", () => {
  assert.throws(() => injectPublicConfig(template, { SUPABASE_URL: "https://example.supabase.co" }), /함께 설정/);
  assert.throws(() => injectPublicConfig(template, { CAPTCHA_PROVIDER: "turnstile" }), /함께 설정/);
});
