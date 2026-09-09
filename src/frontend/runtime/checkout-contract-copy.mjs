const SUBMIT_COPY = "주문 생성 후 결제하기";
const SUMMARY_COPY = "주문 금액과 재고를 서버에서 확인한 뒤 주문 화면의 ‘토스 결제하기’ 버튼으로 결제를 진행합니다.";
const PAYMENT_CONTRACT_COPY = "카드·계좌이체·간편결제는 토스페이먼츠 결제창에서 안전하게 진행됩니다.";
const PAYMENT_POLICY_TITLE = "토스페이먼츠 결제 안내";

function ensurePaymentContractNotice(root = document) {
  const checkout = root.querySelector(".checkout-main-card");
  if (!checkout) return;

  // Prefer the existing payment policy card as the single customer-facing
  // authority. Older hardening code inserted a second notice with identical
  // copy, which created duplicate accessible text and brittle E2E selectors.
  const authorityBody = checkout.querySelector('[data-toss-payment-authority="true"] p');
  if (authorityBody?.textContent?.trim() === PAYMENT_CONTRACT_COPY) {
    checkout.querySelectorAll("[data-toss-payment-contract-note]").forEach((node) => node.remove());
    return;
  }
  if (checkout.querySelector("[data-toss-payment-contract-note]")) return;

  const note = document.createElement("p");
  note.dataset.tossPaymentContractNote = "true";
  note.className = "launch-max-delivery-note";
  note.textContent = PAYMENT_CONTRACT_COPY;
  const policy = checkout.querySelector(".checkout-policy-card");
  if (policy) policy.insertAdjacentElement("afterend", note);
  else checkout.appendChild(note);
}

function patchPaymentPolicyAuthority(root = document) {
  root.querySelectorAll(".checkout-policy-card").forEach((card) => {
    const title = card.querySelector("strong");
    const body = card.querySelector("p");
    const currentTitle = title?.textContent?.trim() || "";
    const currentBody = body?.textContent?.trim() || "";
    const isPaymentPolicy = currentTitle === PAYMENT_POLICY_TITLE
      || /입금\s*계좌|계좌이체/.test(currentTitle)
      || /예금주|입금\s*계좌/.test(currentBody);
    if (!isPaymentPolicy) return;

    if (title && title.textContent !== PAYMENT_POLICY_TITLE) title.textContent = PAYMENT_POLICY_TITLE;
    if (body && body.textContent !== PAYMENT_CONTRACT_COPY) body.textContent = PAYMENT_CONTRACT_COPY;
    card.dataset.tossPaymentAuthority = "true";
  });
}

function patchCheckoutCopy(root = document) {
  root.querySelectorAll(".checkout-submit-copy b").forEach((node) => {
    if (node.textContent.trim() === "주문 접수하기") node.textContent = SUBMIT_COPY;
  });
  root.querySelectorAll(".checkout-summary-note").forEach((node) => {
    if (node.textContent !== SUMMARY_COPY) node.textContent = SUMMARY_COPY;
  });
  patchPaymentPolicyAuthority(root);
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
