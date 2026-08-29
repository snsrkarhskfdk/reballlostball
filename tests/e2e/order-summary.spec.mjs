import { expect, test } from "@playwright/test";

test("order completion surface follows paid/canceled state and formats the order date", async ({ page }) => {
  await page.goto("/#/");

  await page.evaluate(() => {
    document.querySelector("#app").innerHTML = `
      <main class="complete-page">
        <div aria-hidden="true">✓</div>
        <h1>주문 접수가 완료되었습니다.</h1>
        <p>테스트 주문은 결제 완료 상태입니다.</p>
        <dl>
          <div><dt>주문번호</dt><dd>RB-ORDER-SUMMARY-001</dd></div>
          <div><dt>주문일</dt><dd>2026-08-29T12:11:13.539217+00:00</dd></div>
          <div><dt>주문상태</dt><dd>결제 완료</dd></div>
          <div><dt>결제상태</dt><dd>결제 완료</dd></div>
        </dl>
        <div class="action-row center"></div>
      </main>
    `;
  });

  const root = page.locator(".complete-page");
  await expect(root.locator("h1")).toHaveText("결제가 완료되었습니다.");
  await expect(root.locator("p").first()).toHaveText("결제가 정상적으로 완료되었습니다. 배송 상태를 아래에서 확인할 수 있습니다.");
  await expect(root.getByText("2026. 8. 29. 21:11", { exact: true })).toBeVisible();
  await expect(root.locator('[data-payment-cancel-order="RB-ORDER-SUMMARY-001"]')).toHaveCount(1);

  await page.evaluate(() => {
    const value = (label) => [...document.querySelectorAll(".complete-page dt")]
      .find((node) => node.textContent.trim() === label)?.nextElementSibling;
    value("주문상태").textContent = "주문 취소";
    value("결제상태").textContent = "환불 완료";
  });

  await expect(root.locator("h1")).toHaveText("결제가 취소되었습니다.");
  await expect(root.locator("p").first()).toHaveText("결제 취소와 환불 처리가 완료되었습니다.");
  await expect(root.locator("[data-payment-cancel-order]")).toHaveCount(0);
});
