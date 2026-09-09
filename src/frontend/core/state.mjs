function activeCouponsOnly(coupons) {
  if (!Array.isArray(coupons)) return [];
  return coupons.filter((coupon) => {
    if (!coupon || typeof coupon !== "object") return false;
    if (String(coupon.id || "") === "NO_ACTIVE_SIGNUP_PROMO") return false;
    return !new Set(["미운영", "종료", "만료", "inactive", "expired", "retired"])
      .has(String(coupon.status || "").trim().toLowerCase());
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

export { activeCouponsOnly };
