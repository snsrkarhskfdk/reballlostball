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

const production = {
  VERCEL_ENV: "production", AUTH_CAPTCHA_PROVIDER: "turnstile",
  AUTH_CAPTCHA_SITE_KEY: "actual-site-fixture", TOSS_CLIENT_KEY: "live_ck_fixture",
};
test("production refuses empty/sandbox payment keys and Cloudflare dummy sitekeys", () => {
  for (const key of ["", "test_ck_fixture", "test_gck_fixture"]) {
    assert.throws(() => injectPublicConfig(template, { ...production, TOSS_CLIENT_KEY: key }), /LIVE/);
  }
  for (const sitekey of ["1x00000000000000000000AA", "2x00000000000000000000AB", "1x00000000000000000000BB", "2x00000000000000000000BB", "3x00000000000000000000FF"]) {
    assert.throws(() => injectPublicConfig(template, { ...production, AUTH_CAPTCHA_SITE_KEY: sitekey }), /test site key/);
  }
  assert.match(injectPublicConfig(template, production), /live_ck_fixture/);
  assert.match(injectPublicConfig(template, { ...production, VERCEL_ENV: "preview", TOSS_CLIENT_KEY: "test_ck_fixture", AUTH_CAPTCHA_SITE_KEY: "1x00000000000000000000AA" }), /test_ck_fixture/);
});


test("hCaptcha remains available in local/preview while production stays Turnstile only", () => {
  for (const VERCEL_ENV of ["", "preview"]) {
    assert.match(injectPublicConfig(template, { ...production, VERCEL_ENV, SUPABASE_URL: "https://staging.supabase.test", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture", AUTH_CAPTCHA_PROVIDER: "hcaptcha", PUBLIC_CONFIG_REQUIRED: "true" }), /content="hcaptcha"/);
  }
  assert.throws(() => injectPublicConfig(template, { ...production, AUTH_CAPTCHA_PROVIDER: "hcaptcha" }), /Turnstile/);
  assert.throws(() => injectPublicConfig(template, { ...production, VERCEL_ENV: "preview", AUTH_CAPTCHA_PROVIDER: "unknown" }), /provider/);
});
