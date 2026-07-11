const PROVIDERS = Object.freeze({
  turnstile: {
    src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    globalName: "turnstile",
  },
  hcaptcha: {
    src: "https://js.hcaptcha.com/1/api.js?render=explicit",
    globalName: "hcaptcha",
  },
});

let loaderPromise = null;

function metaContent(documentRef, name) {
  return documentRef.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
}

export function captchaConfig(documentRef = document) {
  const provider = metaContent(documentRef, "reball-captcha-provider").toLowerCase();
  const siteKey = metaContent(documentRef, "reball-captcha-site-key");
  return { provider, siteKey, supported: Boolean(PROVIDERS[provider] && siteKey) };
}

function loadProvider(documentRef, provider) {
  const definition = PROVIDERS[provider];
  if (!definition) return Promise.reject(new Error("지원하지 않는 CAPTCHA 공급자입니다."));
  if (globalThis[definition.globalName]) return Promise.resolve(globalThis[definition.globalName]);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const existing = documentRef.querySelector(`script[data-captcha-provider="${provider}"]`);
    const script = existing || documentRef.createElement("script");
    if (!existing) {
      script.src = definition.src;
      script.async = true;
      script.defer = true;
      script.dataset.captchaProvider = provider;
      documentRef.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve(globalThis[definition.globalName]), { once: true });
    script.addEventListener("error", () => reject(new Error("자동입력 방지 모듈을 불러오지 못했습니다.")), { once: true });
  });
  return loaderPromise;
}

export async function mountCaptchaWidgets(documentRef = document) {
  const config = captchaConfig(documentRef);
  const widgets = Array.from(documentRef.querySelectorAll("[data-captcha-widget]"));
  if (!widgets.length) return;
  if (!config.supported) {
    for (const widget of widgets) {
      widget.closest("[data-captcha-control]")?.setAttribute("data-captcha-status", "unconfigured");
      const status = widget.closest("[data-captcha-control]")?.querySelector("[data-captcha-message]");
      if (status) status.textContent = "자동입력 방지 설정 후 이용할 수 있습니다.";
    }
    return;
  }

  try {
    const client = await loadProvider(documentRef, config.provider);
    for (const widget of widgets) {
      if (widget.dataset.captchaMounted === "true") continue;
      const control = widget.closest("[data-captcha-control]");
      const input = control?.querySelector("[data-captcha-token]");
      const status = control?.querySelector("[data-captcha-message]");
      if (!input || typeof client?.render !== "function") continue;
      client.render(widget, {
        sitekey: config.siteKey,
        callback: (token) => {
          input.value = String(token || "");
          control?.setAttribute("data-captcha-status", "verified");
          if (status) status.textContent = "자동입력 방지 확인이 완료되었습니다.";
        },
        "expired-callback": () => {
          input.value = "";
          control?.setAttribute("data-captcha-status", "expired");
          if (status) status.textContent = "확인이 만료되었습니다. 다시 확인해 주세요.";
        },
        "error-callback": () => {
          input.value = "";
          control?.setAttribute("data-captcha-status", "error");
          if (status) status.textContent = "자동입력 방지 확인을 다시 시도해 주세요.";
        },
      });
      widget.dataset.captchaMounted = "true";
      control?.setAttribute("data-captcha-status", "ready");
    }
  } catch {
    for (const widget of widgets) {
      widget.closest("[data-captcha-control]")?.setAttribute("data-captcha-status", "error");
    }
  }
}

export function captchaTokenFromForm(form) {
  const token = String(form?.querySelector?.("[data-captcha-token]")?.value || "").trim();
  if (!token) throw new Error("자동입력 방지 확인을 완료해 주세요.");
  return token;
}
