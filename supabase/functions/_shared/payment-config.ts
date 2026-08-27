import { HttpError, isExplicitNonProductionRuntime } from "./core.ts";

function configuredUrl(name: string): URL {
  const value = String(Deno.env.get(name) || "").trim();
  try {
    const url = new URL(value);
    const localHttp = isExplicitNonProductionRuntime()
      && url.protocol === "http:"
      && new Set(["localhost", "127.0.0.1"]).has(url.hostname);
    if (url.protocol !== "https:" && !localHttp) throw new Error("protocol");
    if (url.username || url.password) throw new Error("credentials");
    return url;
  } catch {
    throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "결제 설정을 확인할 수 없습니다.");
  }
}

export function configuredPaymentCallbackUrl(name: string, expectedPath: string): string {
  const appOrigin = configuredUrl("APP_ORIGIN");
  if (appOrigin.pathname !== "/" || appOrigin.search || appOrigin.hash) {
    throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "결제 설정을 확인할 수 없습니다.");
  }
  const callback = configuredUrl(name);
  if (callback.origin !== appOrigin.origin
      || callback.pathname !== expectedPath
      || callback.search
      || callback.hash) {
    throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "결제 설정을 확인할 수 없습니다.");
  }
  return callback.toString();
}

export function configuredTossClientKey(): string {
  const value = String(
    Deno.env.get("TOSS_CLIENT_KEY") || Deno.env.get("TOSS_PAYMENTS_CLIENT_KEY") || "",
  ).trim();
  const clientMode = value.match(/^(test|live)_(?:g?ck)_/)?.[1];
  const secret = String(
    Deno.env.get("TOSS_SECRET_KEY") || Deno.env.get("TOSS_PAYMENTS_SECRET_KEY") || "",
  ).trim();
  const secretMode = secret.match(/^(test|live)_(?:g?sk)_/)?.[1];
  if (!clientMode || !secretMode || clientMode !== secretMode) {
    throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "결제 설정을 확인할 수 없습니다.");
  }
  return value;
}
