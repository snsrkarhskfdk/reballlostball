import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260820091000_catalog_final_prices.sql", import.meta.url),
  "utf8",
);

function section(pattern, label) {
  const match = sql.match(pattern);
  assert.ok(match?.[1], `${label} section not found`);
  return match[1];
}

function parseProducts() {
  const body = section(
    /with desired_products\([^)]*\) as \(\s*values([\s\S]*?)\n\)\s*insert into public\.products/i,
    "desired_products",
  );
  const rows = [];
  const tuple = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']*)',\s*'([^']*)',\s*(\d+)\)/g;
  for (const match of body.matchAll(tuple)) {
    rows.push({
      brand: match[1],
      slug: match[2],
      name: match[3],
      subtitle: match[4],
      summary: match[5],
      basePrice: Number(match[6]),
    });
  }
  return rows;
}

function parseVariants() {
  const body = section(
    /with desired\(slug, model, grade, pack_size, price_krw, color, thumbnail_url\) as \(\s*values([\s\S]*?)\n\), normalized as/i,
    "desired variants",
  );
  const rows = [];
  const tuple = /\('([^']+)',\s*'([^']+)',\s*'([^']+)'::public\.ball_grade,\s*(\d+),\s*(\d+),\s*'([^']+)',\s*'([^']+)'\)/g;
  for (const match of body.matchAll(tuple)) {
    rows.push({
      slug: match[1],
      model: match[2],
      grade: match[3],
      packSize: Number(match[4]),
      price: Number(match[5]),
      color: match[6],
      thumbnail: match[7],
    });
  }
  return rows;
}

function skuFor(row) {
  const payload = [row.slug, row.model, row.grade, row.packSize, row.color].join("|");
  return `RB-260820-${createHash("md5").update(payload).digest("hex").slice(0, 16).toUpperCase()}`;
}

function keyFor(row) {
  return [row.slug, row.model, row.grade, row.packSize, row.color].join("|");
}

function findVariant(rows, slug, model, grade, packSize) {
  return rows.find(
    (row) =>
      row.slug === slug &&
      row.model === model &&
      row.grade === grade &&
      row.packSize === packSize,
  );
}

test("final catalog contains the intended nine products and 54 concrete variants", () => {
  const products = parseProducts();
  const variants = parseVariants();
  assert.equal(products.length, 9);
  assert.equal(variants.length, 54);
  assert.equal(new Set(products.map((row) => row.slug)).size, 9);
  assert.equal(new Set(variants.map((row) => row.slug)).size, 9);
});

test("variant identity and deterministic SKU generation are collision-free", () => {
  const variants = parseVariants();
  assert.equal(new Set(variants.map(keyFor)).size, variants.length, "duplicate semantic variant key");
  assert.equal(new Set(variants.map(skuFor)).size, variants.length, "deterministic SKU collision");
  for (const sku of variants.map(skuFor)) {
    assert.match(sku, /^RB-260820-[0-9A-F]{16}$/);
  }
});

test("all sellable variants have positive pack size and price", () => {
  for (const row of parseVariants()) {
    assert.ok(row.packSize > 0, `${keyFor(row)} has invalid pack size`);
    assert.ok(row.price > 0, `${keyFor(row)} has invalid price`);
    assert.ok(row.thumbnail.trim(), `${keyFor(row)} has no thumbnail key`);
  }
});

test("business-critical prices and 100-ball bundles cannot silently regress", () => {
  const rows = parseVariants();
  const expected = [
    ["titleist-pro-v1-v1x-lostball", "PRO V1", "S", 5, 17000],
    ["titleist-pro-v1-v1x-lostball", "PRO V1X", "S", 5, 17000],
    ["brand-mix-lostball", "브랜드혼합", "A", 100, 40000],
    ["brand-mix-lostball", "브랜드혼합", "B", 100, 40000],
    ["general-brand-lostball", "일반브랜드", "A", 100, 35000],
    ["general-brand-lostball", "일반브랜드", "B", 100, 35000],
  ];
  for (const [slug, model, grade, packSize, price] of expected) {
    const row = findVariant(rows, slug, model, grade, packSize);
    assert.ok(row, `${slug}/${model}/${grade}/${packSize} missing`);
    assert.equal(row.price, price, `${slug}/${model}/${grade}/${packSize} price drifted`);
  }
});

test("catalog refresh preserves stock and deactivates obsolete variants before upsert", () => {
  assert.match(sql, /create temporary table reball_existing_catalog_stock on commit drop/i);
  assert.match(sql, /sum\(greatest\(v\.stock_qty, 0\)\)::integer as stock_qty/i);
  assert.match(sql, /update public\.product_variants v\s+set active = false/i);
  assert.match(sql, /left join reball_existing_catalog_stock s/i);
  assert.match(sql, /coalesce\(s\.stock_qty, 0\)/i);
  assert.match(sql, /on conflict \(sku\) do update/i);
  assert.match(sql, /active = true/i);
});

test("SKU SQL contract hashes exactly the same identity fields as the regression test", () => {
  assert.match(
    sql,
    /'RB-260820-'\s*\|\|\s*upper\(substr\(md5\(concat_ws\('\|', d\.slug, d\.model, d\.grade::text, d\.pack_size::text, d\.color\)\), 1, 16\)\) as sku/i,
  );
});
