import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm";

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
const url = meta("reball-supabase-url").replace(/\/$/, "");
const key = meta("reball-supabase-publishable-key");
const client = /^https:\/\//.test(url) && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "reballlostball.auth" },
}) : null;
const allow = {
  returns: new Set(["owner_admin","store_manager","cs_manager","payments_manager"]),
  inquiries: new Set(["owner_admin","store_manager","cs_manager"]),
  reviews: new Set(["owner_admin","cs_manager"]),
  promo: new Set(["owner_admin","payments_manager"]),
  pos: new Set(["owner_admin","store_manager"]),
  settlement: new Set(["owner_admin","payments_manager"]),
};
let roles = [];
function apply() {
  for (const node of document.querySelectorAll("[data-extra-tab]")) {
    node.hidden = !roles.some((role) => allow[node.dataset.extraTab]?.has(role));
  }
  const create = document.querySelector("[data-product-create-extra]");
  if (create) create.hidden = !roles.some((role) => role === "owner_admin" || role === "inventory_manager");
  const banners = document.querySelector("[data-banner-section]");
  if (banners) banners.hidden = !roles.includes("owner_admin");
}
async function refresh() {
  if (!client) return;
  const { data: { session } } = await client.auth.getSession();
  if (!session?.user?.id) { roles = []; apply(); return; }
  const { data, error } = await client.from("user_roles").select("role").eq("user_id", session.user.id);
  roles = error ? [] : (data || []).map((row) => row.role).filter(Boolean);
  apply();
}
const strip = document.querySelector("[data-role-strip]");
if (strip) new MutationObserver(() => apply()).observe(strip, { childList: true, subtree: true });
refresh();
setTimeout(refresh, 300);
setTimeout(refresh, 1200);
client?.auth.onAuthStateChange(() => setTimeout(refresh, 0));
