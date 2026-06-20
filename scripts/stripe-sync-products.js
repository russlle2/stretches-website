// stripe-sync-products.js
// Idempotently create Stripe products + prices for every SKU in
// scripts/products.json. Uses metadata.gmf_sku as the unique idempotency key
// so re-runs find existing products and don't double-create.
//
// Outputs scripts/stripe-price-map.json -> { [sku]: priceId } which is also
// merged into Netlify env var STRIPE_PRICE_MAP if --push-netlify is passed.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  console.error('STRIPE_SECRET_KEY missing in .env');
  process.exit(1);
}
const stripe = new Stripe(STRIPE_KEY);

const ROOT = path.resolve(__dirname, '..');
const PRODUCTS_JSON = path.join(ROOT, 'scripts', 'products.json');
const PRICE_MAP_OUT = path.join(ROOT, 'scripts', 'stripe-price-map.json');
const SITE_URL = process.env.SITE_URL || 'https://gmfproductions-dailyclarity.netlify.app';

async function findProductBySku(sku) {
  const search = await stripe.products.search({
    query: `metadata['gmf_sku']:'${sku}' AND active:'true'`,
    limit: 1,
  });
  return search.data[0] || null;
}

async function ensureProduct(p) {
  const existing = await findProductBySku(p.sku);
  if (existing) {
    return existing;
  }
  const created = await stripe.products.create({
    name: p.name,
    description: p.description,
    images: [`${SITE_URL}/${p.image}`],
    metadata: {
      gmf_sku: p.sku,
      slug: p.slug,
      garment: p.garment,
      design: p.design,
    },
    shippable: true,
    statement_descriptor: 'GMF MERCH',
    tax_code: 'txcd_30060006', // apparel
  });
  return created;
}

async function ensurePrice(product, unitAmount, currency) {
  // Find existing default price with matching amount
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
  const match = prices.data.find((pr) => pr.unit_amount === unitAmount && pr.currency === currency);
  if (match) return match;
  const created = await stripe.prices.create({
    product: product.id,
    unit_amount: unitAmount,
    currency,
    metadata: { gmf_sku: product.metadata.gmf_sku },
  });
  // Set as default if none
  if (!product.default_price) {
    await stripe.products.update(product.id, { default_price: created.id });
  }
  return created;
}

async function main() {
  const products = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf8'));
  const priceMap = {};
  let created = 0;
  let reused = 0;

  for (const p of products) {
    process.stdout.write(`[${p.sku}] `);
    let existed = !!(await findProductBySku(p.sku));
    const product = await ensureProduct(p);
    const price = await ensurePrice(product, p.unitAmount, p.currency);
    priceMap[p.sku] = price.id;
    if (existed) {
      reused++;
      process.stdout.write(`reused ${product.id} / ${price.id}\n`);
    } else {
      created++;
      process.stdout.write(`created ${product.id} / ${price.id}\n`);
    }
  }

  fs.writeFileSync(PRICE_MAP_OUT, JSON.stringify(priceMap, null, 2));
  console.log(`\n${created} created, ${reused} reused. price map -> ${PRICE_MAP_OUT}`);

  if (process.argv.includes('--push-netlify')) {
    await pushToNetlify(priceMap);
  }
}

async function pushToNetlify(priceMap) {
  const token = process.env.NETLIFY_AUTH_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID || '87306276-74e8-4e66-a18d-ebe43eeefee2';
  const accountId = process.env.NETLIFY_ACCOUNT_ID || '6974219b1ab3798c7aed8c87';
  if (!token) {
    console.warn('NETLIFY_AUTH_TOKEN missing; skipping env push');
    return;
  }
  const url = `https://api.netlify.com/api/v1/accounts/${accountId}/env/STRIPE_PRICE_MAP?site_id=${siteId}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const body = {
    key: 'STRIPE_PRICE_MAP',
    values: [{ context: 'all', value: JSON.stringify(priceMap) }],
    scopes: ['builds', 'functions', 'runtime'],
    is_secret: false,
  };
  let res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (res.status === 404) {
    res = await fetch(`https://api.netlify.com/api/v1/accounts/${accountId}/env?site_id=${siteId}`, {
      method: 'POST', headers, body: JSON.stringify([body]),
    });
  }
  if (!res.ok) {
    console.error('Netlify env push failed:', res.status, await res.text());
  } else {
    console.log('STRIPE_PRICE_MAP pushed to Netlify env');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
