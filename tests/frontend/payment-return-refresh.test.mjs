import assert from "node:assert/strict";
import test from "node:test";
import { replacePaymentReturnUrl } from "../../src/frontend/core/router.mjs";

test("failed payment URL keeps only the safe order number for refresh retry", () => {
  let replaced = "";
  replacePaymentReturnUrl("/payment/fail", {
    documentRef: { baseURI: "https://shop.example/store/index.html" },
    historyRef: { replaceState: (_state, _title, value) => { replaced = value; } },
    locationRef: {
      pathname: "/payment/fail",
      search: "?paymentKey=pay_secret&code=PAY_PROCESS_CANCELED&message=cancel&orderId=RB-MOBILE-RETURN-001",
      hash: "",
    },
  });

  assert.equal(replaced, "/store/#/payment/fail?orderId=RB-MOBILE-RETURN-001");
  assert.equal(replaced.includes("paymentKey"), false);
  assert.equal(replaced.includes("code="), false);
  assert.equal(replaced.includes("message="), false);
});

test("failed payment URL does not retain malformed order identifiers", () => {
  let replaced = "";
  replacePaymentReturnUrl("/payment/fail", {
    documentRef: { baseURI: "https://shop.example/index.html" },
    historyRef: { replaceState: (_state, _title, value) => { replaced = value; } },
    locationRef: {
      pathname: "/payment/fail",
      search: "?orderId=%3Cscript%3E&paymentKey=pay_secret",
      hash: "",
    },
  });

  assert.equal(replaced, "/#/payment/fail");
});
