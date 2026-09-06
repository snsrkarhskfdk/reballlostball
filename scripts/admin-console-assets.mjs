const EXTRA_CSS = '<link rel="stylesheet" href="/src/frontend/admin/store-console-extra.css?v=20260907-02" data-admin-extra-assets />';
const EXTRA_SCRIPT = '<script type="module" src="/src/frontend/admin/store-console-extra.mjs?v=20260907-02" data-admin-extra-assets></script>';

export function injectAdminConsoleAssets(html) {
  const source = String(html || "");
  if (!source || source.includes("data-admin-extra-assets")) return source;
  return source
    .replace("</head>", `  ${EXTRA_CSS}\n  </head>`)
    .replace("</body>", `  ${EXTRA_SCRIPT}\n  </body>`);
}
