import { expect, test } from "@playwright/test";

const variantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const orderId = "RB-CHECKOUT-SYNTHETIC-001";

// All remote traffic is intercepted. These are browser/controller regressions,
// never evidence of provider authorization, real authentication or DB mutation.
async function checkoutHarness(page) {
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (route.request().resourceType() === "document") {
      const response = await route.fetch();
      const body = (await response.text())
        .replace(/(<meta name="reball-supabase-url" content=")[^"]*(")/, "$1https://checkout.synthetic.invalid$2")
        .replace(/(<meta name="reball-supabase-publishable-key" content=")[^"]*(")/, "$1synthetic-public-key$2");
      return route.fulfill({ response, body });
    }
    return route.continue();
  });
  await page.route("**/@supabase/supabase-js@*/+esm", route => route.fulfill({
    contentType: "application/javascript",
    body: `export function createClient() {
      const products = [{slug:'titleist-pro-v1-v1x-lostball',name:'Synthetic checkout product',
        brands:{slug:'titleist',name:'타이틀리스트'}, product_variants:[{
          id:'${variantId}',sku:'SYNTHETIC-A-10',option_model:'PRO V1',option_color:'화이트',
          grade:'A',pack_size:10,price_krw:15000,stock_qty:3,active:true
        }]}];
      return {auth:{getSession:async()=>({data:{session:null}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
        from:table=>{const chain=new Proxy({}, {get(_target,key){
          if(key==='then') return resolve=>resolve({data:table==='products'?products:[],error:null});
          return ()=>chain;
        }});return chain;}};
    }`,
  }));
  await page.goto("/#/product/titleist-pro-v1-v1x-lostball");
  await expect(page.locator("main h1")).toHaveText("Synthetic checkout product");
  await page.locator("[data-add-detail]").click();
  await page.goto("/#/cart");
  await expect(page.locator(".cart-item")).toContainText("Synthetic checkout product");
  await page.locator('[data-route="/checkout"]').click();
  await expect(page).toHaveURL(/#\/checkout$/);
  const form = page.locator("[data-checkout-form]");
  await form.locator('[name="name"]').fill("Synthetic recipient");
  await form.locator('[name="phone"]').fill("010-0000-0000");
  await form.locator('[name="zipCode"]').fill("12345");
  await form.locator('[name="roadAddress"]').fill("Synthetic test road");
  await form.locator('[name="detailAddress"]').fill("Synthetic unit");
  await form.locator('[name="payment"][value="transfer"]').check();
  return form;
}

test("checkout keeps address and method through pending, failure and same-key retry", async ({ page }) => {
  const requests = [];
  const form = await checkoutHarness(page);
  await page.route("**/functions/v1/create-order", route => { requests.push(route); });
  // The storefront has no agreement checkbox; provider terms belong to Toss.
  await expect(form.locator('input[type="checkbox"]')).toHaveCount(0);
  const submit = form.locator('[type="submit"]');
  await submit.click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  await expect(form.locator('[name="name"]')).toHaveValue("Synthetic recipient");
  await expect(form.locator('[name="payment"][value="transfer"]')).toBeChecked();
  // Even a second submit event while the first response is pending is ignored.
  await form.evaluate(node => node.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(requests).toHaveLength(1);
  await requests[0].fulfill({ status: 503, json: { message: "Synthetic temporary outage" } });
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("body")).toContainText("Synthetic temporary outage");
  await expect(form.locator('[name="roadAddress"]')).toHaveValue("Synthetic test road");
  await expect(form.locator('[name="detailAddress"]')).toHaveValue("Synthetic unit");
  await expect(form.locator('[name="payment"][value="transfer"]')).toBeChecked();
  await submit.click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].request().headers()["idempotency-key"])
    .toBe(requests[0].request().headers()["idempotency-key"]);
  expect(requests[1].request().postDataJSON()).toEqual(requests[0].request().postDataJSON());
  await requests[1].fulfill({ json: { skipPayment: true, lookupToken: "synthetic-lookup-token",
    order: { id: "synthetic-db-order", orderNo: orderId, status: "payment_ready", paymentStatus: "ready", totalKrw: 18500, items: [] } } });
  await expect(page).toHaveURL(new RegExp(`#/order/${orderId}$`));
  await expect(page.locator("body")).toContainText(orderId);
});

test("invalid shipping details never create an order and can be corrected", async ({ page }) => {
  let requests = 0;
  const form = await checkoutHarness(page);
  await page.route("**/functions/v1/create-order", route => {
    requests += 1;
    return route.fulfill({ status: 400, json: { message: "Synthetic validation result" } });
  });
  await form.locator('[name="zipCode"]').fill("123");
  await form.locator('[type="submit"]').click();
  expect(requests).toBe(0);
  await expect(form.locator('[name="name"]')).toHaveValue("Synthetic recipient");
  await form.locator('[name="zipCode"]').fill("12345");
  await form.locator('[type="submit"]').click();
  await expect.poll(() => requests).toBe(1);
  await expect(form.locator('[type="submit"]')).toBeEnabled();
});
