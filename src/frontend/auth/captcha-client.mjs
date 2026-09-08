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

const CAPTCHA_LOAD_TIMEOUT_MS = 12_000;
let loaderPromise = null;
let loaderProvider = "";

function metaContent(documentRef, name) {
  return documentRef.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
}

export function captchaConfig(documentRef = document) {
  const provider = metaContent(documentRef, "reball-captcha-provider").toLowerCase();
  const siteKey = metaContent(documentRef, "reball-captcha-site-key");
  return { provider, siteKey, supported: Boolean(PROVIDERS[provider] && siteKey) };
}

function clearLoader(provider, script) {
  if (loaderProvider === provider) {
    loaderPromise = null;
    loaderProvider = "";
  }
  if (script?.isConnected && script.dataset.captchaLoadState === "failed") script.remove();
}

function loadProvider(documentRef, provider, { timeoutMs = CAPTCHA_LOAD_TIMEOUT_MS } = {}) {
  const definition = PROVIDERS[provider];
  if (!definition) return Promise.reject(new Error("지원하지 않는 CAPTCHA 공급자입니다."));
  if (globalThis[definition.globalName]) return Promise.resolve(globalThis[definition.globalName]);
  if (loaderPromise && loaderProvider === provider) return loaderPromise;
  if (loaderPromise && loaderProvider !== provider) {
    loaderPromise = null;
    loaderProvider = "";
  }

  let script = documentRef.querySelector(`script[data-captcha-provider="${provider}"]`);
  if (script?.dataset.captchaLoadState === "failed") {
    script.remove();
    script = null;
  }
  script ||= documentRef.createElement("script");
  if (!script.isConnected) {
    script.src = definition.src;
    script.async = true;
    script.defer = true;
    script.dataset.captchaProvider = provider;
    script.dataset.captchaLoadState = "loading";
  }

  loaderProvider = provider;
  loaderPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (error) {
        script.dataset.captchaLoadState = "failed";
        reject(error);
        return;
      }
      script.dataset.captchaLoadState = "loaded";
      resolve(globalThis[definition.globalName]);
    };
    const onLoad = () => finish(
      globalThis[definition.globalName]
        ? null
        : new Error("자동입력 방지 모듈 초기화에 실패했습니다.")
    );
    const onError = () => finish(new Error("자동입력 방지 모듈을 불러오지 못했습니다."));
    const timer = globalThis.setTimeout(
      () => finish(new Error("자동입력 방지 모듈 연결 시간이 초과되었습니다.")),
      Math.max(1, Number(timeoutMs) || CAPTCHA_LOAD_TIMEOUT_MS)
    );

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!script.isConnected) documentRef.head.appendChild(script);
  }).catch((error) => {
    clearLoader(provider, script);
    throw error;
  });

  return loaderPromise;
}

function removeRetryButton(control) {
  control?.querySelector("[data-captcha-retry]")?.remove();
}

function storedWidgetId(widget) {
  const value = widget?.dataset?.captchaWidgetId;
  return value == null || value === "" ? null : value;
}

export async function resetCaptchaControl(control, documentRef = document) {
  if (!control) return false;
  const input = control.querySelector("[data-captcha-token]");
  const widget = control.querySelector("[data-captcha-widget]");
  const status = control.querySelector("[data-captcha-message]");
  if (input) input.value = "";
  removeRetryButton(control);
  if (!widget) return false;

  const config = captchaConfig(documentRef);
  if (!config.supported) {
    widget.dataset.captchaMounted = "false";
    control.setAttribute("data-captcha-status", "unconfigured");
    if (status) status.textContent = "자동입력 방지 설정 후 이용할 수 있습니다.";
    return false;
  }

  try {
    const client = await loadProvider(documentRef, config.provider);
    const widgetId = storedWidgetId(widget);
    if (widgetId !== null && typeof client?.reset === "function") {
      client.reset(widgetId);
      widget.dataset.captchaMounted = "true";
      control.setAttribute("data-captcha-status", "ready");
      if (status) status.textContent = "자동입력 방지 확인을 다시 완료해 주세요.";
      return true;
    }
    if (widgetId !== null && typeof client?.remove === "function") {
      client.remove(widgetId);
    }
    delete widget.dataset.captchaWidgetId;
    widget.dataset.captchaMounted = "false";
    widget.replaceChildren();
    control.setAttribute("data-captcha-status", "loading");
    if (status) status.textContent = "자동입력 방지 확인을 다시 불러오고 있습니다.";
    await mountCaptchaWidgets(documentRef);
    return widget.dataset.captchaMounted === "true";
  } catch (error) {
    widget.dataset.captchaMounted = "false";
    control.setAttribute("data-captcha-status", "error");
    if (status) status.textContent = error?.message || "자동입력 방지 확인을 다시 시도해 주세요.";
    ensureRetryButton(control, documentRef);
    return false;
  }
}

function ensureRetryButton(control, documentRef) {
  if (!control || control.querySelector("[data-captcha-retry]")) return;
  const button = documentRef.createElement("button");
  button.type = "button";
  button.dataset.captchaRetry = "true";
  button.className = "secondary-btn compact captcha-retry-btn";
  button.textContent = "자동입력 방지 다시 시도";
  button.addEventListener("click", async () => {
    button.disabled = true;
    control.setAttribute("data-captcha-status", "loading");
    const status = control.querySelector("[data-captcha-message]");
    if (status) status.textContent = "자동입력 방지 확인을 다시 불러오고 있습니다.";
    const reset = await resetCaptchaControl(control, documentRef);
    if (reset) button.remove();
    else button.disabled = false;
  });
  control.appendChild(button);
}

export async function mountCaptchaWidgets(documentRef = document) {
  const config = captchaConfig(documentRef);
  const widgets = Array.from(documentRef.querySelectorAll("[data-captcha-widget]"));
  if (!widgets.length) return;
  if (!config.supported) {
    for (const widget of widgets) {
      const control = widget.closest("[data-captcha-control]");
      control?.setAttribute("data-captcha-status", "unconfigured");
      const status = control?.querySelector("[data-captcha-message]");
      if (status) status.textContent = "자동입력 방지 설정 후 이용할 수 있습니다.";
      removeRetryButton(control);
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
      removeRetryButton(control);
      const widgetId = client.render(widget, {
        sitekey: config.siteKey,
        callback: (token) => {
          input.value = String(token || "");
          control?.setAttribute("data-captcha-status", "verified");
          if (status) status.textContent = "자동입력 방지 확인이 완료되었습니다.";
          removeRetryButton(control);
        },
        "expired-callback": () => {
          input.value = "";
          control?.setAttribute("data-captcha-status", "expired");
          if (status) status.textContent = "확인이 만료되었습니다. 다시 확인해 주세요.";
          ensureRetryButton(control, documentRef);
        },
        "error-callback": () => {
          input.value = "";
          control?.setAttribute("data-captcha-status", "error");
          if (status) status.textContent = "자동입력 방지 확인을 다시 시도해 주세요.";
          ensureRetryButton(control, documentRef);
        },
      });
      widget.dataset.captchaWidgetId = String(widgetId);
      widget.dataset.captchaMounted = "true";
      control?.setAttribute("data-captcha-status", "ready");
    }
  } catch (error) {
    for (const widget of widgets) {
      const control = widget.closest("[data-captcha-control]");
      widget.dataset.captchaMounted = "false";
      control?.setAttribute("data-captcha-status", "error");
      const status = control?.querySelector("[data-captcha-message]");
      if (status) status.textContent = error?.message || "자동입력 방지 모듈을 불러오지 못했습니다.";
      ensureRetryButton(control, documentRef);
    }
  }
}

export function captchaTokenFromForm(form) {
  const token = String(form?.querySelector?.("[data-captcha-token]")?.value || "").trim();
  if (!token) throw new Error("자동입력 방지 확인을 완료해 주세요.");
  return token;
}

export { CAPTCHA_LOAD_TIMEOUT_MS };
