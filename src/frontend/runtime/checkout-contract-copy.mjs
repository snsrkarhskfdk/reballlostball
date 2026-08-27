function patchCheckoutCopy(root = document) {
  root.querySelectorAll(".checkout-submit-copy b").forEach((node) => {
    if (node.textContent.trim() === "주문 접수하기") node.textContent = "주문 생성 후 결제하기";
  });
  root.querySelectorAll(".checkout-summary-note").forEach((node) => {
    node.textContent = "주문 금액과 재고를 서버에서 확인한 뒤 주문 화면의 ‘토스 결제하기’ 버튼으로 결제를 진행합니다.";
  });
}

let queued = false;
function queuePatch() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    patchCheckoutCopy();
  });
}

new MutationObserver(queuePatch).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("hashchange", queuePatch);
queuePatch();
