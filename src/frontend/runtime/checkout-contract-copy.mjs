const SUBMIT_COPY = "주문 생성 후 결제하기";
const SUMMARY_COPY = "주문 금액과 재고를 서버에서 확인한 뒤 주문 화면의 ‘토스 결제하기’ 버튼으로 결제를 진행합니다.";

function patchCheckoutCopy(root = document) {
  root.querySelectorAll(".checkout-submit-copy b").forEach((node) => {
    if (node.textContent.trim() === "주문 접수하기") node.textContent = SUBMIT_COPY;
  });
  root.querySelectorAll(".checkout-summary-note").forEach((node) => {
    if (node.textContent !== SUMMARY_COPY) node.textContent = SUMMARY_COPY;
  });
}

let queued = false;
function queuePatch() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    patchCheckoutCopy();
    queued = false;
  });
}

new MutationObserver(queuePatch).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("hashchange", queuePatch);
queuePatch();
