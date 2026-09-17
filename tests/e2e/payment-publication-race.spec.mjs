import { expect, test } from "@playwright/test";

const orderId = "RB-SESSION-PUBLICATION-001";
const order = { id: "synthetic-db-order", orderNo: orderId, status: "paid", paymentStatus: "done", totalKrw: 17000, items: [] };

async function browserHarness(page, initialUser) {
  await page.addInitScript(user => {
    window.__initialUser = user;
    window.__orderEvents = [];
    document.addEventListener("reball:order-updated", event => window.__orderEvents.push(event.detail));
    window.__owner = () => {
      let owner = null;
      document.dispatchEvent(new CustomEvent("reball:order-owner", { detail: { capture: value => { owner = value; } } }));
      return owner;
    };
  }, initialUser);
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (["image", "font", "media"].includes(route.request().resourceType())) return route.abort();
    if (url.hostname === "127.0.0.1") {
      if (route.request().resourceType() === "document") {
        const response = await route.fetch();
        const body = (await response.text())
          .replace(/(<meta name="reball-supabase-url" content=")[^"]*(")/, "$1https://reball-test.invalid$2")
          .replace(/(<meta name="reball-supabase-publishable-key" content=")[^"]*(")/, "$1synthetic-public-key$2");
        return route.fulfill({ response, body });
      }
      return route.continue();
    }
    return route.abort();
  });
  await page.route("**/@supabase/supabase-js@*/+esm", route => route.fulfill({
    contentType: "application/javascript",
    body: `
      export function createClient() {
        const callbacks = [];
        const sessionFor = id => id ? { user: { id, email: id + '@synthetic.invalid' }, access_token: 'synthetic-token-' + id } : null;
        let session = sessionFor(window.__initialUser);
        window.__authEmit = (event, id) => { session = sessionFor(id); callbacks.forEach(callback => callback(event, session)); };
        const query = table => { const chain = new Proxy({}, { get(_target, key) {
          if (key === 'then') return resolve => resolve({ data: table === 'profiles' ? { id: session?.user.id, name: 'Synthetic' } : [], error: null });
          return () => chain;
        } }); return chain; };
        return { auth: {
          getSession: async () => ({ data: { session }, error: null }),
          onAuthStateChange: callback => { callbacks.push(callback); return { data: { subscription: { unsubscribe() {} } } }; },
          signOut: async () => ({ error: null })
        }, from: query, rpc: async () => ({ data: [], error: null }) };
      }
    `,
  }));
  await page.route("**/functions/v1/get-order", route => route.fulfill({ json: { order } }));
}

async function switchOwner(page, mode) {
  if (mode === "same") {
    return;
  }
  const epoch = await page.evaluate(() => window.__owner().epoch);
  if (mode === "logout" || mode === "logout-A") {
    await page.evaluate(() => window.__authEmit("SIGNED_OUT", null));
    await expect.poll(() => page.evaluate(() => window.__owner().epoch)).toBeGreaterThan(epoch);
  }
  if (mode !== "logout") {
    const user = mode === "logout-A" ? "A" : "B";
    await page.evaluate(id => window.__authEmit("SIGNED_IN", id), user);
    await expect.poll(() => page.evaluate(() => window.__owner().userId)).toBe(user);
  }
}

for (const flow of ["confirm", "cancel"]) {
  for (const mode of ["B", "logout", "logout-A", "guest-member", "same"]) {
    for (const failure of [false, true]) {
      test(`${flow}: ${mode} delayed ${failure ? "failure" : "success"} browser publication`, async ({ page }) => {
        const initial = mode === "guest-member" ? null : "A";
        await browserHarness(page, initial);
        let held;
        await page.route(`**/functions/v1/payment-${flow}`, route => { held = route; });
        if (flow === "confirm") {
          await page.goto(`/?paymentKey=synthetic-payment&orderId=${orderId}&amount=17000#/payment/success`);
        } else {
          await page.goto("/#/");
          await expect.poll(() => page.evaluate(() => window.__owner()?.userId)).toBe(initial);
          await page.evaluate(id => {
            document.querySelector("#app").innerHTML = `<main class="complete-page"><h1>Synthetic order</h1><dl><div><dt>주문번호</dt><dd>${id}</dd></div><div><dt>주문상태</dt><dd>결제 완료</dd></div><div><dt>결제상태</dt><dd>결제 완료</dd></div></dl><div class="action-row center"><button data-payment-cancel-order="${id}">결제 취소</button></div></main>`;
          }, orderId);
          page.once("dialog", dialog => dialog.accept());
          await page.locator("[data-payment-cancel-order]").click();
        }
        await expect.poll(() => Boolean(held)).toBe(true);
        await switchOwner(page, mode);
        if (mode !== "same") {
          await page.evaluate(() => { location.hash = "/"; });
          await expect(page).toHaveURL(/#\/$/);
        }
        const before = await page.evaluate(() => ({ url: location.href, events: window.__orderEvents.length, storage: JSON.stringify({ ...sessionStorage }) }));
        const finished = page.waitForResponse(response => response.url().endsWith(`/payment-${flow}`));
        await held.fulfill({ status: failure ? 400 : 200, json: failure
          ? { code: "DECLINED", message: "synthetic delayed decline" }
          : { paid: true, order: { ...order, status: flow === "cancel" ? "canceled" : "paid" }, guestLookupToken: "synthetic-return-token" } });
        await finished;
        // The response body and the app continuation must finish before inspecting the publication boundary.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (mode !== "same") {
          const after = await page.evaluate(() => ({ url: location.href, events: window.__orderEvents.length, storage: JSON.stringify({ ...sessionStorage }) }));
          expect(after).toEqual(before);
          await expect(page.locator("body")).not.toContainText("synthetic delayed decline");
        } else if (flow === "confirm") {
          await expect(page).toHaveURL(failure ? /#\/payment\/fail/ : new RegExp(`#\\/order\\/${orderId}$`));
        } else if (failure) {
          await expect(page.locator("[data-launch-hardening-status]")).toContainText("synthetic delayed decline");
        } else {
          await expect.poll(() => page.evaluate(() => window.__orderEvents.length)).toBe(1);
          await expect(page.locator("[data-payment-cancel-order]")).toHaveCount(0);
        }
      });
    }
  }
}

test("retry preparation rebinds the connected payment-return button after sign-in", async ({ page }) => {
  await browserHarness(page, null);
  const pending = [];
  await page.route("https://js.tosspayments.com/v2/standard", route => route.fulfill({
    contentType: "application/javascript",
    body: `window.__retrySdkRequests = []; window.TossPayments = () => ({
      payment: ({ customerKey }) => ({ requestPayment: payment => {
        window.__retrySdkRequests.push({ customerKey, payment });
        return Promise.resolve();
      } })
    });`,
  }));
  await page.route("**/functions/v1/prepare-payment", route => { pending.push(route); });
  // Finish initial guest auth before introducing a payment-return surface; its
  // initial epoch invalidation is distinct from the sign-in transition below.
  await page.goto("/#/");
  await expect.poll(() => page.evaluate(() => window.__owner()?.epoch || 0)).toBeGreaterThan(0);
  await page.evaluate(id => { location.hash = `/payment/fail?orderId=${id}`; }, orderId);
  await expect.poll(() => pending.length).toBe(1);
  const button = page.locator(`[data-payment-retry="${orderId}"]`);
  await expect(button).toBeDisabled();
  await button.evaluate(element => { window.__originalRetryButton = element; });
  await page.evaluate(() => window.__authEmit("SIGNED_IN", "A"));
  await expect.poll(() => page.evaluate(() => window.__owner().userId)).toBe("A");
  await expect(page).toHaveURL(/#\/payment\/fail(?:\?|$)/);
  await expect.poll(() => pending.length).toBe(2);
  expect(await button.evaluate(element => element === window.__originalRetryButton)).toBe(true);

  const prepared = customerKey => ({ clientKey: "synthetic-client-key", customerKey,
    payment: { orderId, method: "CARD", amount: { currency: "KRW", value: 17000 },
      successUrl: "https://synthetic.invalid/payment/success", failUrl: "https://synthetic.invalid/payment/fail" } });
  const staleResponse = page.waitForResponse(response => response.url().endsWith("/prepare-payment"));
  await pending[0].fulfill({ json: prepared("stale-guest") });
  await staleResponse;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(button).toBeDisabled();
  expect(await page.evaluate(() => window.__retrySdkRequests)).toEqual([]);
  await pending[1].fulfill({ json: prepared("current-member-A") });
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(() => page.evaluate(() => window.__retrySdkRequests.map(request => request.customerKey)))
    .toEqual(["current-member-A"]);
});
