const SUBMIT_COPY = "주문 생성 후 결제하기";
const SUMMARY_COPY = "주문 금액과 재고를 서버에서 확인한 뒤 주문 화면의 ‘토스 결제하기’ 버튼으로 결제를 진행합니다.";
const PAYMENT_CONTRACT_COPY = "카드·계좌이체·간편결제는 토스페이먼츠 결제창에서 안전하게 진행됩니다.";

function ensurePaymentContractNotice(root = document) {
  const checkout = root.querySelector(".checkout-main-card");
  if (!checkout || checkout.querySelector("[data-toss-payment-contract-note]")) return;
  const note = document.createElement("p");
  note.dataset.tossPaymentContractNote = "true";
  note.className = "launch-max-delivery-note";
  note.textContent = PAYMENT_CONTRACT_COPY;
  const policy = checkout.querySelector(".checkout-policy-card");
  if (policy) policy.insertAdjacentElement("afterend", note);
  else checkout.appendChild(note);
}

function patchCheckoutCopy(root = document) {
  root.querySelectorAll(".checkout-submit-copy b").forEach((node) => {
    if (node.textContent.trim() === "주문 접수하기") node.textContent = SUBMIT_COPY;
  });
  root.querySelectorAll(".checkout-summary-note").forEach((node) => {
    if (node.textContent !== SUMMARY_COPY) node.textContent = SUMMARY_COPY;
  });
  ensurePaymentContractNotice(root);
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
