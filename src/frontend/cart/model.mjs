import { variantSelection } from "../catalog/variants.mjs";

export function bundleId(bundle) {
  if (bundle.id) return bundle.id;
  const title = (bundle.title || "bundle")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const productsKey = bundle.products.map((product) => product.slug).join("-");
  return `${title || "bundle"}__${productsKey}__${bundle.price}`;
}

export function cartItemDescription(item) {
  const selection = item.selection ?? {};
  return [selection.model, selection.grade, selection.pack, selection.color].filter(Boolean).join(" / ");
}

export function cartItemFromVariant(product, variant, quantity) {
  return {
    key: variant.id,
    variantId: variant.id,
    slug: product.slug,
    name: product.name,
    brandName: product.brandName,
    image: variant.imageUrl || product.image,
    selection: variantSelection(variant),
    sku: variant.sku,
    compareAtPrice: variant.compareAtPrice,
    price: variant.price,
    stock: variant.stock,
    quantity,
  };
}

export function cartTotal(cart = []) {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function shippingCost(total, policy, cart = []) {
  if (!total) return 0;
  const hasSpecialFreeShipping = cart.some(
    (item) =>
      item?.slug === "general-brand-lostball" &&
      item?.selection?.pack === "100구" &&
      ["A", "B"].includes(item?.selection?.grade)
  );
  if (hasSpecialFreeShipping) return 0;
  return total >= policy.freeThreshold ? 0 : policy.baseFee;
}
