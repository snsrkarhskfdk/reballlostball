const EXTRA_CSS = '<link rel="stylesheet" href="/src/frontend/admin/store-console-extra.css?v=20260908-03" data-admin-extra-assets />';
const FINAL_CSS = '<link rel="stylesheet" href="/src/frontend/admin/store-console-final-audit.css?v=20260908-03" data-admin-final-assets />';
const PAGINATION_SCRIPT = '<script type="module" src="/src/frontend/admin/store-manager-pagination.mjs?v=20260909-01" data-admin-pagination-assets></script>';
const EXTRA_SCRIPT = '<script type="module" src="/src/frontend/admin/store-console-final-audit.mjs?v=20260908-03" data-admin-extra-assets></script>';
const BASE_SCRIPT = '<script type="module" src="/store-manager.mjs?v=20260906-01"></script>';

export function injectAdminConsoleAssets(html) {
  const source = String(html || "");
  if (!source) return source;
  let output = source;
  if (!output.includes("data-admin-extra-assets")) {
    output = output
      .replace("</head>", `  ${EXTRA_CSS}\n  ${FINAL_CSS}\n  </head>`)
      .replace("</body>", `  ${EXTRA_SCRIPT}\n  </body>`);
  }
  if (!output.includes("data-admin-pagination-assets")) {
    if (!output.includes(BASE_SCRIPT)) throw new Error("store-manager.html 운영 스크립트 마커를 찾을 수 없습니다.");
    output = output.replace(BASE_SCRIPT, `${PAGINATION_SCRIPT}\n    ${BASE_SCRIPT}`);
  }
  return output;
}
