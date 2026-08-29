export function formatOrderDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}. ${Number(part("month"))}. ${Number(part("day"))}. ${part("hour")}:${part("minute")}`;
}

export function orderCompletionCopy(orderStatus, paymentStatus) {
  const order = String(orderStatus || "").trim();
  const payment = String(paymentStatus || "").trim();

  if (order === "환불 완료") {
    return {
      title: "환불이 완료되었습니다.",
      body: "결제 환불 처리가 완료되었습니다.",
    };
  }

  if (order === "주문 취소" || payment === "환불 완료" || payment === "결제 취소") {
    return {
      title: "결제가 취소되었습니다.",
      body: "결제 취소와 환불 처리가 완료되었습니다.",
    };
  }

  if (order === "부분 취소" || payment === "부분 취소" || payment === "부분 환불") {
    return {
      title: "결제가 부분 취소되었습니다.",
      body: "취소된 금액과 남은 주문 상태를 아래에서 확인해 주세요.",
    };
  }

  if (order === "취소 요청") {
    return {
      title: "결제 취소를 처리하고 있습니다.",
      body: "결제사 확인이 끝나면 주문과 환불 상태가 자동으로 갱신됩니다.",
    };
  }

  if (payment === "결제 완료" || ["상품 준비중", "배송중", "배송완료"].includes(order)) {
    return {
      title: "결제가 완료되었습니다.",
      body: "결제가 정상적으로 완료되었습니다. 배송 상태를 아래에서 확인할 수 있습니다.",
    };
  }

  if (payment === "결제 실패" || payment === "결제 만료" || order === "결제 실패") {
    return {
      title: "결제를 완료하지 못했습니다.",
      body: "결제 상태를 확인한 뒤 다시 결제를 진행해 주세요.",
    };
  }

  if (payment === "결제 진행 중" || order === "결제 진행 중") {
    return {
      title: "결제를 확인하고 있습니다.",
      body: "결제사 확인이 끝나면 상태가 자동으로 갱신됩니다.",
    };
  }

  if (payment === "입금 대기" || order === "입금 대기") {
    return {
      title: "입금을 기다리고 있습니다.",
      body: "입금이 확인되면 결제 상태가 자동으로 갱신됩니다.",
    };
  }

  return {
    title: "주문이 접수되었습니다.",
    body: "현재 결제 대기 상태입니다. 아래 버튼에서 결제를 진행해 주세요.",
  };
}
