// Embedded in generated data.js. Keep this pure factory self-contained.
function createCatalogRuntime(products) {
  const bySku = new Map();
  Object.values(products).forEach(product => product.variants.forEach(variant => bySku.set(variant.sku, { product, variant })));
  const canBuy = v => !!v && v.sellable === true && v.available === true && v.previewApproved === true && Number.isSafeInteger(v.unitAmount) && v.unitAmount > 0;
  const colorKey = v => JSON.stringify([v.colorCode, v.artworkColorway || '']);
  const colorLabel = v => v.color + (v.artworkColorway ? ` · ${v.artworkColorway}` : '');
  function colors(product) {
    return [...new Map(product.variants.map(v => [colorKey(v), { key: colorKey(v), label: colorLabel(v), hex: v.colorHex, colorCode: v.colorCode }])).values()];
  }
  function matches(product, filters = {}) {
    if (filters.category && product.category !== filters.category) return false;
    return product.variants.some(v => (!filters.color || v.colorCode === filters.color) && (!filters.size || v.size === filters.size) && (!filters.color && !filters.size || canBuy(v)));
  }
  function select(product, key, size) {
    return product.variants.find(v => colorKey(v) === key && v.size === size) || null;
  }
  function reconcile(items) {
    const cart = [], notices = [];
    if (!Array.isArray(items)) return { cart, notices: ['Your saved cart could not be read. Please select your items again.'] };
    for (const old of items) {
      const found = old && bySku.get(old.sku);
      if (!found || !canBuy(found.variant)) {
        notices.push(`${old && old.name || 'An older item'} is no longer available in that option. Please select it again from the shop.`);
        continue;
      }
      if (!Number.isSafeInteger(old.quantity) || old.quantity < 1 || old.quantity > 20) {
        notices.push(`${found.product.name} had an invalid quantity and was removed.`);
        continue;
      }
      const { product, variant } = found;
      if (old.unitAmount != null ? old.unitAmount !== variant.unitAmount : old.price != null && Math.round(old.price * 100) !== variant.unitAmount) notices.push(`The price of ${product.name} was updated to the current price.`);
      const existing = cart.find(item => item.sku === variant.sku);
      if (existing) existing.quantity = Math.min(20, existing.quantity + old.quantity);
      else cart.push({ sku: variant.sku, slug: product.slug, name: product.name, size: variant.size, color: variant.color, artworkColorway: variant.artworkColorway, unitAmount: variant.unitAmount, price: variant.unitAmount / 100, image: variant.image, quantity: old.quantity });
    }
    return { cart, notices: [...new Set(notices)] };
  }
  function readCart(storage) {
    let saved;
    try { saved = JSON.parse(storage.getItem('gmf_cart') || '[]'); } catch (_) { saved = null; }
    const result = reconcile(saved);
    storage.setItem('gmf_cart', JSON.stringify(result.cart));
    return result;
  }
  function add(storage, sku) {
    const found = bySku.get(sku);
    if (!found || !canBuy(found.variant)) throw new Error('This option is unavailable. Please choose another.');
    const result = readCart(storage);
    const existing = result.cart.find(item => item.sku === sku);
    if (existing && existing.quantity >= 20) throw new Error('The maximum quantity is 20.');
    const cart = reconcile([...result.cart, { sku, quantity: 1 }]).cart;
    storage.setItem('gmf_cart', JSON.stringify(cart));
    return { cart, notices: result.notices };
  }
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
  return { products, bySku, canBuy, colorKey, colorLabel, colors, matches, select, reconcile, readCart, add, escapeHtml, money };
}
module.exports = { createCatalogRuntime };
