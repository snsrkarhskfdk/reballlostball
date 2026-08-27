function definitionValue(root, label) {
  const dt = [...root.querySelectorAll("dt")].find((node) => node.textContent.trim() === label);
  return dt?.nextElementSibling?.textContent?.trim() || "";
}

function ensurePaidCancelAction(root) {
  if (!(root instanceof Element)) return;
  const actions = root.querySelector(".action-row.center");
  if (!actions || actions.querySelector("[data-payment-cancel-order]")) return;

  const orderStatus = definitionValue(root, "주문상태");
  const paymentStatus = definitionValue(root, "결제상태");
  if (orderStatus !== "결제 완료" || paymentStatus !== "결제 완료") return;

  const orderId = definitionValue(root, "주문번호").toUpperCase();
  if (!/^[A-Z0-9_-]{6,64}$/.test(orderId)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-btn";
  button.dataset.paymentCancelOrder = orderId;
  button.textContent = "결제 취소";
  actions.insertAdjacentElement("afterbegin", button);
}

function patchPaidOrders(root = document) {
  root.querySelectorAll(".complete-page").forEach(ensurePaidCancelAction);
}

let queued = false;
function queuePatch() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    patchPaidOrders();
    queued = false;
  });
}

new MutationObserver(queuePatch).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
window.addEventListener("hashchange", queuePatch);
window.addEventListener("pageshow", queuePatch);
queuePatch();
