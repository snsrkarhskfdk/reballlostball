export function normalizeCatalogSlug(value, fallback = "") {
  const slug = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : fallback;
}

export function sanitizeAssetReference(value, fallback = "", baseOrigin = globalThis.location?.origin || "https://reballlostball.com") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback ? sanitizeAssetReference(fallback, "", baseOrigin) : "";
  if (/^(?:data|javascript|vbscript|file|blob):/i.test(raw) || /[\u0000-\u001f\u007f<>"'`\\]/.test(raw)) {
    return fallback ? sanitizeAssetReference(fallback, "", baseOrigin) : "";
  }
  try {
    if (raw.startsWith("//") || /^https?:\/\//i.test(raw)) {
      const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe external asset");
      url.hash = "";
      return url.href;
    }
    if (raw.startsWith("/")) {
      const url = new URL(raw, baseOrigin);
      if (url.origin !== new URL(baseOrigin).origin) throw new Error("cross-origin path");
      url.hash = "";
      return `${url.pathname}${url.search}`;
    }
    const segments = raw.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("unsafe relative asset");
    return segments.map((segment) => encodeURIComponent(segment)).join("/");
  } catch {
    return fallback ? sanitizeAssetReference(fallback, "", baseOrigin) : "";
  }
}
