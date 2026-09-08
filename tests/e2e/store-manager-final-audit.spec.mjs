import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { injectAdminConsoleAssets } from "../../scripts/admin-console-assets.mjs";

const htmlPath = new URL("../../store-manager.html", import.meta.url);
const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const variantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const orderId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const fakeSupabaseModule = `
const role = new URL(location.href).searchParams.get("role") === "payments" ? "payments_manager" : "owner_admin";
const user = { id: "11111111-1111-4111-8111-111111111111", email: role === "payments_manager" ? "payments@example.com" : "owner@example.com" };
const session = { user, access_token: "test-access-token" };
const productRows = [{
  id:"${productId}", slug:"test-ball", name:"테스트 로스트볼", subtitle:"운영 테스트", summary:"테스트", base_price_krw:15000, detail_image_url:"", active:true, updated_at:new Date().toISOString(), brands:{name:"테스트",slug:"test"},
  product_variants:[{id:"${variantId}",sku:"TEST-A-10",option_model:"MODEL",option_color:"화이트",option_design:"",grade:"A",pack_size:10,price_krw:15000,compare_at_krw:null,stock_qty:3,thumbnail_url:"",active:true}]
}];
function query(table){
  const q={
    select(){return q},
    eq(){
      if(table==="user_roles") return Promise.resolve({data:[{role}],error:null});
      return q;
    },
    in(){
      if(table==="product_variants") return Promise.resolve({data:[{id:"${variantId}",low_stock_threshold:7}],error:null});
      return Promise.resolve({data:[],error:null});
    },
    order(){
      if(table==="products") return Promise.resolve({data:productRows,error:null});
      if(table==="product_variants") return Promise.resolve({data:[{id:"${variantId}",active:true,thumbnail_url:"",created_at:new Date().toISOString()}],error:null});
      return Promise.resolve({data:[],error:null});
    },
    single(){return Promise.resolve({data:table==="products"?{id:"${productId}",slug:"test-ball"}:null,error:null})}
  };
  return q;
}
export function createClient(){
  return {
    auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>({data:{session},error:null}),signOut:async()=>({error:null})},
    from:query,
    storage:{from:()=>({upload:async()=>({error:null}),getPublicUrl:()=>({data:{publicUrl:"https://fake.supabase.test/media/test.webp"}})})}
  };
}
`;

const virtualOrder = {
  id: orderId,
  order_no: "RB-VIRTUAL",
  status: "paid",
  payment_status: "done",
  payment_method: "virtual_account",
  total_krw: 26000,
  refund_amount: 0,
  created_at: new Date().toISOString(),
  address_snapshot: { receiverName:"테스터", receiverPhone:"01012345678", roadAddress:"부천시 소사구 경인로10번길 34" },
  order_items: [{ product_name:"테스트 로스트볼", variant_name:"A 10구", qty:1, line_total_krw:22500 }],
  payment: { method:"virtual_account", status:"done", approved_amount:26000, canceled_amount:0 },
  notes: [{payload_json:{note:"고객 연락처 확인"},created_at:new Date().toISOString()}],
  canCancel: true,
};
const paymentOnlyOrder = {
  id: orderId,
  order_no: "RB-VIRTUAL",
  status: "paid",
  payment_status: "done",
  payment_method: "virtual_account",
  total_krw: 26000,
  refund_amount: 0,
  created_at: new Date().toISOString(),
  payment: { method:"virtual_account", status:"done", approved_amount:26000, canceled_amount:0 },
  notes: [],
  canCancel: true,
  piiRedacted: true,
};

async function installMocks(page, capture, role = "owner") {
  const rawHtml = await readFile(htmlPath, "utf8");
  const html = injectAdminConsoleAssets(rawHtml
    .replace('meta name="reball-supabase-url" content=""', 'meta name="reball-supabase-url" content="https://fake.supabase.test"')
    .replace('meta name="reball-supabase-publishable-key" content=""', 'meta name="reball-supabase-publishable-key" content="test-publishable"'));
  await page.route("**/store-manager.html*", (route) => route.fulfill({ status:200, contentType:"text/html; charset=utf-8", body:html }));
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm", (route) => route.fulfill({ status:200, contentType:"text/javascript; charset=utf-8", body:fakeSupabaseModule }));
  await page.route("https://fake.supabase.test/functions/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const view = url.searchParams.get("view");
    const isPayments = role === "payments";
    let body = {};
    if (url.pathname.endsWith("/admin-console") && request.method() === "GET") {
      if (view === "dashboard") body = { metrics:{paidTodayCount:1,grossTodayKrw:26000,refundsTodayKrw:0,netTodayKrw:26000,pendingShipping:isPayments?undefined:1,lowStock:isPayments?undefined:1,outOfStock:isPayments?undefined:0,paymentAlerts:0},recentOrders:[{order_no:"RB-VIRTUAL",status:"paid",total_krw:26000}] };
      else if (view === "orders") body = { canPayments:true,canOrderPii:!isPayments,orders:[isPayments?paymentOnlyOrder:virtualOrder] };
      else if (view === "audit") body = { audit:[],orderEvents:[],people:{} };
      else if (view === "settings") body = { store:{},commerce:{},policies:[] };
      else if (view === "staff") body = { staff:[] };
    } else if (url.pathname.endsWith("/admin-members")) {
      body = { members:[] };
    } else if (url.pathname.endsWith("/admin-ops-extra") && request.method() === "GET") {
      if (view === "returns") body = { requests:[],cancelableOrders:[paymentOnlyOrder],canCancel:true };
      else if (view === "inquiries") body = { inquiries:[] };
      else if (view === "reviews") body = { reviews:[] };
      else if (view === "promo") body = { benefits:[],banners:[],canManageBanners:!isPayments };
      else if (view === "pos") body = { devices:[] };
      else if (view === "settlement") body = { metrics:{grossKrw:26000,canceledKrw:0,netKrw:26000,completedRefundKrw:0},rows:[],refunds:[] };
      else if (view === "brands") body = { brands:[{id:"ffffffff-ffff-4fff-8fff-ffffffffffff",name:"테스트",slug:"test",active:true}] };
    } else if (url.pathname.endsWith("/admin-ops-extra") && request.method() === "POST") {
      capture.adminOps.push(JSON.parse(request.postData() || "{}"));
      body = { result:{} };
    } else if (url.pathname.endsWith("/payment-cancel") && request.method() === "POST") {
      capture.paymentCancel.push({
        body: JSON.parse(request.postData() || "{}"),
        idempotencyKey: request.headers()["idempotency-key"] || "",
      });
      body = { order:{ orderNo:"RB-VIRTUAL", status:"canceled" } };
    } else {
      body = { result:{} };
    }
    await route.fulfill({ status:200, contentType:"application/json", headers:{"access-control-allow-origin":"*"}, body:JSON.stringify(body) });
  });
  await page.goto(`/store-manager.html${role === "payments" ? "?role=payments" : ""}`);
  await expect(page.locator("[data-app-panel]")).toBeVisible();
}

test("existing SKU low-stock threshold is rendered once and saved through the audited RPC", async ({ page }) => {
  const capture = { adminOps:[],paymentCancel:[] };
  await installMocks(page, capture);
  await page.locator('[data-tab="products"]').click();
  const control = page.locator(`[data-variant-id="${variantId}"] [data-final-threshold-control]`);
  await expect(control).toHaveCount(1);
  await expect(control).toBeVisible();
  await expect(control.locator("[data-final-threshold-input]")).toHaveValue("7");
  await control.locator("[data-final-threshold-input]").fill("9");
  await control.locator("[data-final-threshold-save]").click();
  await expect.poll(() => capture.adminOps.length).toBe(1);
  expect(capture.adminOps[0]).toEqual({
    action:"threshold_set",
    payload:{variantId,lowStockThreshold:9},
  });
});

test("Returns tab sends required refund account for a completed virtual-account cancellation", async ({ page }) => {
  const capture = { adminOps:[],paymentCancel:[] };
  await installMocks(page, capture);
  const promptValues = ["고객 요청", "20", "1234567890", "김연준"];
  let promptIndex = 0;
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "prompt") {
      await dialog.accept(promptValues[promptIndex++] || "");
      return;
    }
    await dialog.accept();
  });
  await page.locator('[data-tab="returns"]').click();
  await page.locator('[data-extra-cancel="RB-VIRTUAL"]').click();
  await expect.poll(() => capture.paymentCancel.length).toBe(1);
  expect(capture.paymentCancel[0].body.orderNo).toBe("RB-VIRTUAL");
  expect(capture.paymentCancel[0].body.reason).toBe("고객 요청");
  expect(capture.paymentCancel[0].body.refundReceiveAccount).toEqual({
    bank:"20",
    accountNumber:"1234567890",
    holderName:"김연준",
  });
  expect(capture.paymentCancel[0].body.idempotencyKey).toBeTruthy();
  expect(capture.paymentCancel[0].idempotencyKey).toBe(capture.paymentCancel[0].body.idempotencyKey);
});

test("payments manager sees cancellation finance data without customer shipping or note PII", async ({ page }) => {
  const capture = { adminOps:[],paymentCancel:[] };
  await installMocks(page, capture, "payments");
  await expect(page.locator('[data-tab="orders"]')).toBeVisible();
  await page.locator('[data-tab="orders"]').click();
  const card = page.locator('[data-order-no="RB-VIRTUAL"]');
  await expect(card).toContainText("고객 배송정보 비공개");
  await expect(card).toContainText("상품 상세 비공개");
  await expect(card).not.toContainText("테스터");
  await expect(card).not.toContainText("경인로10번길");
  await expect(card.locator(".sm-note-form")).toHaveCount(0);
  await expect(card.locator(".sm-note-list")).toHaveCount(0);
  await expect(card.locator("[data-cancel-order]")).toBeVisible();
});
