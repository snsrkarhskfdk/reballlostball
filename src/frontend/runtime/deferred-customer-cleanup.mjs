// Wishlist is still a browser-local prototype with no authenticated server
// persistence. Production must not present it as a durable account feature.
try { localStorage.removeItem("reball.wishlist"); } catch {}

function removeWishlistPrototype(root = document) {
  root.querySelectorAll?.('[data-my-tab="wishlist"], [data-wish-card]').forEach((node) => node.remove());
  root.querySelectorAll?.(".mypage-summary article").forEach((article) => {
    if (article.querySelector("span")?.textContent?.trim() === "찜") article.remove();
  });
}

let queued = false;
function queueCleanup() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    removeWishlistPrototype(document);
  });
}

new MutationObserver(queueCleanup).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("hashchange", queueCleanup);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", queueCleanup, { once: true });
else queueCleanup();
