export function defaultAdminProfile(supportEmail = "") {
  return {
    id: "admin",
    role: "권한 확인 중",
    email: supportEmail,
  };
}

export function defaultAdminBanners() {
  return [
    { id: "BN-001", title: "홈 메인 배너", meta: "첫 번째 캐러셀", status: "노출중", order: 1, placement: "홈" },
    { id: "BN-002", title: "매장 이벤트 배너", meta: "두 번째 캐러셀", status: "노출중", order: 2, placement: "홈" },
    { id: "BN-003", title: "프리미엄 선별 배너", meta: "세 번째 캐러셀", status: "노출중", order: 3, placement: "홈" },
  ];
}

export function adminChartPercentages(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return [0, 0, 0];
  return values.map((value) => Math.round((value / total) * 100));
}

export function adminChartLabels(tab) {
  if (tab === "inquiry") return ["완료", "대기", "오늘"];
  const labels = {
    product: ["판매중", "부족", "신규"],
    returns: ["완료", "대기", "전체"],
    coupon: ["쿠폰", "사용", "배너"],
    pos: ["기기", "주문", "점검"],
    settlement: ["매출", "정산", "환불"],
    customer: ["회원", "신규", "문의"],
    review: ["리뷰", "대기", "포토"],
    settings: ["관리자", "권한", "알림"],
  };
  return labels[tab] ?? ["완료", "대기", "주의"];
}

export function adminTabLabel(tab) {
  return {
    dashboard: "관리자 대시보드",
    orders: "주문관리",
    product: "상품관리 / 재고관리",
    returns: "취소/반품/교환관리",
    inquiry: "문의답변",
    coupon: "쿠폰/배너관리",
    pos: "포스기 관리",
    settlement: "정산/통계",
    customer: "고객/회원관리",
    review: "리뷰관리",
    settings: "설정/권한",
  }[tab] ?? "관리자 대시보드";
}

export function adminTabEyebrow(tab) {
  return {
    dashboard: "REBALL LOSTBALL 운영 현황",
    orders: "주문/배송",
    product: "상품/재고",
    returns: "CS 처리",
    inquiry: "고객 문의",
    coupon: "프로모션",
    pos: "매장 운영",
    settlement: "정산/분석",
    customer: "고객 데이터",
    review: "콘텐츠 관리",
    settings: "환경 설정",
  }[tab] ?? "관리자";
}

export function adminTabDescription(tab) {
  return {
    dashboard: "오늘 주문, 결제, 재고, 문의 흐름을 한 화면에서 확인하세요.",
    orders: "주문번호, 고객명, 상품명 기준으로 주문과 배송 상태를 관리할 수 있습니다.",
    product: "상품 이미지 원본은 유지하고, 재고와 노출 순서만 관리합니다.",
    returns: "교환/반품 요청을 접수하고 승인 상태를 갱신합니다.",
    inquiry: "고객이 남긴 1:1 문의를 확인하고 답변을 등록합니다.",
    coupon: "쿠폰과 홈 배너 노출 상태를 관리합니다.",
    pos: "오프라인 포스기 상태와 현장 주문을 확인합니다.",
    settlement: "매출, 정산 예정금, 배송비, 환불 예정 금액을 확인합니다.",
    customer: "회원 구매 이력과 문의 대기 상태를 확인합니다.",
    review: "리뷰 승인, 노출, 평점 상태를 관리합니다.",
    settings: "관리자 권한, 알림, 사업자 정보를 관리합니다.",
  }[tab] ?? "관리자 화면입니다.";
}

export function adminFirstColumn(tab) {
  return tab === "product" ? "상품" : tab === "customer" ? "고객" : tab === "settings" ? "권한" : tab === "inquiry" ? "문의" : "목록";
}

export function adminDefaultModal(tab) {
  return {
    orders: "orderDetail",
    product: "productRegister",
    returns: "returnRequest",
    inquiry: "inquiryReply",
    coupon: "couponRegister",
    pos: "posDetail",
    settlement: "downloadExport",
    customer: "addCustomer",
    review: "addReview",
    settings: "permissionDetail",
  }[tab] ?? "quickAction";
}
