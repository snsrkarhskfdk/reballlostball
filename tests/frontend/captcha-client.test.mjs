import test from "node:test";
import assert from "node:assert/strict";

import { captchaConfig, captchaTokenFromForm } from "../../src/frontend/auth/captcha-client.mjs";

function documentWithMeta(values = {}) {
  return {
    querySelector(selector) {
      const name = selector.match(/meta\[name="([^"]+)"\]/)?.[1];
      return name && Object.hasOwn(values, name) ? { content: values[name] } : null;
    },
  };
}

test("CAPTCHA는 지원 공급자와 site key가 모두 있어야 활성화된다", () => {
  assert.deepEqual(captchaConfig(documentWithMeta()), { provider: "", siteKey: "", supported: false });
  assert.deepEqual(
    captchaConfig(
      documentWithMeta({
        "reball-captcha-provider": "TURNSTILE",
        "reball-captcha-site-key": "site-key",
      })
    ),
    { provider: "turnstile", siteKey: "site-key", supported: true }
  );
  assert.equal(
    captchaConfig(
      documentWithMeta({
        "reball-captcha-provider": "unknown",
        "reball-captcha-site-key": "site-key",
      })
    ).supported,
    false
  );
});

test("CAPTCHA 토큰이 없으면 인증 요청을 fail-closed 한다", () => {
  const form = { querySelector: () => ({ value: "" }) };
  assert.throws(() => captchaTokenFromForm(form), /자동입력 방지 확인/);
});

test("CAPTCHA 토큰은 공백을 제거해 전달한다", () => {
  const form = { querySelector: () => ({ value: "  verified-token  " }) };
  assert.equal(captchaTokenFromForm(form), "verified-token");
});
