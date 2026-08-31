import { formatOrderDateTime, orderCompletionCopy } from "../account/order-summary.mjs";

function definitionNode(root, label) {
  const dt = [...root.querySelectorAll("dt")].find((node) => node.textContent.trim() === label);
  return dt?.nextElementSibling || null;
}

function definitionValue(root, label) {
  return definitionNode(root, label)?.textContent?.trim() || "";
}

function setText(node, value) {
  if (!node || !value || node.textContent.trim() === value) return;
  node.textContent = value;
}

function synchronizeOrderSummary(root) {
  if (!(root instanceof Element)) return;
  if (root.classList.contains("payment-return-page")) return;
  const orderStatus = definitionValue(root, "주문상태");
  const paymentStatus = definitionValue(root, "결제상태");
  if (!orderStatus && !paymentStatus) return;
  const copy = orderCompletionCopy(orderStatus, paymentStatus);

  const heading = root.querySelector("h1, h2");
  setText(heading, copy.title);

  const lead = [...root.querySelectorAll("p")].find((node) =>
    !node.closest(".order-lookup-token")
    && !node.hasAttribute("data-launch-hardening-status")
  );
  setText(lead, copy.body);

  const orderDate = definitionNode(root, "주문일");
  const rawDate = orderDate?.textContent?.trim() || "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(rawDate)) {
    setText(orderDate, formatOrderDateTime(rawDate));
  }
}

function ensurePaidCancelAction(root) {
  if (!(root instanceof Element)) return;
  if (root.classList.contains("payment-return-page")) return;
  const actions = root.querySelector(".action-row.center");
  if (!actions) return;

  const orderStatus = definitionValue(root, "주문상태");
  const paymentStatus = definitionValue(root, "결제상태");
  const existing = actions.querySelector("[data-payment-cancel-order]");
  const cancelable = orderStatus === "결제 완료" && paymentStatus === "결제 완료";

  if (!cancelable) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const orderId = definitionValue(root, "주문번호").toUpperCase();
  if (!/^[A-Z0-9_-]{6,64}$/.test(orderId)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-btn";
  button.dataset.paymentCancelOrder = orderId;
  button.textContent = "결제 취소";
  actions.insertAdjacentElement("afterbegin", button);
}

function patchOrderPages(root = document) {
  root.querySelectorAll(".complete-page:not(.payment-return-page)").forEach((page) => {
    synchronizeOrderSummary(page);
    ensurePaidCancelAction(page);
  });
}

let queued = false;
function queuePatch() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    patchOrderPages();
    queued = false;
  });
}

new MutationObserver(queuePatch).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
window.addEventListener("hashchange", queuePatch);
window.addEventListener("pageshow", queuePatch);
queuePatch();
