function currentLocation(locationLike) {
  return locationLike ?? globalThis.location ?? { hash: "", pathname: "", search: "" };
}

export function parseRoute(locationLike) {
  const { hash = "" } = currentLocation(locationLike);
  const raw = String(hash).replace(/^#/, "") || "/";
  const route = raw.split("?", 1)[0] || "/";
  return route.startsWith("/") ? route : `/${route}`;
}

export function paymentReturnKind(locationLike) {
  const location = currentLocation(locationLike);
  const route = parseRoute(location);
  const pathname = String(location.pathname || "").replace(/\/+$/, "");
  if (route === "/payment/success" || pathname.endsWith("/payment/success")) return "success";
  if (route === "/payment/fail" || pathname.endsWith("/payment/fail")) return "fail";
  return "";
}

export function paymentReturnParams(locationLike) {
  const location = currentLocation(locationLike);
  const params = new URLSearchParams(location.search || "");
  const hash = String(location.hash || "").replace(/^#/, "");
  const queryIndex = hash.indexOf("?");
  if (queryIndex >= 0) {
    for (const [key, value] of new URLSearchParams(hash.slice(queryIndex + 1))) {
      if (!params.has(key)) params.set(key, value);
    }
  }
  return params;
}

export function replacePaymentReturnUrl(route, { documentRef = globalThis.document, historyRef = globalThis.history } = {}) {
  const basePath = new URL(".", documentRef.baseURI).pathname;
  historyRef.replaceState(null, "", `${basePath}#${route}`);
}
