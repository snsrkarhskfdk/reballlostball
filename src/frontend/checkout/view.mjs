import { escapeHtml } from "../ui/components.mjs";

export function renderCheckoutField(label, control) {
  return `
    <label class="checkout-field">
      <span class="checkout-field-label"><i></i>${escapeHtml(label)}</span>
      ${control}
    </label>
  `;
}

export function renderCheckoutMethod(id, label, icon, checked = false) {
  const safeId = escapeHtml(id);
  return `
    <label class="checkout-method">
      <input type="radio" name="payment" value="${safeId}" ${checked ? "checked" : ""} />
      <span class="checkout-method-icon" aria-hidden="true">${icon}</span>
      <span class="checkout-method-label">${escapeHtml(label)}</span>
    </label>
  `;
}

export function renderCheckoutPolicyCard(icon, title, body, caption) {
  return `
    <article class="checkout-policy-card">
      <span class="checkout-policy-icon" aria-hidden="true">${icon}</span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p>${body}</p>
        <small>${caption}</small>
      </div>
    </article>
  `;
}

export function checkoutCustomerFromForm(formData) {
  return {
    receiverName: String(formData.get("name") || "").trim(),
    receiverPhone: String(formData.get("phone") || "").trim(),
    zipCode: String(formData.get("zipCode") || "").trim(),
    roadAddress: String(formData.get("roadAddress") || "").trim(),
    detailAddress: String(formData.get("detailAddress") || "").trim(),
    memo: String(formData.get("memo") || "").trim(),
  };
}

export function isCheckoutCustomerValid(customer) {
  return Boolean(
    customer.receiverName
      && /^[0-9]{9,11}$/.test(customer.receiverPhone.replace(/\D/g, ""))
      && /^[0-9]{5}$/.test(customer.zipCode)
      && customer.roadAddress
  );
}
