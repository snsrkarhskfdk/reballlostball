function koreaDateKey(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date).replaceAll("-", "");
  } catch {
    return "";
  }
}

function couponPeriodExpired(coupon, now = new Date()) {
  const period = String(coupon?.period || "");
  const dates = period.match(/\b\d{4}[.-]\d{2}[.-]\d{2}\b/g) || [];
  if (!dates.length) return false;
  const end = dates.at(-1).replace(/[.-]/g, "");
  const today = koreaDateKey(now);
  return /^\d{8}$/.test(end) && /^\d{8}$/.test(today) && end < today;
}

function activeCouponsOnly(coupons, now = new Date()) {
  if (!Array.isArray(coupons)) return [];
  const inactiveStatuses = new Set(["미운영", "종료", "만료", "inactive", "expired", "retired"]);
  return coupons.filter((coupon) => {
    if (!coupon || typeof coupon !== "object") return false;
    const id = String(coupon.id || "").trim().toUpperCase();
    if (id === "NO_ACTIVE_SIGNUP_PROMO" || id === "WELCOME3000") return false;
    if (inactiveStatuses.has(String(coupon.status || "").trim().toLowerCase())) return false;
    return !couponPeriodExpired(coupon, now);
  });
}

export function createAppState({
  route = "/",
  products = [],
  wishlist = [],
  notifications = {},
  coupons = [],
  posts = [],
  adminProfile = {},
  adminBanners = [],
  authRedirect = "/mypage",
} = {}) {
  return {
    route,
    products,
    cart: [],
    wishlist,
    orders: [],
    viewer: null,
    authSession: null,
    authUser: null,
    authReady: false,
    authBusy: false,
    authRedirect,
    accountLoading: false,
    authRoles: [],
    authRolesLoaded: false,
    addresses: [],
    paymentMethods: [],
    notifications,
    coupons: activeCouponsOnly(coupons),
    posts,
    activeBanner: 0,
    pendingScrollTarget: null,
    postSearch: "",
    expandedInquiryId: null,
    selected: {},
    myTab: "orders",
    selectedReviewOrderId: "",
    signupLoginCheck: { loginId: "", status: "idle", message: "" },
    adminTab: "dashboard",
    adminProfile,
    adminBanners,
    adminCustomers: [],
    adminMembers: [],
    adminMembersLoading: false,
    adminMembersLoaded: false,
    adminMembersError: "",
    adminProducts: [],
    remoteProducts: [],
    adminModal: null,
    adminModalContext: null,
    adminSearch: "",
    adminLoginError: "",
    menuOpen: false,
    cartPromptOpen: false,
    consultOpen: false,
    consultMessages: [],
    heroIntroHasPlayed: false,
    checkoutBusy: false,
    checkoutIdempotencyKey: "",
    paymentRequestState: "idle",
    adminGateBusy: false,
  };
}

export { activeCouponsOnly, couponPeriodExpired, koreaDateKey };
