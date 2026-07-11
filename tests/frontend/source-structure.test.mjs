import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const devServer = readFileSync(new URL("../../scripts/dev-server.mjs", import.meta.url), "utf8");
const build = readFileSync(new URL("../../scripts/build.mjs", import.meta.url), "utf8");

test("release blocker fallback과 브라우저 주문 원본이 제거됐다", () => {
  assert.doesNotMatch(app, /stock:\s*99/);
  assert.doesNotMatch(app, /available:\s*true/);
  assert.doesNotMatch(app, /function\s+isOptionSelectable\s*\(\s*\)/);
  assert.doesNotMatch(app, /slice\(-4\)/);
  assert.doesNotMatch(app, /ephemeralOrders|adminCredentials|adminUser/);
  assert.match(app, /createOrderRequest/);
  assert.match(app, /lookupGuestOrderRequest/);
});

test("홈은 다섯 단계, 푸터 사업자 정보와 하나의 대표 h1 생성 경계를 사용한다", () => {
  for (const stage of ["1", "2", "3", "4", "5"]) {
    assert.match(app, new RegExp(`data-home-stage=\\"${stage}\\"`));
  }
  assert.doesNotMatch(app, /data-home-stage=\\"6\\"/);
  assert.match(app, /<footer class="site-footer">[\s\S]+footer-store-business/);
  assert.doesNotMatch(app, /home-stage--store/);
  assert.doesNotMatch(app, /<h1>많이 찾는 인기 브랜드/);
  assert.doesNotMatch(app, /<h1>\$\{escapeHtml\(banner\.title\)/);
  assert.match(app, /<h1 class="hole-title">/);
  assert.doesNotMatch(app, /<span>WISH<\/span>|<span>ADD<\/span>/);
});

test("버튼 시스템과 접근성 entry marker가 존재한다", () => {
  assert.match(css, /--button-height-sm:\s*44px/);
  assert.match(css, /--button-height-lg:\s*52px/);
  assert.match(css, /--button-radius:\s*10px/);
  assert.match(css, /\.is-loading/);
  assert.match(index, /class="skip-link"\s+href="#main-content"/);
  assert.match(app, /id="main-content"/);
  assert.match(app, /bindDialogAccessibility/);
});

test("서버 API가 없는 mutation UI는 disabled fail-closed 된다", () => {
  assert.match(app, /function markUnavailableServerActions\(/);
  assert.match(app, /data-admin-modal-primary[\s\S]+node\.disabled = true/);
  assert.match(app, /rejectUnimplementedServerMutation\(/);
});

test("개발·빌드가 index.html과 frontend ESM을 같은 기준으로 사용한다", () => {
  assert.match(index, /src="\.\/app\.js/);
  assert.doesNotMatch(devServer, /index-current\.html/);
  assert.match(devServer, /pathname === "\/" \? "index\.html"/);
  assert.match(build, /cp\("src\/frontend"/);
});
