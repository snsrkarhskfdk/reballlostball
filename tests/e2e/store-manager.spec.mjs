import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { injectAdminConsoleAssets } from "../../scripts/admin-console-assets.mjs";

const htmlPath = new URL("../../store-manager.html", import.meta.url);

const fakeSupabaseModule = `
const role = new URL(location.href).searchParams.get("role") === "store" ? "store_manager" : "owner_admin";
const user = { id: role === "store_manager" ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111", email: role === "store_manager" ? "store@example.com" : "owner@example.com" };
const session = { user, access_token: "test-access-token" };
const productRows = [{
  id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug:"test-ball", name:"테스트 로스트볼", subtitle:"운영 테스트", summary:"테스트", base_price_krw:15000, detail_image_url:"", active:true, updated_at:new Date().toISOString(), brands:{name:"테스트",slug:"test"},
  product_variants:[{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",sku:"TEST-A-10",option_model:"MODEL",option_color:"화이트",option_design:"",grade:"A",pack_size:10,price_krw:15000,compare_at_krw:null,stock_qty:3,thumbnail_url:"",active:true}]
}];
function query(table){
  const q={
    select(){return q},
    eq(){return Promise.resolve({data:table==="user_roles"?[{role}]:[],error:null})},
    order(){return Promise.resolve({data:table==="products"?productRows:[],error:null})},
    single(){return Promise.resolve({data:null,error:null})}
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

const order = {id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",order_no:"RB-TEST",status:"paid",payment_status:"done",payment_method:"card",total_krw:26000,refund_amount:0,created_at:new Date().toISOString(),address_snapshot:{receiverName:"테스터",receiverPhone:"01012345678",roadAddress:"부천시 소사구 경인로10번길 34"},order_items:[{product_name:"테스트 로스트볼",variant_name:"A 10구",qty:1,line_total_krw:22500}],payment:{method:"card",status:"done",approved_amount:26000,canceled_amount:0},notes:[],canCancel:true};

async function installMocks(page, role = "owner") {
  const rawHtml = await readFile(htmlPath, "utf8");
  const html = injectAdminConsoleAssets(rawHtml
    .replace('meta name="reball-supabase-url" content=""', 'meta name="reball-supabase-url" content="https://fake.supabase.test"')
    .replace('meta name="reball-supabase-publishable-key" content=""', 'meta name="reball-supabase-publishable-key" content="test-publishable"'));

  await page.route("**/store-manager.html*", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm", (route) => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: fakeSupabaseModule }));
  await page.route("https://fake.supabase.test/functions/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const view = url.searchParams.get("view");
    let body = {};
    if (url.pathname.endsWith("/admin-console") && route.request().method() === "GET") {
      if (view === "dashboard") body = { metrics:{paidTodayCount:2,grossTodayKrw:52000,refundsTodayKrw:0,netTodayKrw:52000,pendingShipping:1,lowStock:1,outOfStock:0,paymentAlerts:0}, recentOrders:[{order_no:"RB-TEST",status:"paid",total_krw:26000}] };
      else if (view === "orders") body = { canPayments:role !== "store", orders:[{...order,canCancel:role !== "store"}] };
      else if (view === "audit") body = { audit:[], orderEvents:[], people:{} };
      else if (view === "settings") body = { store:{representative_name:"이영석",business_number:"867-01-03727",mail_order_number:"제 2025 - 부천소사 -0655 호",address_road:"부천시 소사구 경인로10번길 34",cs_phone:"010-8484-4646",email:"evil1229@naver.com"},commerce:{base_shipping_krw:3500,free_shipping_threshold_krw:50000,remote_area_surcharge_krw:2000,reservation_ttl_minutes:40,guest_lookup_ttl_days:365},policies:[] };
      else if (view === "staff") body = { staff:[{id:"11111111-1111-4111-8111-111111111111",name:"대표",email:"owner@example.com",login_id:"owner",roles:["owner_admin"]}] };
    } else if (url.pathname.endsWith("/admin-members")) {
      body = { members:[{id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",name:"회원",loginId:"member",email:"member@example.com",phone:"01011112222",marketingEmail:true,marketingSms:false,createdAt:new Date().toISOString(),orderCount:1,totalKrw:26000}] };
    } else if (url.pathname.endsWith("/admin-ops-extra") && route.request().method() === "GET") {
      if (view === "returns") body = { requests:[], cancelableOrders:[order], canCancel:role !== "store" };
      else if (view === "inquiries") body = { inquiries:[{id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",category:"general",subject:"배송 문의",body:"언제 오나요?",status:"open",created_at:new Date().toISOString()}] };
      else if (view === "reviews") body = { reviews:[] };
      else if (view === "promo") body = { benefits:[], banners:[], canManageBanners:true };
      else if (view === "pos") body = { devices:[] };
      else if (view === "settlement") body = { metrics:{grossKrw:52000,canceledKrw:0,netKrw:52000,completedRefundKrw:0},rows:[{order_id:order.id,status:"done",approved_amount:52000,canceled_amount:0,method:"card",approved_at:new Date().toISOString(),order:{order_no:"RB-TEST"}}],refunds:[] };
      else if (view === "brands") body = { brands:[{id:"ffffffff-ffff-4fff-8fff-ffffffffffff",name:"테스트",slug:"test",active:true}] };
    } else {
      body = { result:{}, order:{} };
    }
    await route.fulfill({ status: 200, contentType: "application/json", headers:{"access-control-allow-origin":"*"}, body: JSON.stringify(body) });
  });
  await page.goto(`/store-manager.html?role=${role}`);
  await expect(page.locator("[data-app-panel]")).toBeVisible();
}

test("owner admin sees and loads the complete operations console", async ({ page }) => {
  await installMocks(page, "owner");
  for (const tab of ["dashboard","orders","returns","products","shipping","members","inquiries","reviews","promo","pos","settlement","audit","settings","staff"]) {
    await expect(page.locator(`[data-tab="${tab}"]`)).toBeVisible();
  }
  await expect(page.locator("[data-summary]")).toContainText("오늘 승인");
  await page.locator('[data-tab="orders"]').click();
  await expect(page.locator("[data-all-order-list]")).toContainText("RB-TEST");
  await expect(page.locator("[data-cancel-order]")).toBeVisible();
  await page.locator('[data-tab="returns"]').click();
  await expect(page.locator("[data-extra-returns]")).toContainText("RB-TEST");
  await expect(page.locator("[data-extra-cancel]")).toBeVisible();
  await page.locator('[data-tab="inquiries"]').click();
  await expect(page.locator("[data-extra-inquiries]")).toContainText("배송 문의");
  await page.locator('[data-tab="settlement"]').click();
  await expect(page.locator("[data-extra-settlement-metrics]")).toContainText("₩52,000");
  await page.locator('[data-tab="settings"]').click();
  await expect(page.locator('[name="addressRoad"]')).toHaveValue("부천시 소사구 경인로10번길 34");
});

test("store manager gets daily operations without owner, review, promo or settlement controls", async ({ page }) => {
  await installMocks(page, "store");
  for (const tab of ["dashboard","orders","returns","products","shipping","inquiries","pos"]) await expect(page.locator(`[data-tab="${tab}"]`)).toBeVisible();
  for (const tab of ["members","reviews","promo","settlement","audit","settings","staff"]) await expect(page.locator(`[data-tab="${tab}"]`)).toBeHidden();
  await page.locator('[data-tab="returns"]').click();
  await expect(page.locator("[data-extra-returns]")).toContainText("RB-TEST");
  await expect(page.locator("[data-extra-cancel]")).toHaveCount(0);
});

test("complete operations console stays inside a 390px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page, "owner");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.locator('[data-tab="products"]').click();
  await expect(page.locator("[data-product-list]")).toContainText("테스트 로스트볼");
  await page.locator('[data-tab="settlement"]').click();
  await expect(page.locator("[data-extra-settlement-table]")).toContainText("RB-TEST");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
