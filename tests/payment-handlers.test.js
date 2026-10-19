const test = require('node:test');
const assert = require('node:assert/strict');

function replaceModule(t, name, exports) {
  const resolved = require.resolve(name), original = require.cache[resolved];
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  t.after(() => { if (original) require.cache[resolved] = original; else delete require.cache[resolved]; });
}
function environment(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
}
function fresh(name) { delete require.cache[require.resolve(name)]; return require(name); }
const variant = { sku: 'GMF-TEST-BLK-XL', productId: 'test-tee', slug: 'test-tee', name: 'Test Tee', color: 'Black', size: 'XL', unitAmount: 3175, currency: 'usd', sellable: true, image: '/assets/test.png' };
const checkoutEvent = items => ({ httpMethod: 'POST', body: JSON.stringify({ items, customerEmail: 'customer@example.test' }) });

test('checkout HTTP handler uses canonical amounts and exact SKU in the intended merchant account', async t => {
  environment(t, { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_ACCOUNT_ID: 'acct_fixture', SITE_URL: 'https://shop.example.test' });
  let payload, accountReads = 0;
  replaceModule(t, 'stripe', class {
    accounts = { retrieve: async () => { accountReads++; return { id: 'acct_fixture', charges_enabled: true }; } };
    checkout = { sessions: { create: async input => { payload = input; return { id: 'cs_fixture', url: 'https://checkout.stripe.test/session' }; } } };
  });
  replaceModule(t, '../netlify/functions/_shared/catalog.json', { variants: { [variant.sku]: variant } });
  const { handler } = fresh('../netlify/functions/create-checkout');
  const response = await handler(checkoutEvent([{ sku: variant.sku, quantity: 2, price: 0.01, stripePriceId: 'price_other_account', name: 'attacker supplied' }]));
  assert.equal(response.statusCode, 200);
  assert.equal(accountReads, 1);
  assert.equal(payload.line_items[0].price_data.unit_amount, 3175);
  assert.equal(payload.line_items[0].price_data.product_data.metadata.gmf_sku, variant.sku);
  assert.equal(payload.line_items[0].quantity, 2);
  assert.equal(payload.line_items[0].price, undefined);
  assert.equal(payload.metadata.stripe_account_id, 'acct_fixture');
  assert.equal(payload.success_url, 'https://shop.example.test/checkout-success.html?session_id={CHECKOUT_SESSION_ID}');
});

test('checkout refuses an incorrect or disabled merchant before session creation', async t => {
  environment(t, { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_ACCOUNT_ID: 'acct_expected' });
  replaceModule(t, '../netlify/functions/_shared/catalog.json', { variants: { [variant.sku]: variant } });
  let writes = 0;
  for (const account of [{ id: 'acct_wrong', charges_enabled: true }, { id: 'acct_expected', charges_enabled: false }]) {
    replaceModule(t, 'stripe', class {
      accounts = { retrieve: async () => account };
      checkout = { sessions: { create: async () => { writes++; throw new Error('must not create'); } } };
    });
    const { handler } = fresh('../netlify/functions/create-checkout');
    const response = await handler(checkoutEvent([{ sku: variant.sku, quantity: 1 }]));
    assert.equal(response.statusCode, 503);
  }
  assert.equal(writes, 0);
});

test('invalid cart requests never call Stripe', async t => {
  environment(t, { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_ACCOUNT_ID: 'acct_expected' });
  replaceModule(t, '../netlify/functions/_shared/catalog.json', { variants: { [variant.sku]: variant } });
  let constructed = 0;
  replaceModule(t, 'stripe', class { constructor() { constructed++; } });
  const { handler } = fresh('../netlify/functions/create-checkout');
  for (const items of [[{ sku: 'unknown', quantity: 1 }], [{ sku: variant.sku, quantity: 21 }], []]) {
    assert.equal((await handler(checkoutEvent(items))).statusCode, 400);
  }
  assert.equal(constructed, 0);
});

function webhookFixture(t, { legacy = false, persistenceError = false } = {}) {
  environment(t, { STRIPE_SECRET_KEY: 'sk_test_current', STRIPE_ACCOUNT_ID: 'acct_current', STRIPE_WEBHOOK_SECRET: 'whsec_current', STRIPE_LEGACY_SECRET_KEY: 'sk_test_legacy', STRIPE_LEGACY_ACCOUNT_ID: 'acct_legacy', STRIPE_LEGACY_WEBHOOK_SECRET: 'whsec_legacy' });
  const writes = [], retrievalKeys = [], raws = [];
  const event = { id: 'evt_fixture', type: 'checkout.session.completed', created: 12345, data: { object: { id: 'cs_fixture', metadata: { source: 'gmf-productions-website' } } } };
  replaceModule(t, 'stripe', class {
    constructor(key) {
      this.webhooks = { constructEvent: (raw, signature, secret) => { raws.push(raw); if (secret !== (legacy ? 'whsec_legacy' : 'whsec_current')) throw new Error('wrong signature'); return event; } };
      this.checkout = { sessions: {
        retrieve: async id => { retrievalKeys.push(key); return { id, status: 'complete', payment_status: 'paid', payment_intent: 'pi_fixture', amount_total: 3175, currency: 'usd', customer_email: 'customer@example.test', customer_details: { email: 'customer@example.test' } }; },
        listLineItems: async function* () { yield { description: 'Test Tee — Black / XL', quantity: 1, amount_subtotal: 3175, amount_total: 3175, currency: 'usd', price: { id: 'price_fixture', product: { id: 'prod_fixture', metadata: { gmf_sku: variant.sku, size: 'XL', garment_color: 'Black', artwork_colorway: 'White' } } } }; },
      } };
    }
  });
  const originalShared = require('../netlify/functions/_shared/supabase');
  replaceModule(t, '../netlify/functions/_shared/supabase', { ...originalShared, getSupabase: () => ({ rpc: async (name, args) => { writes.push({ name, args }); return { error: persistenceError ? { code: 'fixture_database_unavailable' } : null }; } }) });
  return { ...fresh('../netlify/functions/stripe-webhook'), writes, retrievalKeys, raws, event };
}

test('signed webhook re-fetches payment and records exact variant metadata idempotently through the order RPC', async t => {
  const fixture = webhookFixture(t);
  const event = { httpMethod: 'POST', headers: { 'stripe-signature': 'fixture' }, isBase64Encoded: true, body: Buffer.from('raw-signed-event').toString('base64') };
  assert.equal((await fixture.handler(event)).statusCode, 200);
  assert.ok(Buffer.isBuffer(fixture.raws[0]));
  assert.equal(fixture.raws[0].toString(), 'raw-signed-event');
  assert.deepEqual(fixture.retrievalKeys, ['sk_test_current']);
  const { name, args } = fixture.writes[0];
  assert.equal(name, 'gmf_record_order');
  assert.equal(args.p_order.stripe_account_id, 'acct_current');
  assert.equal(args.p_order.status, 'paid');
  assert.equal(args.p_order.line_items[0].sku, variant.sku);
  assert.equal(args.p_order.line_items[0].size, 'XL');
  assert.equal(args.p_order.stripe_event_id, 'evt_fixture');
});

test('legacy webhook signatures select legacy credentials and account', async t => {
  const fixture = webhookFixture(t, { legacy: true });
  assert.equal((await fixture.handler({ httpMethod: 'POST', headers: { 'stripe-signature': 'fixture' }, body: 'raw' })).statusCode, 200);
  assert.deepEqual(fixture.retrievalKeys, ['sk_test_legacy']);
  assert.equal(fixture.writes[0].args.p_order.stripe_account_id, 'acct_legacy');
});

test('order persistence failures ask Stripe to retry instead of acknowledging lost orders', async t => {
  const fixture = webhookFixture(t, { persistenceError: true });
  const result = await fixture.handler({ httpMethod: 'POST', headers: { 'stripe-signature': 'fixture' }, body: 'raw' });
  assert.equal(result.statusCode, 503);
  assert.equal(fixture.writes.length, 1);
});
