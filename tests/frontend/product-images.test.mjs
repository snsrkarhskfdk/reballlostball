import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
  productPhotoCatalog,
  resolveAdminVariantThumbnail,
  resolveRemoteVariantImage,
  resolveProductVariantImage,
} from "../../src/frontend/catalog/product-images.mjs";
import { products } from "../../src/frontend/catalog/content.mjs";

test("variant image resolution matches model aliases and UI grades", () => {
  const product = {
    image: "fallback.webp",
    variantImageRules: productPhotoCatalog.bridgestone.rules,
  };

  assert.equal(
    resolveProductVariantImage(product, { model: "투어 X", grade: "S", color: "화이트" }),
    "product-variants/bridgestone-tour-b-s.webp"
  );
  assert.equal(
    resolveProductVariantImage(product, { model: "E12", grade: "B", color: "혼합" }),
    "product-variants/bridgestone-e12-a-minus-color.webp"
  );
});

test("variant image resolution uses the most specific matching rule", () => {
  const product = {
    image: "fallback.webp",
    variantImageRules: [
      { grades: ["B"], image: "grade.webp" },
      { models: ["E12"], grades: ["B"], colors: ["화이트"], image: "exact.webp" },
    ],
  };

  assert.equal(
    resolveProductVariantImage(product, { model: "E12", grade: "B", color: "화이트" }),
    "exact.webp"
  );
});

test("variant image resolution keeps the product fallback when no photo matches", () => {
  assert.equal(
    resolveProductVariantImage(
      { image: "fallback.webp", variantImageRules: productPhotoCatalog.taylormade.rules },
      { model: "TP5X", grade: "A", color: "화이트" }
    ),
    "fallback.webp"
  );
});

test("an explicit Supabase thumbnail is preserved and blank thumbnails use the supplied mapping", () => {
  const product = {
    image: "fallback.webp",
    variantImageRules: productPhotoCatalog.bridgestone.rules,
  };
  const selection = { model: "투어 X", grade: "S", color: "화이트" };

  assert.equal(
    resolveRemoteVariantImage(product, selection, "remote-variant.webp", "fallback.webp"),
    "remote-variant.webp"
  );
  assert.equal(
    resolveRemoteVariantImage(product, selection, "", "fallback.webp"),
    "product-variants/bridgestone-tour-b-s.webp"
  );
});

test("admin variant saves preserve existing SKU thumbnails and map only new SKUs", () => {
  const product = {
    image: "fallback.webp",
    variantImageRules: productPhotoCatalog.bridgestone.rules,
    dbVariants: [{ sku: "EXISTING", imageUrl: "remote-existing.webp" }],
  };

  assert.equal(
    resolveAdminVariantThumbnail(product, {
      sku: "EXISTING",
      model: "투어 X",
      grade: "S",
      color: "화이트",
    }),
    "remote-existing.webp"
  );
  assert.equal(
    resolveAdminVariantThumbnail(product, {
      sku: "NEW",
      model: "투어 X",
      grade: "S",
      color: "화이트",
    }),
    "product-variants/bridgestone-tour-b-s.webp"
  );
});

test("intended model and grade combinations resolve to their classified photos", () => {
  const cases = [
    ["volvik", "비비드 컬러", "S", "컬러", "volvik-vivid-s.webp"],
    ["volvik", "비비드 컬러", "A", "컬러", "volvik-vivid-a.webp"],
    ["volvik", "화이트", "S", "화이트", "volvik-white-a-plus.webp"],
    ["volvik", "화이트", "A", "화이트", "volvik-white-a.webp"],
    ["volvik", "화이트", "B", "화이트", "volvik-white-a-minus.webp"],
    ["volvik", "일반 컬러", "S", "컬러", "volvik-general-a-plus.webp"],
    ["volvik", "일반 컬러", "B", "컬러", "volvik-general-a-minus.webp"],
    ["volvik", "360", "B", "화이트", "volvik-360-a-minus.webp"],
    ["bridgestone", "투어 X", "S", "화이트", "bridgestone-tour-b-s.webp"],
    ["bridgestone", "투어 X", "A", "화이트", "bridgestone-tour-b-a.webp"],
    ["bridgestone", "투어 X", "B", "화이트", "bridgestone-tour-b-a-minus.webp"],
    ["bridgestone", "E12", "B", "화이트", "bridgestone-e12-a-minus-white.webp"],
    ["bridgestone", "E12", "B", "혼합", "bridgestone-e12-a-minus-color.webp"],
    ["saintnine", "화이트", "S", "화이트", "saintnine-a-plus.webp"],
    ["saintnine", "화이트", "A", "화이트", "saintnine-a.webp"],
    ["saintnine", "화이트", "B", "화이트", "saintnine-a-minus.webp"],
    ["srixon", "Z-STAR", "S", "화이트", "srixon-general-a-plus.webp"],
    ["srixon", "Z-STAR", "A", "화이트", "srixon-general-a.webp"],
    ["srixon", "Z-STAR", "B", "화이트", "srixon-general-a-minus.webp"],
    ["callaway", "ERC 소프트", "S", "화이트", "callaway-erc-a-plus.webp"],
    ["callaway", "ERC 소프트", "A", "화이트", "callaway-erc-a.webp"],
    ["callaway", "CHROME TOUR", "S", "화이트", "callaway-general-a-plus.webp"],
    ["callaway", "CHROME TOUR", "A", "화이트", "callaway-general-a.webp"],
    ["taylormade", "TP5", "S", "화이트", "taylormade-tp5-a-plus.webp"],
  ];

  for (const [brand, model, grade, color, filename] of cases) {
    const product = { image: "fallback.webp", variantImageRules: productPhotoCatalog[brand].rules };
    assert.equal(
      resolveProductVariantImage(product, { model, grade, color }),
      `product-variants/${filename}`,
      `${brand} ${model} ${grade} ${color}`
    );
  }
});

test("all 27 supplied photos remain represented in the catalog galleries", () => {
  const photos = Object.values(productPhotoCatalog).flatMap((entry) => entry.galleryImages);
  assert.equal(photos.length, 27);
  assert.equal(new Set(photos.map((item) => item.image)).size, 27);
  assert.ok(photos.every((item) => item.image.startsWith("product-variants/")));
  assert.ok(
    photos.every((item) => existsSync(new URL(`../../assets/figma/${item.image}`, import.meta.url)))
  );
});

test("each supplied brand exposes its representative photo on the homepage card", () => {
  for (const [brandSlug, catalog] of Object.entries(productPhotoCatalog)) {
    const product = products.find((item) => item.brandSlug === brandSlug);
    assert.ok(product, `${brandSlug} product is missing`);
    assert.equal(product.cardImage, catalog.representative);
    assert.ok(catalog.galleryImages.every((photo) => product.galleryImages.includes(photo)));
  }
  assert.ok(products.find((item) => item.brandSlug === "volvik").models.includes("360"));
  assert.ok(!products.find((item) => item.brandSlug === "volvik").models.includes("반반볼 크리스탈"));
  assert.ok(products.find((item) => item.brandSlug === "callaway").models.includes("ERC 소프트"));
});
