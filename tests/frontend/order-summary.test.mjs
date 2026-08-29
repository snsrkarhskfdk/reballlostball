import assert from "node:assert/strict";
import test from "node:test";
import { formatOrderDateTime, orderCompletionCopy } from "../../src/frontend/account/order-summary.mjs";

test("order completion copy follows the actual payment state", () => {
  assert.deepEqual(orderCompletionCopy("결제 완료", "결제 완료"), {
    title: "결제가 완료되었습니다.",
    body: "결제가 정상적으로 완료되었습니다. 배송 상태를 아래에서 확인할 수 있습니다.",
  });
  assert.deepEqual(orderCompletionCopy("주문 취소", "환불 완료"), {
    title: "결제가 취소되었습니다.",
    body: "결제 취소와 환불 처리가 완료되었습니다.",
  });
  assert.equal(orderCompletionCopy("결제 대기", "결제 대기").title, "주문이 접수되었습니다.");
  assert.equal(orderCompletionCopy("취소 요청", "결제 완료").title, "결제 취소를 처리하고 있습니다.");
});

test("order timestamps are shown in stable Korea-local human format", () => {
  assert.equal(formatOrderDateTime("2026-08-29T12:11:13.539217+00:00"), "2026. 8. 29. 21:11");
  assert.equal(formatOrderDateTime("not-a-date"), "not-a-date");
  assert.equal(formatOrderDateTime(""), "");
});
