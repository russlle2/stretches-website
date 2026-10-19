// Generate browser and authoritative server catalogs without network side effects.
const fs = require('fs');
const path = require('path');
const { createCatalogRuntime } = require('./catalog-runtime');
const CATEGORIES = { tee: 'tees', shorts: 'shorts', hat: 'hats', hoodie: 'hoodies', crewneck: 'crewnecks' };
const safeImage = value => typeof value === 'string' && /^(?:https:\/\/|\/?assets\/)/.test(value) ? value : '';

function buildCatalog(manifest) {
  if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.products)) throw new Error('Catalog schemaVersion 2 with products is required.');
  if (String(manifest.currency || 'USD').toUpperCase() !== 'USD') throw new Error('Only USD is supported.');
  const products = {}, variants = {}, stripeProducts = [];
  const ids = new Set(), slugs = new Set(), skus = new Set();
  for (const p of manifest.products) {
    if (!p.id || ids.has(p.id)) throw new Error(`Missing or duplicate product ID: ${p.id}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug || '') || slugs.has(p.slug)) throw new Error(`Invalid or duplicate product slug: ${p.slug}`);
    if (!['draft', 'published'].includes(p.status)) throw new Error(`Invalid status for ${p.slug}`);
    if (!p.name || !Array.isArray(p.variants)) throw new Error(`Name and variants required for ${p.slug}`);
    ids.add(p.id); slugs.add(p.slug);
    const publicVariants = [], combinations = new Set();
    for (const v of p.variants) {
      if (!/^[A-Za-z0-9_-]+$/.test(v.sku || '') || skus.has(v.sku)) throw new Error(`Invalid or duplicate variant SKU: ${v.sku}`);
      if (!v.size || !v.colorCode || !v.color) throw new Error(`Size and color required for ${v.sku}`);
      const combination = JSON.stringify([v.colorCode, v.artworkColorway || '', v.size]);
      if (combinations.has(combination)) throw new Error(`Duplicate color/artwork/size for ${p.slug}`);
      combinations.add(combination); skus.add(v.sku);
      if (v.unitAmount != null && (!Number.isSafeInteger(v.unitAmount) || v.unitAmount <= 0)) throw new Error(`Price must be positive integer cents or null: ${v.sku}`);
      if (String(v.currency || 'usd').toLowerCase() !== 'usd') throw new Error(`Unsupported currency for ${v.sku}`);
      if (p.status !== 'published') continue;
      const image = v.previewApproved === true ? safeImage(v.image) : '';
      const sellable = v.available === true && v.previewApproved === true && v.unitAmount > 0 && !!image;
      const canonical = {
        sku: v.sku, productId: p.id, slug: p.slug, name: p.name,
        size: v.size, colorCode: v.colorCode, color: v.color,
        colorHex: /^#[0-9a-f]{6}$/i.test(v.colorHex || '') ? v.colorHex : null,
        artworkColorway: v.artworkColorway || '', unitAmount: v.unitAmount ?? null,
        currency: 'usd', image, available: v.available === true,
        previewApproved: v.previewApproved === true, sellable,
        generatedPreview: v.generatedPreview === true,
      };
      variants[v.sku] = canonical;
      if (canonical.previewApproved && image) publicVariants.push({ ...canonical, price: v.unitAmount == null ? null : v.unitAmount / 100, featuredImage: image, inventoryStatus: sellable ? 'in_stock' : 'unavailable' });
      if (sellable) stripeProducts.push({ ...canonical, name: `${p.name} — ${v.color}${v.artworkColorway ? ` / ${v.artworkColorway}` : ''} / ${v.size}`, description: p.description || '', garment: p.garment, collection: p.collection || '' });
    }
    if (p.status !== 'published' || !publicVariants.length) continue;
    const prices = publicVariants.filter(v => v.sellable).map(v => v.price);
    products[p.slug] = {
      id: p.id, productGroupID: p.id, slug: p.slug, name: p.name,
      garment: p.garment, category: CATEGORIES[p.garment] || p.garment,
      collection: p.collection || '', description: p.description || '',
      material: p.material || '', fit: p.fit || '', gsm: p.gsm || null,
      care: Array.isArray(p.care) ? p.care : [], sizeGuide: p.sizeGuide || {},
      images: [...new Set([...publicVariants.map(v => v.image), ...(p.images || []).map(safeImage).filter(Boolean)])],
      variants: publicVariants,
      priceRange: { min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null, currency: 'USD' },
    };
  }
  return { schemaVersion: 2, currency: 'usd', products, variants, stripeProducts };
}
function writeCatalog(root = path.resolve(__dirname, '..')) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'gmf-site/content/design-manifest.json'), 'utf8'));
  const { stripeProducts, ...catalog } = buildCatalog(manifest);
  const browser = `// Generated from content/design-manifest.json. Do not edit.\nwindow.PRODUCTS = ${JSON.stringify(catalog.products, null, 2)};\nwindow.GMF_CATALOG = (${createCatalogRuntime.toString()})(window.PRODUCTS);\n`;
  fs.writeFileSync(path.join(root, 'gmf-site/scripts/data.js'), browser);
  fs.writeFileSync(path.join(root, 'scripts/products.json'), JSON.stringify(stripeProducts, null, 2) + '\n');
  const serverPath = path.join(root, 'netlify/functions/_shared/catalog.json');
  fs.mkdirSync(path.dirname(serverPath), { recursive: true });
  fs.writeFileSync(serverPath, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Built ${Object.keys(catalog.products).length} public products and ${stripeProducts.length} sellable variants.`);
  return catalog;
}
if (require.main === module) writeCatalog();
module.exports = { buildCatalog, writeCatalog };
