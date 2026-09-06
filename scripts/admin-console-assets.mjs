const EXTRA_CSS = '<link rel="stylesheet" href="/src/frontend/admin/store-console-extra.css?v=20260907-03" data-admin-extra-assets />';
const EXTRA_SCRIPT = '<script type="module" src="/src/frontend/admin/store-console-extra.mjs?v=20260907-03" data-admin-extra-assets></script>';
const EXTRA_GUARD = '<script type="module" src="/src/frontend/admin/store-console-extra-guard.mjs?v=20260907-03" data-admin-extra-guard></script>';

export function injectAdminConsoleAssets(html) {
  const source = String(html || "");
  if (!source || source.includes("data-admin-extra-assets")) return source;
  return source
    .replace("</head>", `  ${EXTRA_CSS}\n  </head>`)
    .replace("</body>", `  ${EXTRA_SCRIPT}\n  ${EXTRA_GUARD}\n  </body>`);
}
