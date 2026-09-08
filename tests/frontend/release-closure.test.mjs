import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { todayIso } from "../../src/frontend/account/presentation.mjs";
import { checkLoginIdAvailability } from "../../src/frontend/auth/login-id-client.mjs";
import { injectPublicConfig } from "../../scripts/public-config.mjs";

test("Korea business date does not drift to UTC date", () => {
  assert.equal(todayIso(new Date("2026-09-08T16:30:00.000Z")), "2026-09-09");
  assert.equal(todayIso(new Date("2026-09-08T00:30:00.000Z")), "2026-09-08");
});

test("login ID availability is decided by the server endpoint", async () => {
  let requestBody = null;
  const fetchImpl = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ loginId: "reballuser", available: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await checkLoginIdAvailability(
    { baseUrl: "https://example.supabase.co", anonKey: "public", fetchImpl },
    { loginId: "ReballUser", captchaToken: "captcha-proof" }
  );
  assert.deepEqual(requestBody, { loginId: "reballuser", captchaToken: "captcha-proof" });
  assert.equal(result.available, false);
});

test("production build refuses missing Turnstile public config", () => {
  const html = readFileSync("index.html", "utf8");
  assert.throws(
    () => injectPublicConfig(html, {
      VERCEL_ENV: "production",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "public",
    }),
    /Turnstile|CAPTCHA/
  );

  const output = injectPublicConfig(html, {
    VERCEL_ENV: "production",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public",
    AUTH_CAPTCHA_PROVIDER: "turnstile",
    AUTH_CAPTCHA_SITE_KEY: "site-key",
  });
  assert.match(output, /name="reball-captcha-provider" content="turnstile"/);
  assert.match(output, /name="reball-captcha-site-key" content="site-key"/);
});

test("release routing and deployment authority are closed", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.equal(vercel.rewrites.some((rule) => rule.source === "/(.*)" && rule.destination === "/index.html"), false);
  assert.equal(vercel.rewrites.some((rule) => rule.source === "/payment/:path*" && rule.destination === "/index.html"), true);
  assert.equal(vercel.redirects.some((rule) => rule.destination.startsWith("https://reballlostball.com/")), true);

  const index = readFileSync("index.html", "utf8");
  assert.match(index, /rel="canonical" href="https:\/\/reballlostball\.com\/"/);
  assert.match(index, /https:\/\/reballlostball\.com\/assets\/figma\/og-image\.png/);
  assert.match(index, /runtime\/release-closure\.mjs/);
  assert.doesNotMatch(index, /fonts\.googleapis\.com/);

  const manifest = JSON.parse(readFileSync("assets/figma/site.webmanifest", "utf8"));
  assert.match(manifest.description, /S\/A\+\/A\/B/);

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.engines.node, "22.x");
  assert.equal(existsSync(".github/workflows/pages.yml"), false);
  assert.equal(existsSync("CNAME"), false);
  assert.equal(existsSync(".nojekyll"), false);
  assert.equal(existsSync("robots.txt"), true);
  assert.equal(existsSync("sitemap.xml"), true);
  assert.equal(existsSync("404.html"), true);
});
