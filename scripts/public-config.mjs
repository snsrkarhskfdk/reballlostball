const META_ENV = Object.freeze({
  "reball-supabase-url": ["SUPABASE_URL"],
  "reball-supabase-publishable-key": ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"],
  "reball-toss-client-key": ["TOSS_CLIENT_KEY", "TOSS_PAYMENTS_CLIENT_KEY"],
  "reball-captcha-provider": ["AUTH_CAPTCHA_PROVIDER", "CAPTCHA_PROVIDER"],
  "reball-captcha-site-key": ["AUTH_CAPTCHA_SITE_KEY", "CAPTCHA_SITE_KEY"],
});

// These values are browser-public project metadata. Authorization remains enforced
// by Supabase Auth, RLS, and the Edge Function trust boundary.
const VERCEL_PUBLIC_DEFAULTS = Object.freeze({
  "reball-supabase-url": "https://qbftalhhyfcndanrcwpy.supabase.co",
  "reball-supabase-publishable-key": "sb_publishable_K876i166RCGtBxdp3xRQZw_yJxPaKwL",
});

function firstValue(env, names) {
  return names.map((name) => String(env[name] || "").trim()).find(Boolean) || "";
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function validate(values, requireComplete) {
  const url = values["reball-supabase-url"];
  const key = values["reball-supabase-publishable-key"];
  if (Boolean(url) !== Boolean(key)) throw new Error("SUPABASE_URL과 publishable key는 함께 설정해야 합니다.");
  if (url) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(parsed.origin)) {
      throw new Error("SUPABASE_URL은 HTTPS 또는 로컬 주소여야 합니다.");
    }
  }
  const provider = values["reball-captcha-provider"].toLowerCase();
  const siteKey = values["reball-captcha-site-key"];
  if (Boolean(provider) !== Boolean(siteKey)) throw new Error("CAPTCHA provider와 site key는 함께 설정해야 합니다.");
  if (provider && !new Set(["turnstile", "hcaptcha"]).has(provider)) throw new Error("지원하지 않는 CAPTCHA provider입니다.");
  values["reball-captcha-provider"] = provider;
  const tossKey = values["reball-toss-client-key"];
  if (tossKey && !/^(test|live)_(?:g?ck)_/.test(tossKey)) throw new Error("Toss client key 형식이 올바르지 않습니다.");
  if (requireComplete && (!url || !key || !provider || !siteKey)) {
    throw new Error("운영 빌드에 필요한 공개 Supabase/CAPTCHA 설정이 없습니다.");
  }
}

export function injectPublicConfig(html, env = process.env) {
  const isVercelBuild = Boolean(env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL);
  const values = Object.fromEntries(
    Object.entries(META_ENV).map(([metaName, envNames]) => [
      metaName,
      firstValue(env, envNames) || (isVercelBuild ? VERCEL_PUBLIC_DEFAULTS[metaName] || "" : ""),
    ])
  );
  validate(values, String(env.PUBLIC_CONFIG_REQUIRED || "").toLowerCase() === "true");
  let output = String(html);
  for (const [name, value] of Object.entries(values)) {
    const pattern = new RegExp(`(<meta\\s+name=["']${name}["']\\s+content=["'])[^"']*(["']\\s*\\/?>)`, "i");
    if (!pattern.test(output)) throw new Error(`index.html에 ${name} meta가 없습니다.`);
    output = output.replace(pattern, (_match, prefix, suffix) => `${prefix}${escapeAttribute(value)}${suffix}`);
  }
  return output;
}
