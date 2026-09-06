import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm";

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
const SUPABASE_URL = meta("reball-supabase-url").replace(/\/$/, "");
const SUPABASE_KEY = meta("reball-supabase-publishable-key");
const supabase = /^https:\/\//.test(SUPABASE_URL) && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "reballlostball.auth" } })
  : null;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
const won = (v) => `₩${new Intl.NumberFormat("ko-KR").format(Number(v) || 0)}`;
const dt = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? "-" : new Intl.DateTimeFormat("ko-KR", { dateStyle:"short", timeStyle:"short" }).format(d); };
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Seoul" }).format(new Date());
const monthKey = () => todayKey().slice(0,7);
const ADMIN_TAB_ROLES = {
  dashboard: ["store_manager","cs_manager","inventory_manager","payments_manager","owner_admin"],
  returns: ["store_manager","cs_manager","payments_manager","owner_admin"],
  inquiry: ["store_manager","cs_manager","owner_admin"],
  promo: ["payments_manager","owner_admin"],
  pos: ["store_manager","owner_admin"],
  settlement: ["payments_manager","owner_admin"],
  customer: ["cs_manager","owner_admin"],
  review: ["cs_manager","owner_admin"],
  settings: ["owner_admin"],
};
const state = { session:null, roles:[], orders:[], returns:[], inquiries:[], benefits:[], banners:[], pos:[], members:[], reviews:[], settings:null, audit:[] };

function toast(message) {
  const node = $("[data-toast]"); if (!node) return;
  node.textContent = message; node.classList.add("is-open"); clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("is-open"), 2600);
}
function allowed(tab) { return (ADMIN_TAB_ROLES[tab] || []).some((r) => state.roles.includes(r)); }
function has(role) { return state.roles.includes(role); }
function setBusy(busy) { $("[data-app-panel]")?.classList.toggle("sm-loading", Boolean(busy)); }
function address(order) { const a = order?.address_snapshot || {}; return { name:a.receiverName||a.receiver_name||a.name||"", phone:a.receiverPhone||a.receiver_phone||a.phone||"", road:a.roadAddress||a.road_address||a.address||"", detail:a.detailAddress||a.detail_address||"" }; }
function orderStatus(v) { return ({draft:"초안",payment_ready:"결제대기",payment_auth_started:"결제진행",waiting_for_deposit:"입금대기",paid:"결제완료",payment_failed:"결제실패",cancel_requested:"취소중",canceled:"취소",partially_canceled:"부분취소",refunded:"환불",shipping_ready:"배송준비",shipped:"출고",delivered:"배송완료"})[v] || v || "-"; }
async function rolesFor(userId) { const {data,error}=await supabase.from("user_roles").select("role").eq("user_id",userId); if(error) throw error; return (data||[]).map(x=>x.role); }
async function sessionNow() { const {data:{session}}=await supabase.auth.getSession(); return session; }
async function edge(path, options={}) {
  const session = state.session || await sessionNow();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    ...options,
    headers:{ "Content-Type":"application/json", apikey:SUPABASE_KEY, ...(session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{ }), ...(options.headers||{}) },
  });
  const payload = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload?.message || `요청 실패 (${response.status})`);
  return payload;
}
function showDialog(html, bind) {
  const dialog=$("[data-admin-dialog]"), body=$("[data-dialog-body]");
  body.innerHTML=html; bind?.(body, dialog); dialog.showModal();
}
function closeDialog(){ $("[data-admin-dialog]")?.close(); }

async function loadOrdersAll() {
  const {data,error}=await supabase.from("orders")
    .select("id,order_no,profile_id,status,payment_status,payment_method,total_krw,subtotal_krw,shipping_krw,refund_amount,address_snapshot,created_at,updated_at,shipping_carrier,tracking_number,order_items(product_name,variant_name,qty,unit_price_krw,line_total_krw)")
    .order("created_at",{ascending:false}).limit(500);
  if(error) throw error; state.orders=data||[]; return state.orders;
}
async function loadDashboard(){
  const [orders, variantsResult, reviewsResult] = await Promise.all([
    loadOrdersAll(),
    supabase.from("product_variants").select("id,sku,stock_qty,active,low_stock_threshold,products(name)").eq("active",true),
    allowed("review") ? supabase.from("reviews").select("id,visible").eq("visible",false) : Promise.resolve({data:[]}),
  ]);
  if(variantsResult.error) throw variantsResult.error;
  const variants=variantsResult.data||[], pendingReviews=reviewsResult.data||[];
  const today=todayKey(), month=monthKey();
  const paid=orders.filter(o=>["paid","shipping_ready","shipped","delivered"].includes(o.status));
  const todayOrders=orders.filter(o=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul"}).format(new Date(o.created_at))===today);
  const monthSales=paid.filter(o=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul"}).format(new Date(o.created_at)).startsWith(month)).reduce((s,o)=>s+Number(o.total_krw||0)-Number(o.refund_amount||0),0);
  const low=variants.filter(v=>Number(v.stock_qty)<=Number(v.low_stock_threshold ?? 5));
  const ship=orders.filter(o=>["paid","shipping_ready","shipped"].includes(o.status));
  const cancel=orders.filter(o=>["cancel_requested","canceled","partially_canceled","refunded"].includes(o.status));
  $("[data-dashboard-metrics]").innerHTML=[
    ["오늘 주문",`${todayOrders.length}건`],["오늘 결제",`${todayOrders.filter(o=>o.payment_status==="done").length}건`],["이번 달 순매출",won(monthSales)],
    ["배송 처리",`${ship.length}건`],["취소·환불",`${cancel.length}건`],["재고 부족",`${low.length} SKU`],["리뷰 대기",`${pendingReviews.length}건`],
  ].map(([a,b])=>`<div class="sm-metric"><span>${a}</span><b>${b}</b></div>`).join("");
  const alerts=[...low.slice(0,8).map(v=>`<div class="sm-alert"><b>${esc(v.products?.name||v.sku)}</b><span>${esc(v.sku)} · 재고 ${Number(v.stock_qty)}개</span></div>`),...ship.slice(0,5).map(o=>`<div class="sm-alert"><b>${esc(o.order_no)}</b><span>${orderStatus(o.status)} · ${won(o.total_krw)}</span></div>`)];
  $("[data-dashboard-alerts]").innerHTML=alerts.join("")||'<div class="sm-empty sm-empty--compact">처리할 경보가 없습니다.</div>';
  $("[data-dashboard-orders]").innerHTML=orders.slice(0,8).map(o=>`<div class="sm-row"><b>${esc(o.order_no)}</b><span>${orderStatus(o.status)} · ${won(o.total_krw)} · ${dt(o.created_at)}</span></div>`).join("");
}

async function loadReturns(){
  const [orders, requests] = await Promise.all([loadOrdersAll(), supabase.from("return_requests").select("*,orders(order_no,total_krw,status)").order("requested_at",{ascending:false}).limit(300)]);
  if(requests.error) throw requests.error; state.returns=requests.data||[]; renderReturns();
}
function renderReturns(){
  const filter=$("[data-return-filter]")?.value||"all";
  const requests=state.returns.filter(r=>filter==="all"||(filter==="requested"&&r.status==="requested")||(filter==="completed"&&r.status==="completed"));
  const cancelable=state.orders.filter(o=>o.status==="paid"&&o.payment_status==="done");
  let html="";
  if(filter==="all"||filter==="cancelable") html += cancelable.map(o=>`<article class="sm-mini-card"><div><b>${esc(o.order_no)}</b><span>${won(o.total_krw)} · 출고 전 결제완료</span></div>${has("owner_admin")||has("payments_manager")?`<button class="sm-button sm-button--danger" data-cancel-paid="${esc(o.order_no)}">전액 결제취소</button>`:""}<button class="sm-button" data-create-return="${esc(o.id)}">반품/교환 기록</button></article>`).join("");
  if(filter!=="cancelable") html += requests.map(r=>`<article class="sm-mini-card"><div><b>${esc(r.orders?.order_no||"주문")}</b><span>${esc(r.request_type)} · ${esc(r.reason)} · ${esc(r.status)}</span><small>${dt(r.requested_at)}</small></div><select class="sm-select sm-select--small" data-return-status="${esc(r.id)}"><option ${r.status==="requested"?"selected":""}>requested</option><option ${r.status==="approved"?"selected":""}>approved</option><option ${r.status==="rejected"?"selected":""}>rejected</option><option ${r.status==="completed"?"selected":""}>completed</option></select></article>`).join("");
  $("[data-return-list]").innerHTML=html||'<div class="sm-empty">취소/반품/교환 건이 없습니다.</div>';
}
async function cancelPaid(orderNo){
  const reason=prompt("취소 사유를 입력하세요. (2자 이상)","관리자 전액 취소"); if(!reason||reason.trim().length<2) return;
  if(!confirm(`${orderNo} 결제를 Toss에서 전액 취소합니다. 계속할까요?`)) return;
  await edge("payment-cancel",{method:"POST",headers:{"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({orderNo,reason:reason.trim()})});
  toast("결제 취소를 완료했습니다."); await loadReturns(); document.querySelector("[data-reload-orders]")?.click();
}
async function createReturn(orderId){
  const type=prompt("요청 유형: cancel / return / exchange", "return"); if(!new Set(["cancel","return","exchange"]).has(type)) return toast("요청 유형을 확인하세요.");
  const reason=prompt("사유를 입력하세요.",""); if(!reason?.trim()) return;
  const {error}=await supabase.from("return_requests").insert({order_id:orderId,request_type:type,reason:reason.trim(),requested_by:state.session.user.id}); if(error) throw error; toast("반품/교환 요청을 기록했습니다."); await loadReturns();
}

async function loadInquiries(){ const {data,error}=await supabase.from("customer_inquiries").select("*").order("created_at",{ascending:false}).limit(300); if(error) throw error; state.inquiries=data||[]; renderInquiries(); }
function renderInquiries(){ $("[data-inquiry-list]").innerHTML=state.inquiries.map(q=>`<article class="sm-mini-card sm-mini-card--stack"><div><b>${esc(q.subject)}</b><span>${esc(q.category)} · ${esc(q.status)} · ${dt(q.created_at)}</span><p>${esc(q.body)}</p>${q.admin_reply?`<p class="sm-reply">답변: ${esc(q.admin_reply)}</p>`:""}</div><div class="sm-panel-actions"><button class="sm-button" data-reply-inquiry="${esc(q.id)}">답변</button><button class="sm-button" data-close-inquiry="${esc(q.id)}">종료</button></div></article>`).join("")||'<div class="sm-empty">문의가 없습니다.</div>'; }
async function newInquiry(){
  showDialog(`<form data-dialog-form><h2>문의 기록</h2><label>고객명<input class="sm-input" name="guest_name"></label><label>연락처<input class="sm-input" name="guest_phone"></label><label>분류<input class="sm-input" name="category" value="general"></label><label>제목<input class="sm-input" name="subject" required></label><label>내용<textarea class="sm-input" name="body" required></textarea></label><button class="sm-button sm-button--primary">저장</button></form>`,(body)=>body.querySelector("form").onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await supabase.from("customer_inquiries").insert(Object.fromEntries([...f].map(([k,v])=>[k,String(v).trim()])));if(error)return toast(error.message);closeDialog();toast("문의를 기록했습니다.");loadInquiries();});
}
async function replyInquiry(id){ const text=prompt("답변 내용을 입력하세요.", state.inquiries.find(x=>x.id===id)?.admin_reply||""); if(!text?.trim())return; const {error}=await supabase.from("customer_inquiries").update({admin_reply:text.trim(),status:"replied",replied_by:state.session.user.id,replied_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id); if(error)throw error; toast("답변을 저장했습니다."); await loadInquiries(); }

async function loadPromo(){ const [benefits,banners]=await Promise.all([supabase.from("benefit_policies").select("*").order("name"),supabase.from("banners").select("*").order("sort_order")]); if(benefits.error)throw benefits.error;if(banners.error)throw banners.error;state.benefits=benefits.data||[];state.banners=banners.data||[];renderPromo(); }
function renderPromo(){
  $("[data-benefit-list]").innerHTML=state.benefits.map(x=>`<div class="sm-mini-card"><div><b>${esc(x.name)}</b><span>${esc(x.benefit_type)} · ${Number(x.benefit_value)} · ${x.is_active?"사용중":"중지"}</span></div><button class="sm-button" data-toggle-benefit="${esc(x.id)}">${x.is_active?"중지":"사용"}</button></div>`).join("")||'<div class="sm-empty sm-empty--compact">등록된 혜택 없음</div>';
  $("[data-banner-list]").innerHTML=state.banners.map(x=>`<div class="sm-mini-card"><div><b>${esc(x.title)}</b><span>${x.active?"노출중":"숨김"} · 순서 ${Number(x.sort_order)}</span></div><button class="sm-button" data-toggle-banner="${esc(x.id)}">${x.active?"숨김":"노출"}</button></div>`).join("")||'<div class="sm-empty sm-empty--compact">등록된 배너 없음</div>';
}
async function newBenefit(){ const name=prompt("혜택 이름","신규 쿠폰");if(!name)return;const type=prompt("유형: coupon / discount / point / grade_credit","coupon");if(!new Set(["coupon","discount","point","grade_credit"]).has(type))return;const value=Number(prompt("혜택 값(원/포인트)","3000"));if(!Number.isSafeInteger(value)||value<0)return;const {error}=await supabase.from("benefit_policies").insert({name,applies_to:"order",benefit_type:type,benefit_value:value,is_active:false});if(error)throw error;toast("혜택을 등록했습니다. 안전을 위해 비활성으로 생성됩니다.");loadPromo(); }
async function newBanner(){ const title=prompt("배너 제목","");if(!title)return;const image=prompt("이미지 URL(선택)","")||null;const href=prompt("이동 링크(선택)","")||null;const {error}=await supabase.from("banners").insert({title,image_url:image,href,active:false,sort_order:100});if(error)throw error;toast("배너를 비노출 상태로 등록했습니다.");loadPromo(); }

async function loadPos(){ const {data,error}=await supabase.from("pos_devices").select("*").order("created_at");if(error)throw error;state.pos=data||[]; $("[data-pos-list]").innerHTML=state.pos.map(p=>`<div class="sm-mini-card"><div><b>${esc(p.name)}</b><span>${esc(p.location||"위치 미지정")} · ${esc(p.status)}${p.last_seen_at?` · ${dt(p.last_seen_at)}`:""}</span></div><select class="sm-select sm-select--small" data-pos-status="${esc(p.id)}"><option ${p.status==="online"?"selected":""}>online</option><option ${p.status==="offline"?"selected":""}>offline</option><option ${p.status==="maintenance"?"selected":""}>maintenance</option></select></div>`).join("")||'<div class="sm-empty">등록된 POS 기기가 없습니다.</div>'; }
async function newPos(){ const name=prompt("POS 기기명","매장 POS 1");if(!name)return;const location=prompt("설치 위치","부천 매장")||"";const {error}=await supabase.from("pos_devices").insert({name,location,status:"offline"});if(error)throw error;toast("POS 기기를 등록했습니다.");loadPos(); }

async function loadSettlement(){
  const [orders,payments,refunds]=await Promise.all([loadOrdersAll(),supabase.from("payments").select("order_id,status,requested_amount,approved_amount,canceled_amount,approved_at,canceled_at"),supabase.from("payment_refunds").select("cancel_amount,refund_status,requested_at,completed_at")]);
  if(payments.error)throw payments.error;if(refunds.error)throw refunds.error;
  const paid=orders.filter(o=>["paid","shipping_ready","shipped","delivered"].includes(o.status));
  const gross=paid.reduce((s,o)=>s+Number(o.total_krw||0),0), shipping=paid.reduce((s,o)=>s+Number(o.shipping_krw||0),0), refund=(refunds.data||[]).reduce((s,r)=>s+Number(r.cancel_amount||0),0), net=gross-refund;
  $("[data-settlement-metrics]").innerHTML=[["총 결제매출",won(gross)],["배송비 포함액",won(shipping)],["취소·환불",won(refund)],["순매출",won(net)]].map(([a,b])=>`<div class="sm-metric"><span>${a}</span><b>${b}</b></div>`).join("");
  $("[data-settlement-list]").innerHTML=`<table class="sm-table"><thead><tr><th>주문</th><th>일시</th><th>상태</th><th>결제</th><th>배송비</th><th>환불</th></tr></thead><tbody>${orders.slice(0,100).map(o=>`<tr><td>${esc(o.order_no)}</td><td>${dt(o.created_at)}</td><td>${orderStatus(o.status)}</td><td>${won(o.total_krw)}</td><td>${won(o.shipping_krw)}</td><td>${won(o.refund_amount)}</td></tr>`).join("")}</tbody></table>`;
}
function exportSales(){ const rows=[["주문번호","주문일","상태","결제상태","총액","배송비","환불액"],...state.orders.map(o=>[o.order_no,o.created_at,o.status,o.payment_status,o.total_krw,o.shipping_krw,o.refund_amount])];const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`reball-sales-${todayKey()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }

async function loadMembers(){ const payload=await edge("admin-members",{method:"GET"});state.members=payload.members||[];state.canManageRoles=Boolean(payload.canManageRoles);renderMembers(); }
function renderMembers(){ const q=String($("[data-member-search]")?.value||"").toLowerCase();const rows=state.members.filter(m=>[m.email,m.authEmail,m.name,m.phone,m.loginId].join(" ").toLowerCase().includes(q));$("[data-member-list]").innerHTML=`<table class="sm-table"><thead><tr><th>회원</th><th>연락처</th><th>주문</th><th>누적구매</th><th>권한</th></tr></thead><tbody>${rows.map(m=>`<tr><td><b>${esc(m.name||m.loginId||"회원")}</b><br><small>${esc(m.email||m.authEmail)}</small></td><td>${esc(m.phone||"-")}</td><td>${m.orderCount}건</td><td>${won(m.totalKrw)}</td><td>${esc((m.roles||[]).join(", "))}${state.canManageRoles?`<br><button class="sm-button sm-button--small" data-member-roles="${esc(m.id)}">권한 변경</button>`:""}</td></tr>`).join("")}</tbody></table>`; }
async function editMemberRoles(id){ const member=state.members.find(m=>m.id===id);if(!member)return;const roles=prompt("권한을 쉼표로 입력하세요.\ncustomer, store_manager, cs_manager, inventory_manager, payments_manager, owner_admin",(member.roles||[]).join(","));if(roles==null)return;const list=[...new Set(roles.split(",").map(x=>x.trim()).filter(Boolean))];await edge("admin-members",{method:"POST",body:JSON.stringify({action:"set_roles",userId:id,roles:list})});toast("권한을 변경했습니다.");loadMembers(); }

async function loadReviews(){ const {data,error}=await supabase.from("reviews").select("id,rating,title,body,visible,is_sample,created_at,products(name)").order("created_at",{ascending:false}).limit(300);if(error)throw error;state.reviews=data||[];$("[data-review-list]").innerHTML=state.reviews.map(r=>`<article class="sm-mini-card sm-mini-card--stack"><div><b>${esc(r.products?.name||"상품")} · ${Number(r.rating)}점</b><span>${dt(r.created_at)} · ${r.visible?"노출중":"승인대기"}</span><p>${esc(r.title||"")} ${esc(r.body||"")}</p></div><button class="sm-button" data-review-visible="${esc(r.id)}">${r.visible?"숨김":"승인·노출"}</button></article>`).join("")||'<div class="sm-empty">등록된 리뷰가 없습니다.</div>'; }

async function loadSettings(){
  const [profile,commerce,audit]=await Promise.all([supabase.from("store_profile").select("*").limit(1).maybeSingle(),supabase.from("commerce_settings").select("*").eq("singleton",true).maybeSingle(),supabase.from("admin_audit_logs").select("id,actor_user_id,action,table_name,row_pk,created_at").order("created_at",{ascending:false}).limit(100)]);
  if(profile.error)throw profile.error;if(commerce.error)throw commerce.error;if(audit.error)throw audit.error;state.settings={profile:profile.data,commerce:commerce.data};state.audit=audit.data||[];
  const bf=$("[data-business-form]");Object.entries(profile.data||{}).forEach(([k,v])=>{const el=bf?.elements?.namedItem(k);if(el)el.value=v??"";});
  const cf=$("[data-commerce-form]");Object.entries(commerce.data||{}).forEach(([k,v])=>{const el=cf?.elements?.namedItem(k);if(el)el.value=v??"";});
  $("[data-audit-list]").innerHTML=`<table class="sm-table"><thead><tr><th>일시</th><th>작업</th><th>대상</th><th>행</th></tr></thead><tbody>${state.audit.map(a=>`<tr><td>${dt(a.created_at)}</td><td>${esc(a.action)}</td><td>${esc(a.table_name)}</td><td>${esc(a.row_pk||"")}</td></tr>`).join("")}</tbody></table>`;
}
async function saveBusiness(form){ const f=new FormData(form);const payload=Object.fromEntries([...f].map(([k,v])=>[k,String(v).trim()||null]));payload.updated_at=new Date().toISOString();const current=state.settings?.profile;const q=current?supabase.from("store_profile").update(payload).eq("id",current.id):supabase.from("store_profile").insert(payload);const {error}=await q;if(error)throw error;toast("사업자 정보를 저장했습니다.");loadSettings(); }
async function saveCommerce(form){ const f=new FormData(form);const payload={singleton:true,updated_at:new Date().toISOString()};for(const [k,v] of f)payload[k]=Number(v);const {error}=await supabase.from("commerce_settings").upsert(payload,{onConflict:"singleton"});if(error)throw error;toast("주문·배송 설정을 저장했습니다.");loadSettings(); }

async function createProduct(form){
  const f=new FormData(form), price=Number(f.get("price")), stock=Number(f.get("stock")), pack=Number(f.get("pack"));
  if(!Number.isSafeInteger(price)||price<1||!Number.isSafeInteger(stock)||stock<0||!Number.isSafeInteger(pack)||pack<1) throw new Error("가격·재고·구성을 확인하세요.");
  const productPayload={brand_id:String(f.get("brandId")),slug:String(f.get("slug")).trim().toLowerCase(),name:String(f.get("name")).trim(),subtitle:String(f.get("subtitle")||"").trim()||null,summary:null,sale_type:"lostball",base_price_krw:price,featured:false,active:true};
  const {data:product,error:pErr}=await supabase.from("products").insert(productPayload).select("id").single();if(pErr)throw pErr;
  const {error:vErr}=await supabase.from("product_variants").insert({product_id:product.id,sku:String(f.get("sku")).trim(),option_model:String(f.get("model")||"").trim()||null,option_color:String(f.get("color")||"").trim()||null,grade:String(f.get("grade")),pack_size:pack,price_krw:price,stock_qty:stock,active:true,low_stock_threshold:5});
  if(vErr){await supabase.from("products").update({active:false}).eq("id",product.id);throw vErr;}toast("새 상품을 등록했습니다.");form.reset();form.hidden=true;document.querySelector("[data-reload-products]")?.click();
}
async function loadBrands(){ const {data,error}=await supabase.from("brands").select("id,name,active").eq("active",true).order("sort_order");if(error)throw error;$("[data-brand-options]").innerHTML=(data||[]).map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join(""); }

const LOADERS={dashboard:loadDashboard,returns:loadReturns,inquiry:loadInquiries,promo:loadPromo,pos:loadPos,settlement:loadSettlement,customer:loadMembers,review:loadReviews,settings:loadSettings};
async function loadTab(tab){ if(!allowed(tab)||!LOADERS[tab])return;setBusy(true);try{await LOADERS[tab]();}catch(e){toast(e?.message||"관리자 데이터를 불러오지 못했습니다.");}finally{setBusy(false);} }
function applyAdminPermissions(){
  for(const [tab,roles] of Object.entries(ADMIN_TAB_ROLES)){const show=roles.some(r=>state.roles.includes(r));$$(`[data-admin-tab="${tab}"]`).forEach(n=>n.hidden=!show);}
  document.body.classList.toggle("sm-can-edit-product-content",has("owner_admin")||has("inventory_manager"));
  const create=$("[data-product-create-toggle]");if(create)create.hidden=!(has("owner_admin")||has("inventory_manager"));
  const roleLabel=$("[data-role-label]");if(roleLabel){roleLabel.hidden=false;roleLabel.textContent=state.roles.filter(r=>r!=="customer").join(" · ")||"customer";}
  const first=allowed("dashboard")?$("[data-tab=dashboard]"):null; if(first&&!first.hidden) first.click();
}

function bind(){
  $$('[data-admin-tab]').forEach(btn=>btn.addEventListener("click",()=>loadTab(btn.dataset.adminTab)));
  $$('[data-admin-reload]').forEach(btn=>btn.addEventListener("click",()=>loadTab(btn.dataset.adminReload)));
  $("[data-return-filter]")?.addEventListener("change",renderReturns);
  $("[data-return-list]")?.addEventListener("click",async e=>{try{const c=e.target.closest("[data-cancel-paid]");if(c)return await cancelPaid(c.dataset.cancelPaid);const r=e.target.closest("[data-create-return]");if(r)return await createReturn(r.dataset.createReturn);}catch(err){toast(err.message);}});
  $("[data-return-list]")?.addEventListener("change",async e=>{const s=e.target.closest("[data-return-status]");if(!s)return;const {error}=await supabase.from("return_requests").update({status:s.value,handled_by:state.session.user.id,handled_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",s.dataset.returnStatus);if(error)toast(error.message);else toast("처리 상태를 변경했습니다.");});
  $("[data-new-inquiry]")?.addEventListener("click",newInquiry);
  $("[data-inquiry-list]")?.addEventListener("click",async e=>{try{const r=e.target.closest("[data-reply-inquiry]");if(r)return await replyInquiry(r.dataset.replyInquiry);const c=e.target.closest("[data-close-inquiry]");if(c){const {error}=await supabase.from("customer_inquiries").update({status:"closed",updated_at:new Date().toISOString()}).eq("id",c.dataset.closeInquiry);if(error)throw error;toast("문의를 종료했습니다.");loadInquiries();}}catch(err){toast(err.message);}});
  $("[data-new-benefit]")?.addEventListener("click",()=>newBenefit().catch(e=>toast(e.message)));$("[data-new-banner]")?.addEventListener("click",()=>newBanner().catch(e=>toast(e.message)));
  $("[data-benefit-list]")?.addEventListener("click",async e=>{const b=e.target.closest("[data-toggle-benefit]");if(!b)return;const x=state.benefits.find(v=>v.id===b.dataset.toggleBenefit);const {error}=await supabase.from("benefit_policies").update({is_active:!x.is_active}).eq("id",x.id);if(error)toast(error.message);else loadPromo();});
  $("[data-banner-list]")?.addEventListener("click",async e=>{const b=e.target.closest("[data-toggle-banner]");if(!b)return;const x=state.banners.find(v=>v.id===b.dataset.toggleBanner);const {error}=await supabase.from("banners").update({active:!x.active}).eq("id",x.id);if(error)toast(error.message);else loadPromo();});
  $("[data-new-pos]")?.addEventListener("click",()=>newPos().catch(e=>toast(e.message)));$("[data-pos-list]")?.addEventListener("change",async e=>{const s=e.target.closest("[data-pos-status]");if(!s)return;const {error}=await supabase.from("pos_devices").update({status:s.value,last_seen_at:s.value==="online"?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",s.dataset.posStatus);if(error)toast(error.message);else toast("POS 상태를 저장했습니다.");});
  $("[data-export-sales]")?.addEventListener("click",exportSales);$("[data-member-search]")?.addEventListener("input",renderMembers);$("[data-member-list]")?.addEventListener("click",e=>{const b=e.target.closest("[data-member-roles]");if(b)editMemberRoles(b.dataset.memberRoles).catch(err=>toast(err.message));});
  $("[data-review-list]")?.addEventListener("click",async e=>{const b=e.target.closest("[data-review-visible]");if(!b)return;const r=state.reviews.find(x=>x.id===b.dataset.reviewVisible);const {error}=await supabase.from("reviews").update({visible:!r.visible}).eq("id",r.id);if(error)toast(error.message);else{toast("리뷰 노출 상태를 변경했습니다.");loadReviews();}});
  $("[data-business-form]")?.addEventListener("submit",e=>{e.preventDefault();saveBusiness(e.currentTarget).catch(err=>toast(err.message));});$("[data-commerce-form]")?.addEventListener("submit",e=>{e.preventDefault();saveCommerce(e.currentTarget).catch(err=>toast(err.message));});
  $("[data-product-create-toggle]")?.addEventListener("click",async()=>{const f=$("[data-product-create-form]");f.hidden=!f.hidden;if(!f.hidden)await loadBrands();});$("[data-product-create-cancel]")?.addEventListener("click",()=>$("[data-product-create-form]").hidden=true);$("[data-product-create-form]")?.addEventListener("submit",e=>{e.preventDefault();createProduct(e.currentTarget).catch(err=>toast(err.message));});
}
async function authorize(session){state.session=session;if(!session?.user?.id)return;try{state.roles=await rolesFor(session.user.id);applyAdminPermissions();}catch(e){toast(e.message);}}
async function boot(){if(!supabase)return;bind();await authorize(await sessionNow());supabase.auth.onAuthStateChange((_e,s)=>{if(s?.user?.id!==state.session?.user?.id)authorize(s);});}
boot();
