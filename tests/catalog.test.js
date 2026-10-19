const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { buildCatalog, writeCatalog } = require('../scripts/build-products');
const { createCatalogRuntime } = require('../scripts/catalog-runtime');
function fixture() {
  const v = (sku, size, unitAmount, extra = {}) => ({ sku, size, unitAmount, colorCode: 'BLK', color: 'Black', colorHex: '#000000', currency: 'usd', available: true, image: 'assets/a.png', previewApproved: true, ...extra });
  return { schemaVersion: 2, currency: 'USD', products: [
    { id: 'one', slug: 'one-tee', name: 'First Tee', garment: 'tee', status: 'published', sourceAssetIds: ['private-original'], previews: ['private-job'], variants: [v('ONE-S', 'S', 2500), v('ONE-XL', 'XL', 3200), v('ONE-RED-S', 'S', 2700, { colorCode: 'RED', color: 'Red', image: 'assets/red.png', available: false }), v('ONE-RED-XL', 'XL', 3400, { colorCode: 'RED', color: 'Red', image: 'assets/red.png' }), v('ONE-PENDING-S', 'S', 2500, { colorCode: 'PENDING', previewApproved: false, image: 'https://private.example/pending.png' })] },
    { id: 'two', slug: 'two-tee', name: 'Second Tee', garment: 'tee', status: 'published', variants: [v('TWO-S', 'S', 4100)] },
    { id: 'draft', slug: 'draft-hoodie', name: 'Draft Hoodie', garment: 'hoodie', status: 'draft', variants: [v('DRAFT-S', 'S', null, { available: false, previewApproved: false, image: '' })] },
  ] };
}
test('individual size prices agree across browser, canonical server and Stripe inputs', () => {
  const result = buildCatalog(fixture());
  assert.deepEqual(Object.keys(result.products), ['one-tee', 'two-tee']);
  assert.equal(result.products['one-tee'].priceRange.min, 25);
  assert.equal(result.products['one-tee'].priceRange.max, 34);
  assert.equal(result.products['two-tee'].priceRange.min, 41);
  for (const v of result.stripeProducts) {
    assert.equal(v.unitAmount, result.variants[v.sku].unitAmount);
    assert.equal(result.products[v.slug].variants.find(x => x.sku === v.sku).price * 100, v.unitAmount);
  }
  assert.deepEqual(result.stripeProducts.map(v => v.sku), ['ONE-S', 'ONE-XL', 'ONE-RED-XL', 'TWO-S']);
});
test('drafts and unapproved imagery never leak into public data or Stripe', () => {
  const result = buildCatalog(fixture());
  const browser = JSON.stringify(result.products);
  assert.ok(!browser.includes('private-original'));
  assert.ok(!browser.includes('private-job'));
  assert.ok(!browser.includes('private.example'));
  assert.ok(!browser.includes('ONE-PENDING-S'));
  assert.equal(result.variants['ONE-PENDING-S'].sellable, false);
  assert.equal(result.variants['ONE-PENDING-S'].image, '');
  assert.equal(result.variants['DRAFT-S'], undefined);
});
test('invalid prices and duplicate identities stop generation before publishing', () => {
  for (const amount of [0, -1, 25.5, '2500', NaN]) {
    const m = fixture(); m.products[0].variants[0].unitAmount = amount;
    assert.throws(() => buildCatalog(m), /integer cents/);
  }
  const duplicate = fixture(); duplicate.products[1].variants[0].sku = 'ONE-S';
  assert.throws(() => buildCatalog(duplicate), /duplicate variant SKU/);
  const slug = fixture(); slug.products[1].slug = 'one-tee';
  assert.throws(() => buildCatalog(slug), /duplicate product slug/);
});
test('filters require color and size availability in the SAME variant', () => {
  const { products } = buildCatalog(fixture()), C = createCatalogRuntime(products), p = products['one-tee'];
  assert.equal(C.matches(p, { color: 'RED', size: 'S' }), false);
  assert.equal(C.matches(p, { color: 'RED', size: 'XL' }), true);
  assert.equal(C.matches(p, { category: 'hoodies' }), false);
  assert.equal(C.select(p, C.colorKey(p.variants[0]), 'XL').sku, 'ONE-XL');
});
test('artwork colorway remains separate from garment color', () => {
  const m = fixture();
  m.products[0].variants.push({ ...m.products[0].variants[0], sku: 'ONE-WHTMONO-S', artworkColorway: 'White print' });
  const { products } = buildCatalog(m), C = createCatalogRuntime(products);
  assert.equal(C.colors(products['one-tee']).length, 3);
  assert.equal(C.select(products['one-tee'], JSON.stringify(['BLK', 'White print']), 'S').sku, 'ONE-WHTMONO-S');
});
test('saved carts resolve exact SKU, reprice, remove unavailable and reject malformed quantities', () => {
  const C = createCatalogRuntime(buildCatalog(fixture()).products);
  const result = C.reconcile([
    { sku: 'ONE-XL', price: 1, quantity: 2, name: 'tampered' },
    { sku: 'ONE-RED-S', price: 27, quantity: 1 },
    { slug: 'one-tee', price: 0.01, quantity: 1 },
    { sku: 'TWO-S', quantity: -1 },
  ]);
  assert.equal(result.cart.length, 1);
  assert.equal(result.cart[0].unitAmount, 3200);
  assert.equal(result.cart[0].name, 'First Tee');
  assert.equal(result.cart[0].quantity, 2);
  assert.equal(result.notices.length, 3); // duplicate old-item notices are collapsed
});
test('cart addition merges exact variants and recovers corrupted storage visibly', () => {
  const C = createCatalogRuntime(buildCatalog(fixture()).products);
  const store = { value: '{broken', getItem() { return this.value; }, setItem(k, v) { this.value = v; } };
  const first = C.add(store, 'ONE-S');
  assert.equal(first.notices.length, 1);
  C.add(store, 'ONE-S'); C.add(store, 'ONE-XL');
  assert.deepEqual(JSON.parse(store.value).map(v => [v.sku, v.quantity]), [['ONE-S', 2], ['ONE-XL', 1]]);
  assert.throws(() => C.add(store, 'ONE-RED-S'), /unavailable/);
});
test('deterministic build emits a runnable browser helper and bundled server catalog', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gmf-catalog-test-'));
  try {
    fs.mkdirSync(path.join(root, 'gmf-site/content'), { recursive: true });
    fs.mkdirSync(path.join(root, 'gmf-site/scripts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.writeFileSync(path.join(root, 'gmf-site/content/design-manifest.json'), JSON.stringify(fixture()));
    writeCatalog(root);
    const first = fs.readFileSync(path.join(root, 'gmf-site/scripts/data.js'), 'utf8');
    writeCatalog(root);
    assert.equal(fs.readFileSync(path.join(root, 'gmf-site/scripts/data.js'), 'utf8'), first);
    const context = { window: {} }; vm.runInNewContext(first, context);
    assert.equal(context.window.GMF_CATALOG.bySku.get('ONE-XL').variant.unitAmount, 3200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'netlify/functions/_shared/catalog.json'))).variants['ONE-RED-S'].sellable, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
