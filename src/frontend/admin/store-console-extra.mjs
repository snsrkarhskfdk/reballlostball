import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm";

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
const SUPABASE_URL = meta("reball-supabase-url").replace(/\/$/, "");
const SUPABASE_KEY = meta("reball-supabase-publishable-key");
const MEDIA_BUCKET = "reball-product-media";
const supabase = /^https:\/\//.test(SUPABASE_URL) && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "reballlostball.auth" } })
  : null;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
const won = (v) => `₩${new Intl.NumberFormat("ko-KR").format(Number(v) || 0)}`;
const dt = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? "-" : new Intl.DateTimeFormat("ko-KR", {dateStyle:"short",timeStyle:"short"}).format(d); };
const roles = { current: [] };
const ALLOW = {
  returns: new Set(["owner_admin","store_manager","cs_manager","payments_manager"]),
  inquiries: new Set(["owner_admin","store_manager","cs_manager"]),
  reviews: new Set(["owner_admin","cs_manager"]),
  promo: new Set(["owner_admin","payments_manager"]),
  pos: new Set(["owner_admin","store_manager"]),
  settlement: new Set(["owner_admin","payments_manager"]),
};
const can = (tab) => roles.current.some((r) => ALLOW[tab]?.has(r));
const has = (role) => roles.current.includes(role);
const extraState = { returns:null, inquiries:null, reviews:null, promo:null, pos:null, settlement:null, brands:null, coverProductId:null };

function toast(message) {
  const node = $("[data-toast]"); if (!node) return;
  node.textContent = message; node.classList.add("is-open"); clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("is-open"), 3200);
}
async function session() { const {data:{session}} = await supabase.auth.getSession(); if(!session?.access_token) throw new Error("로그인이 만료되었습니다."); return session; }
async function edge(path, options={}) {
  const s = await session();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    ...options,
    headers: { apikey:SUPABASE_KEY, Authorization:`Bearer ${s.access_token}`, ...(options.body?{"Content-Type":"application/json"}:{}), ...(options.headers||{}) },
  });
  const payload = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload?.message || `요청 실패 (${response.status})`);
  return payload;
}
const getExtra = (view) => edge(`admin-ops-extra?view=${encodeURIComponent(view)}`);
const mutate = (action,payload={}) => edge("admin-ops-extra",{method:"POST",body:JSON.stringify({action,payload})});

function injectUi() {
  const nav = $(".sm-tabs"); const app = $("[data-app-panel]"); if(!nav || !app || $("[data-tab='returns']")) return;
  const anchor = $("[data-tab='members']", nav);
  const tabs = [
    ["returns","취소 · 반품"],["inquiries","문의"],["reviews","리뷰"],["promo","쿠폰 · 배너"],["pos","POS"],["settlement","매출 · 정산"],
  ].map(([key,label])=>`<button type="button" data-extra-tab="${key}" data-tab="${key}" hidden>${label}</button>`).join("");
  anchor?.insertAdjacentHTML("beforebegin", tabs);
  app.insertAdjacentHTML("beforeend", `
    <section class="sm-panel sm-extra-panel" data-panel="returns" hidden>
      <div class="sm-panel-head"><div><p class="sm-eyebrow">RETURNS</p><h2>취소 · 반품 · 교환</h2></div><button class="sm-button" data-extra-reload="returns">새로고침</button></div>
      <p class="sm-help">출고 전 결제취소는 payments_manager 또는 owner_admin만 실행합니다. 출고 이후는 반품·교환 요청으로 별도 기록해 이력을 보존합니다.</p>
      <div data-extra-returns></div>
    </section>
    <section class="sm-panel sm-extra-panel" data-panel="inquiries" hidden>
      <div class="sm-panel-head"><div><p class="sm-eyebrow">CUSTOMER INQUIRY</p><h2>고객 문의</h2></div><div class="sm-panel-actions"><button class="sm-button sm-button--primary" data-new-inquiry>문의 기록</button><button class="sm-button" data-extra-reload="inquiries">새로고침</button></div></div>
      <div class="sm-card-list" data-extra-inquiries></div>
    </section>
    <section class="sm-panel sm-extra-panel" data-panel="reviews" hidden>
      <div class="sm-panel-head"><div><p class="sm-eyebrow">REVIEWS</p><h2>리뷰 승인 · 노출</h2></div><button class="sm-button" data-extra-reload="reviews">새로고침</button></div>
      <div class="sm-card-list" data-extra-reviews></div>
    </section>
    <section class="sm-panel sm-extra-panel" data-panel="promo" hidden>
      <div class="sm-panel-head"><div><p class="sm-eyebrow">PROMOTION</p><h2>쿠폰 · 할인 · 배너</h2></div><button class="sm-button" data-extra-reload="promo">새로고침</button></div>
      <div class="sm-extra-split"><section class="sm-subpanel"><div class="sm-panel-head"><h3>혜택 정책</h3><button class="sm-button sm-button--small" data-new-benefit>추가</button></div><div class="sm-card-list" data-extra-benefits></div></section><section class="sm-subpanel" data-banner-section><div class="sm-panel-head"><h3>홈 배너</h3><button class="sm-button sm-button--small" data-new-banner>추가</button></div><div class="sm-card-list" data-extra-banners></div></section></div>
    </section>
    <section class="sm-panel sm-extra-panel" data-panel="pos" hidden>
      <div class="sm-panel-head"><div><p class="sm-eyebrow">POS</p><h2>매장 POS 기기</h2></div><div class="sm-panel-actions"><button class="sm-button sm-button--primary" data-new-pos>기기 등록</button><button class="sm-button" data-extra-reload="pos">새로고침</button></div></div>
      <p class="sm-help">기기 상태만 관리합니다. 카드 비밀키·정산 비밀번호는 저장하지 않습니다.</p><div class="sm-card-list" data-extra-pos></div>
    </section>
    <section class="sm-panel sm-extra-panel" data-panel="settlement" hidden>
      <div class="sm-panel-head"><div><p class="sm-eyebrow">SALES</p><h2>매출 · 환불 집계</h2></div><div class="sm-panel-actions"><button class="sm-button" data-sales-csv>CSV 내보내기</button><button class="sm-button" data-extra-reload="settlement">새로고침</button></div></div>
      <p class="sm-help">쇼핑몰의 결제 승인·취소·환불 원장 집계입니다. PG 실제 입금 정산서와는 별도입니다.</p><div class="sm-summary" data-extra-settlement-metrics></div><div class="sm-table-wrap" data-extra-settlement-table></div>
    </section>
    <dialog class="sm-extra-dialog" data-extra-dialog><div data-extra-dialog-body></div><button class="sm-button sm-extra-dialog-close" type="button" data-extra-dialog-close>닫기</button></dialog>
    <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-extra-cover-picker hidden />
  `);
  enhanceProductPanel(); bindExtraEvents();
}

function enhanceProductPanel() {
  const actions = $("[data-panel='products'] .sm-panel-actions"); if(!actions || $("[data-product-create-extra]")) return;
  actions.insertAdjacentHTML("afterbegin", `<button class="sm-button" type="button" data-product-create-extra hidden>새 상품 + 첫 SKU</button>`);
  $("[data-product-list]")?.insertAdjacentHTML("beforebegin", `<form class="sm-extra-create" data-product-create-form-extra hidden>
    <h3>새 상품 + 첫 SKU 등록</h3><div class="sm-extra-form-grid">
      <label class="sm-field">브랜드<select class="sm-select" name="brandId" required></select></label><label class="sm-field">상품명<input class="sm-input" name="name" required maxlength="120"></label><label class="sm-field">슬러그<input class="sm-input" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*"></label><label class="sm-field">한줄 설명<input class="sm-input" name="subtitle" maxlength="200"></label>
      <label class="sm-field">SKU<input class="sm-input" name="sku" required maxlength="100"></label><label class="sm-field">모델<input class="sm-input" name="model" maxlength="100"></label><label class="sm-field">색상<input class="sm-input" name="color" value="화이트" maxlength="60"></label><label class="sm-field">등급<select class="sm-select" name="grade"><option>S</option><option>A_PLUS</option><option>A</option><option>B</option></select></label>
      <label class="sm-field">구성(구)<input class="sm-input" name="packSize" type="number" min="1" value="10" required></label><label class="sm-field">가격<input class="sm-input" name="priceKrw" type="number" min="1" step="100" required></label><label class="sm-field">재고<input class="sm-input" name="stockQty" type="number" min="0" value="0" required></label><label class="sm-field">저재고 기준<input class="sm-input" name="lowStockThreshold" type="number" min="0" value="5" required></label>
    </div><div class="sm-panel-actions"><button class="sm-button sm-button--primary">등록</button><button class="sm-button" type="button" data-product-create-close>취소</button></div></form>`);
}

async function readRoles() {
  if(!supabase) return;
  const {data:{session:s}}=await supabase.auth.getSession();
  if(!s?.user?.id){roles.current=[];applyPermissions();return;}
  const {data,error}=await supabase.from("user_roles").select("role").eq("user_id",s.user.id);
  roles.current=error?[]:(data||[]).map(x=>x.role);
  applyPermissions();
}
function applyPermissions() {
  $$('[data-extra-tab]').forEach((b)=>{b.hidden=!can(b.dataset.extraTab);});
  $("[data-product-create-extra]")?.toggleAttribute("hidden", !(has("owner_admin")||has("inventory_manager")));
  $("[data-banner-section]")?.toggleAttribute("hidden", !has("owner_admin"));
}
function activateExtra(tab) {
  if(!can(tab)) return;
  $$('[data-tab]').forEach((b)=>b.classList.toggle("is-active",b.dataset.tab===tab));
  $$('[data-panel]').forEach((p)=>{p.hidden=p.dataset.panel!==tab;});
  loadExtra(tab).catch((e)=>toast(e.message));
}
async function loadExtra(tab) {
  if(tab==="returns") { const [base, orderView] = await Promise.all([getExtra("returns"), edge("admin-console?view=orders")]); const allowed = new Set(["paid","partially_canceled","shipping_ready","shipped","delivered"]); extraState.returns={...base, orders:(orderView.orders||[]).filter(o=>allowed.has(String(o.status))).map(o=>({...o,canCancel:Boolean(orderView.canPayments && o.canCancel)}))}; renderReturns(); }
  if(tab==="inquiries") { extraState.inquiries=await getExtra("inquiries"); renderInquiries(); }
  if(tab==="reviews") { extraState.reviews=await getExtra("reviews"); renderReviews(); }
  if(tab==="promo") { extraState.promo=await getExtra("promo"); renderPromo(); }
  if(tab==="pos") { extraState.pos=await getExtra("pos"); renderPos(); }
  if(tab==="settlement") { extraState.settlement=await getExtra("settlement"); renderSettlement(); }
}

function orderBrief(o) { const a=o.address_snapshot||{}; return `${esc(a.receiverName||a.receiver_name||a.name||"수취인 미입력")} · ${won(o.total_krw)} · ${esc(o.status||"")}`; }
function renderReturns() {
  const node=$("[data-extra-returns]"); const data=extraState.returns||{}; const orders=data.orders||[]; const requests=data.requests||[];
  const orderHtml=orders.map(o=>`<article class="sm-extra-card"><div><b>${esc(o.order_no)}</b><span>${orderBrief(o)}</span></div><div class="sm-panel-actions">${o.canCancel?`<button class="sm-button sm-button--danger sm-button--small" data-extra-cancel="${esc(o.order_no)}">전액 결제취소</button>`:""}<button class="sm-button sm-button--small" data-extra-return-create="${esc(o.id)}">반품/교환 기록</button></div></article>`).join("");
  const reqHtml=requests.map(r=>`<article class="sm-extra-card"><div><b>${esc(r.orders?.order_no||"주문")}</b><span>${esc(r.request_type)} · ${esc(r.reason)} · ${esc(r.status)} · ${dt(r.requested_at)}</span></div><select class="sm-select sm-extra-small-select" data-extra-return-status="${esc(r.id)}"><option value="requested" ${r.status==="requested"?"selected":""}>접수</option><option value="approved" ${r.status==="approved"?"selected":""}>승인</option><option value="rejected" ${r.status==="rejected"?"selected":""}>거절</option><option value="completed" ${r.status==="completed"?"selected":""}>완료</option></select></article>`).join("");
  node.innerHTML=`<h3>처리 가능한 주문</h3>${orderHtml||'<div class="sm-empty">현재 처리 가능한 주문이 없습니다.</div>'}<h3 class="sm-extra-section-title">반품·교환 이력</h3>${reqHtml||'<div class="sm-empty">기록된 요청이 없습니다.</div>'}`;
}
async function cancelPaid(orderNo) {
  const reason=prompt("결제 취소 사유를 입력하세요.","관리자 전액 취소"); if(!reason?.trim()||reason.trim().length<2)return;
  if(!confirm(`${orderNo}의 남은 승인금액을 Toss에서 전액 취소합니다. 계속할까요?`))return;
  await edge("payment-cancel",{method:"POST",headers:{"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({orderNo,reason:reason.trim()})});
  toast("결제 취소를 완료했습니다."); await loadExtra("returns"); $("[data-reload-all-orders]")?.click();
}
async function createReturn(orderId) {
  const type=prompt("유형을 입력하세요: return / exchange / cancel","return"); if(!["return","exchange","cancel"].includes(type))return toast("유형을 확인하세요.");
  const reason=prompt("사유를 입력하세요.",""); if(!reason?.trim())return;
  await mutate("return_create",{orderId,requestType:type,reason:reason.trim()}); toast("요청 이력을 기록했습니다."); await loadExtra("returns");
}
async function updateReturnStatus(id,status){ await mutate("return_status",{id,status}); toast("처리 상태를 저장했습니다."); await loadExtra("returns"); }

function renderInquiries(){const rows=extraState.inquiries?.inquiries||[];$("[data-extra-inquiries]").innerHTML=rows.map(q=>`<article class="sm-extra-card sm-extra-card--stack"><div><b>${esc(q.subject)}</b><span>${esc(q.category)} · ${esc(q.status)} · ${dt(q.created_at)}</span><p>${esc(q.body)}</p>${q.admin_reply?`<p class="sm-extra-reply">답변: ${esc(q.admin_reply)}</p>`:""}</div><div class="sm-panel-actions"><button class="sm-button sm-button--small" data-inquiry-reply="${esc(q.id)}">답변</button><button class="sm-button sm-button--small" data-inquiry-close="${esc(q.id)}">종료</button></div></article>`).join("")||'<div class="sm-empty">문의가 없습니다.</div>';}
function dialog(html){const d=$("[data-extra-dialog]"),b=$("[data-extra-dialog-body]");b.innerHTML=html;d.showModal();return b;}
async function newInquiry(){const b=dialog(`<form data-extra-form><h2>문의 기록</h2><label class="sm-field">고객명<input class="sm-input" name="guestName"></label><label class="sm-field">연락처<input class="sm-input" name="guestPhone"></label><label class="sm-field">이메일<input class="sm-input" name="guestEmail" type="email"></label><label class="sm-field">분류<input class="sm-input" name="category" value="general"></label><label class="sm-field">제목<input class="sm-input" name="subject" required></label><label class="sm-field">내용<textarea class="sm-textarea" name="body" required></textarea></label><button class="sm-button sm-button--primary">저장</button></form>`);b.querySelector("form").onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);await mutate("inquiry_create",Object.fromEntries(f));$("[data-extra-dialog]").close();toast("문의 기록을 저장했습니다.");await loadExtra("inquiries");};}
async function replyInquiry(id){const reply=prompt("답변 내용을 입력하세요.","");if(!reply?.trim())return;await mutate("inquiry_reply",{id,reply:reply.trim()});toast("답변을 저장했습니다.");await loadExtra("inquiries");}
async function closeInquiry(id){if(!confirm("이 문의를 종료할까요?"))return;await mutate("inquiry_close",{id});toast("문의를 종료했습니다.");await loadExtra("inquiries");}

function renderReviews(){const rows=extraState.reviews?.reviews||[];$("[data-extra-reviews]").innerHTML=rows.map(r=>`<article class="sm-extra-card"><div><b>${esc(r.products?.name||"상품")} · ${"★".repeat(Number(r.rating)||0)}</b><span>${esc(r.title||"")} · ${dt(r.created_at)}</span><p>${esc(r.body||"")}</p></div><button class="sm-button sm-button--small" data-review-visible="${esc(r.id)}" data-next-visible="${r.visible?"false":"true"}">${r.visible?"숨기기":"노출 승인"}</button></article>`).join("")||'<div class="sm-empty">리뷰가 없습니다.</div>';}
async function toggleReview(id,visible){await mutate("review_visibility",{id,visible});toast(visible?"리뷰를 노출했습니다.":"리뷰를 숨겼습니다.");await loadExtra("reviews");}

function renderPromo(){const p=extraState.promo||{};$("[data-extra-benefits]").innerHTML=(p.benefits||[]).map(x=>`<article class="sm-extra-card"><div><b>${esc(x.name)}</b><span>${esc(x.benefit_type)} · ${Number(x.benefit_value)} · ${x.is_active?"사용중":"중지"}</span></div><button class="sm-button sm-button--small" data-benefit-toggle="${esc(x.id)}">${x.is_active?"중지":"사용"}</button></article>`).join("")||'<div class="sm-empty">혜택 정책이 없습니다.</div>';$("[data-extra-banners]").innerHTML=(p.banners||[]).map(x=>`<article class="sm-extra-card"><div><b>${esc(x.title)}</b><span>${x.active?"노출중":"숨김"} · 순서 ${Number(x.sort_order)||0}</span></div><button class="sm-button sm-button--small" data-banner-toggle="${esc(x.id)}">${x.active?"숨기기":"노출"}</button></article>`).join("")||'<div class="sm-empty">배너가 없습니다.</div>';}
async function newBenefit(){const name=prompt("혜택명","");if(!name?.trim())return;const type=prompt("유형: discount / point / coupon / grade_credit","discount");if(!["discount","point","coupon","grade_credit"].includes(type))return toast("유형을 확인하세요.");const value=Number(prompt("혜택 값(원/포인트)","1000"));if(!Number.isSafeInteger(value)||value<0)return toast("값을 확인하세요.");await mutate("benefit_create",{name:name.trim(),benefitType:type,benefitValue:value,appliesTo:"order"});toast("혜택 정책을 만들었습니다. 기본은 중지 상태입니다.");await loadExtra("promo");}
async function newBanner(){const title=prompt("배너 제목","");if(!title?.trim())return;const href=prompt("이동 경로 (/... 또는 https://)","")||"";const imageUrl=prompt("이미지 경로 (/... 또는 https://)","")||"";await mutate("banner_create",{title:title.trim(),href,imageUrl,sortOrder:100});toast("배너를 만들었습니다. 기본은 숨김입니다.");await loadExtra("promo");}

function renderPos(){const rows=extraState.pos?.devices||[];$("[data-extra-pos]").innerHTML=rows.map(x=>`<article class="sm-extra-card"><div><b>${esc(x.name)}</b><span>${esc(x.location||"")} · 마지막 연결 ${dt(x.last_seen_at)}</span></div><select class="sm-select sm-extra-small-select" data-pos-status="${esc(x.id)}"><option value="online" ${x.status==="online"?"selected":""}>온라인</option><option value="offline" ${x.status==="offline"?"selected":""}>오프라인</option><option value="maintenance" ${x.status==="maintenance"?"selected":""}>점검</option></select></article>`).join("")||'<div class="sm-empty">등록된 POS 기기가 없습니다.</div>';}
async function newPos(){const name=prompt("기기명","");if(!name?.trim())return;const location=prompt("설치 위치","")||"";await mutate("pos_create",{name:name.trim(),location});toast("POS 기기를 등록했습니다.");await loadExtra("pos");}

function renderSettlement(){const s=extraState.settlement||{},m=s.metrics||{};$("[data-extra-settlement-metrics]").innerHTML=[["누적 승인",won(m.grossKrw)],["누적 취소",won(m.canceledKrw)],["순 승인",won(m.netKrw)],["환불 완료",won(m.completedRefundKrw)]].map(([a,b])=>`<div class="sm-summary-card"><span>${a}</span><b>${b}</b></div>`).join("");const rows=s.rows||[];$("[data-extra-settlement-table]").innerHTML=`<table class="sm-table"><thead><tr><th>주문</th><th>결제상태</th><th>승인</th><th>취소</th><th>결제수단</th><th>승인일</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.order?.order_no||r.order_id)}</td><td>${esc(r.status)}</td><td>${won(r.approved_amount)}</td><td>${won(r.canceled_amount)}</td><td>${esc(r.method||"-")}</td><td>${dt(r.approved_at||r.created_at)}</td></tr>`).join("")}</tbody></table>`;}
function csvCell(value){const raw=String(value??"");const safe=/^[=+\-@]/.test(raw)?`'${raw}`:raw;return `"${safe.replace(/"/g,'""')}"`;}
function exportSales(){const rows=extraState.settlement?.rows||[];const lines=[["주문번호","결제상태","승인금액","취소금액","결제수단","승인일"],...rows.map(r=>[r.order?.order_no||r.order_id,r.status,r.approved_amount||0,r.canceled_amount||0,r.method||"",r.approved_at||r.created_at||""])].map(row=>row.map(csvCell).join(","));const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`reball-sales-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

async function loadBrands(){extraState.brands=await getExtra("brands");const select=$("[data-product-create-form-extra] [name='brandId']");if(select)select.innerHTML=(extraState.brands.brands||[]).map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("");}
async function createProduct(event){event.preventDefault();const f=new FormData(event.currentTarget);const integer=(n)=>Number(f.get(n));const payload={brandId:String(f.get("brandId")||""),name:String(f.get("name")||"").trim(),slug:String(f.get("slug")||"").trim().toLowerCase(),subtitle:String(f.get("subtitle")||"").trim(),sku:String(f.get("sku")||"").trim(),model:String(f.get("model")||"").trim(),color:String(f.get("color")||"").trim(),grade:String(f.get("grade")||"A_PLUS"),packSize:integer("packSize"),priceKrw:integer("priceKrw"),stockQty:integer("stockQty"),lowStockThreshold:integer("lowStockThreshold")};await mutate("product_create",payload);event.currentTarget.reset();event.currentTarget.hidden=true;toast("상품과 첫 SKU를 한 트랜잭션으로 등록했습니다.");$("[data-reload-products]")?.click();$("[data-reload-dashboard]")?.click();}

async function imageWebp(file){if(!file||!/^image\/(jpeg|png|webp|avif)$/i.test(file.type||""))throw new Error("JPG, PNG, WebP, AVIF 사진만 선택해 주세요.");if(file.size>8*1024*1024)throw new Error("사진은 8MB 이하로 선택해 주세요.");const url=URL.createObjectURL(file);const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url;});const max=1600,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext("2d",{alpha:false});ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);const blob=await new Promise(res=>canvas.toBlob(res,"image/webp",.86));if(!blob)throw new Error("사진을 변환하지 못했습니다.");return blob;}
async function uploadCover(file){const productId=extraState.coverProductId;extraState.coverProductId=null;if(!productId||!file)return;const [{data:product,error:pe},{data:variants,error:ve}]=await Promise.all([supabase.from("products").select("id,slug").eq("id",productId).single(),supabase.from("product_variants").select("id,active,thumbnail_url,created_at").eq("product_id",productId).order("created_at")]);if(pe)throw pe;if(ve)throw ve;const target=(variants||[]).find(v=>v.active)||(variants||[])[0];if(!target)throw new Error("대표사진을 연결할 SKU가 없습니다.");const blob=await imageWebp(file);const slug=String(product.slug||"product").replace(/[^a-z0-9-]+/g,"-");const path=`${slug}/${Date.now()}-${crypto.randomUUID()}.webp`;const {error}=await supabase.storage.from(MEDIA_BUCKET).upload(path,blob,{contentType:"image/webp",upsert:false,cacheControl:"31536000"});if(error)throw error;const publicUrl=supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;await edge("admin-console",{method:"POST",body:JSON.stringify({action:"catalogUpdate",productId,productPatch:{},variants:[{id:target.id,thumbnailUrl:publicUrl}]})});toast("대표사진을 대표 SKU 하나에만 반영했습니다. 다른 SKU 사진은 보존했습니다.");$("[data-reload-products]")?.click();}

function bindExtraEvents(){
  $(".sm-tabs")?.addEventListener("click",e=>{const b=e.target.closest("[data-extra-tab]");if(!b)return;e.preventDefault();activateExtra(b.dataset.extraTab);},true);
  $$('[data-extra-reload]').forEach(b=>b.addEventListener("click",()=>loadExtra(b.dataset.extraReload).catch(e=>toast(e.message))));
  $("[data-extra-dialog-close]")?.addEventListener("click",()=>$("[data-extra-dialog]").close());
  $("[data-extra-returns]")?.addEventListener("click",e=>{const c=e.target.closest("[data-extra-cancel]");if(c)return cancelPaid(c.dataset.extraCancel).catch(x=>toast(x.message));const r=e.target.closest("[data-extra-return-create]");if(r)return createReturn(r.dataset.extraReturnCreate).catch(x=>toast(x.message));});
  $("[data-extra-returns]")?.addEventListener("change",e=>{const s=e.target.closest("[data-extra-return-status]");if(s)updateReturnStatus(s.dataset.extraReturnStatus,s.value).catch(x=>toast(x.message));});
  $("[data-new-inquiry]")?.addEventListener("click",()=>newInquiry().catch(e=>toast(e.message)));$("[data-extra-inquiries]")?.addEventListener("click",e=>{const r=e.target.closest("[data-inquiry-reply]");if(r)return replyInquiry(r.dataset.inquiryReply).catch(x=>toast(x.message));const c=e.target.closest("[data-inquiry-close]");if(c)return closeInquiry(c.dataset.inquiryClose).catch(x=>toast(x.message));});
  $("[data-extra-reviews]")?.addEventListener("click",e=>{const b=e.target.closest("[data-review-visible]");if(b)toggleReview(b.dataset.reviewVisible,b.dataset.nextVisible==="true").catch(x=>toast(x.message));});
  $("[data-new-benefit]")?.addEventListener("click",()=>newBenefit().catch(e=>toast(e.message)));$("[data-new-banner]")?.addEventListener("click",()=>newBanner().catch(e=>toast(e.message)));$("[data-extra-benefits]")?.addEventListener("click",e=>{const b=e.target.closest("[data-benefit-toggle]");if(b)mutate("benefit_toggle",{id:b.dataset.benefitToggle}).then(()=>loadExtra("promo")).catch(x=>toast(x.message));});$("[data-extra-banners]")?.addEventListener("click",e=>{const b=e.target.closest("[data-banner-toggle]");if(b)mutate("banner_toggle",{id:b.dataset.bannerToggle}).then(()=>loadExtra("promo")).catch(x=>toast(x.message));});
  $("[data-new-pos]")?.addEventListener("click",()=>newPos().catch(e=>toast(e.message)));$("[data-extra-pos]")?.addEventListener("change",e=>{const s=e.target.closest("[data-pos-status]");if(s)mutate("pos_status",{id:s.dataset.posStatus,status:s.value}).then(()=>loadExtra("pos")).catch(x=>toast(x.message));});
  $("[data-sales-csv]")?.addEventListener("click",exportSales);
  $("[data-product-create-extra]")?.addEventListener("click",async()=>{const f=$("[data-product-create-form-extra]");f.hidden=!f.hidden;if(!f.hidden)try{await loadBrands();}catch(e){toast(e.message);}});$("[data-product-create-close]")?.addEventListener("click",()=>{$("[data-product-create-form-extra]").hidden=true;});$("[data-product-create-form-extra]")?.addEventListener("submit",e=>createProduct(e).catch(x=>toast(x.message)));
  $("[data-product-list]")?.addEventListener("click",e=>{const cover=e.target.closest('[data-upload="cover"]');if(!cover)return;e.preventDefault();e.stopPropagation();extraState.coverProductId=cover.dataset.productId;$("[data-extra-cover-picker]").click();},true);$("[data-extra-cover-picker]")?.addEventListener("change",e=>uploadCover(e.target.files?.[0]).catch(x=>toast(x.message)).finally(()=>{e.target.value="";}));
}

injectUi();
readRoles();
supabase?.auth.onAuthStateChange(()=>setTimeout(readRoles,0));
