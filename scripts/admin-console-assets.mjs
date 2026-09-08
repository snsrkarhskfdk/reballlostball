const EXTRA_CSS = '<link rel="stylesheet" href="/src/frontend/admin/store-console-extra.css?v=20260908-02" data-admin-extra-assets />';
const FINAL_CSS = '<link rel="stylesheet" href="/src/frontend/admin/store-console-final-audit.css?v=20260908-02" data-admin-final-assets />';
const EXTRA_SCRIPT = '<script type="module" src="/src/frontend/admin/store-console-final-audit.mjs?v=20260908-02" data-admin-extra-assets></script>';

export function injectAdminConsoleAssets(html) {
  const source = String(html || "");
  if (!source || source.includes("data-admin-extra-assets")) return source;
  return source
    .replace("</head>", `  ${EXTRA_CSS}\n  ${FINAL_CSS}\n  </head>`)
    .replace("</body>", `  ${EXTRA_SCRIPT}\n  </body>`);
}
