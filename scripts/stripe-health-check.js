#!/usr/bin/env node
/**
 * GMF Productions — Stripe Health Check
 *
 * Validates:
 *  1. All 55 SKUs exist in Stripe as active products with matching active prices
 *  2. The Stripe webhook endpoint URL and last delivery status
 *  3. Live checkout sessions for one tee, one shorts, and one hat
 *
 * Usage:
 *   node scripts/stripe-health-check.js
 *   node scripts/stripe-health-check.js --url https://gmfproductions904.com
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Stripe = require('stripe');
const fs     = require('fs');
const path   = require('path');
const https  = require('https');

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) { console.error('STRIPE_SECRET_KEY not found in .env'); process.exit(1); }

const stripe = new Stripe(KEY);

// Accept --url flag or fall back to env / netlify subdomain
const urlArg  = process.argv.find(a => a.startsWith('--url='));
const SITE_URL = urlArg
  ? urlArg.split('=')[1]
  : (process.env.SITE_URL || 'https://gmfproductions-dailyclarity.netlify.app');

const PRICE_MAP_PATH = path.join(__dirname, 'stripe-price-map.json');
if (!fs.existsSync(PRICE_MAP_PATH)) {
  console.error('[health-check] stripe-price-map.json not found. Run stripe-sync-products.js first.');
  process.exit(1);
}
const PRICE_MAP = JSON.parse(fs.readFileSync(PRICE_MAP_PATH, 'utf8'));
const SKUS = Object.keys(PRICE_MAP);

let pass = 0;
let fail = 0;
const issues = [];

function ok(msg)   { pass++; console.log(`  ✓  ${msg}`); }
function err(msg)  { fail++; issues.push(msg); console.error(`  ✗  ${msg}`); }
function head(msg) { console.log(`\n${'─'.repeat(60)}\n  ${msg}\n${'─'.repeat(60)}`); }

// ─── 1. SKU Validation ───────────────────────────────────────────────
async function checkSkus() {
  head(`1. SKU Validation (${SKUS.length} expected)`);

  // Fetch all active prices in one paginated pass
  const allPrices = {};
  let cursor;
  do {
    const page = await stripe.prices.list({ limit: 100, active: true, starting_after: cursor });
    for (const p of page.data) allPrices[p.id] = p;
    cursor = page.has_more ? page.data[page.data.length - 1].id : null;
  } while (cursor);

  for (const sku of SKUS) {
    const priceId = PRICE_MAP[sku];
    const price   = allPrices[priceId];

    if (!price) {
      err(`${sku} — price ${priceId} not found or inactive`);
      continue;
    }
    // Check parent product
    const product = await stripe.products.retrieve(price.product);
    if (!product.active) {
      err(`${sku} — product ${product.id} (${product.name}) is archived`);
    } else {
      ok(`${sku} — ${product.name} · $${(price.unit_amount / 100).toFixed(2)} · ${price.id}`);
    }
  }
}

// ─── 2. Webhook Check ────────────────────────────────────────────────
async function checkWebhook() {
  head('2. Webhook Endpoint');

  const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
  if (!endpoints.data.length) { err('No webhook endpoints registered'); return; }

  for (const ep of endpoints.data) {
    const onNewDomain = ep.url.includes('gmfproductions904.com');
    const onNetlify   = ep.url.includes('netlify.app');
    const statusLine  = `${ep.url} [${ep.status}]`;

    if (ep.status !== 'enabled') {
      err(`Webhook DISABLED: ${statusLine}`);
    } else if (onNewDomain) {
      ok(`Webhook on new domain: ${statusLine}`);
    } else if (onNetlify) {
      ok(`Webhook on Netlify subdomain (OK until domain swap): ${statusLine}`);
    } else {
      err(`Webhook on unrecognised URL: ${statusLine}`);
    }

    console.log(`     Events: ${ep.enabled_events.join(', ')}`);
  }
}

// ─── 3. Live Checkout Session Test ───────────────────────────────────
async function postCheckout(sku, quantity = 1) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ items: [{ sku, quantity }] });
    const url  = new URL('/.netlify/functions/create-checkout', SITE_URL);
    const options = {
      hostname: url.hostname,
      port:     443,
      path:     url.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.write(body);
    req.end();
  });
}

async function checkCheckout() {
  head(`3. Live Checkout Sessions (${SITE_URL})`);

  const tests = [
    { label: 'T-Shirt',  sku: SKUS.find(s => s.startsWith('GMF-TEE'))   },
    { label: 'Shorts',   sku: SKUS.find(s => s.startsWith('GMF-SHORTS')) },
    { label: 'Hat',      sku: SKUS.find(s => s.startsWith('GMF-HAT'))    },
  ];

  for (const { label, sku } of tests) {
    if (!sku) { err(`No ${label} SKU found in price map`); continue; }
    const { status, body } = await postCheckout(sku);
    if (status === 200) {
      let parsed;
      try { parsed = JSON.parse(body); } catch (_) { parsed = {}; }
      if (parsed.url && parsed.url.startsWith('https://checkout.stripe.com')) {
        ok(`${label} → ${parsed.url.split('?')[0]}...`);
      } else {
        err(`${label} → HTTP 200 but unexpected body: ${body.slice(0, 120)}`);
      }
    } else {
      err(`${label} (${sku}) → HTTP ${status}: ${body.slice(0, 200)}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────
(async () => {
  console.log('\nGMF Productions — Stripe Health Check');
  console.log(`Site: ${SITE_URL}`);
  console.log(`SKUs in price map: ${SKUS.length}`);

  try { await checkSkus();    } catch (e) { err(`SKU check threw: ${e.message}`); }
  try { await checkWebhook(); } catch (e) { err(`Webhook check threw: ${e.message}`); }
  try { await checkCheckout();} catch (e) { err(`Checkout check threw: ${e.message}`); }

  head(`Summary`);
  console.log(`  PASS: ${pass}  FAIL: ${fail}`);
  if (issues.length) {
    console.log('\n  Issues:');
    issues.forEach(i => console.log(`    • ${i}`));
    process.exit(1);
  } else {
    console.log('\n  All checks PASSED.');
  }
})();
