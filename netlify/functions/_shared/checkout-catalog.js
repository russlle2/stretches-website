function validateCart(items, catalog) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new Error('Choose at least one item (maximum 50 different variants).');
  const quantities = new Map();
  for (const item of items) {
    const variant = catalog.variants?.[item.sku];
    if (!variant || variant.sellable !== true || !Number.isSafeInteger(variant.unitAmount) || variant.unitAmount <= 0) throw new Error('An item is unavailable. Refresh your cart and choose an available size and color.');
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw new Error('Quantity must be between 1 and 20.');
    const quantity = (quantities.get(item.sku) || 0) + item.quantity;
    if (quantity > 20) throw new Error('Maximum 20 pieces of each size and color.');
    quantities.set(item.sku, quantity);
  }
  return [...quantities].map(([sku, quantity]) => ({ variant: catalog.variants[sku], quantity }));
}
function lineItems(cart, siteUrl) {
  return cart.map(({ variant: v, quantity }) => ({ quantity, price_data: {
    currency: v.currency || 'usd', unit_amount: v.unitAmount,
    product_data: {
      name: `${v.name} — ${v.color} / ${v.size}`,
      ...(v.image ? { images: [new URL(v.image, `${siteUrl}/`).href] } : {}),
      metadata: { gmf_sku: v.sku, product_id: v.productId, slug: v.slug, size: v.size, garment_color: v.color, artwork_colorway: v.artworkColorway || '' },
    },
  } }));
}
module.exports = { validateCart, lineItems };
