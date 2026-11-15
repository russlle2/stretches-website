const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBulkOrder, formatBulkOrder } = require('../netlify/functions/_shared/bulk-order-validation');

function request(overrides = {}) {
  return {
    name: 'Jordan Sample', email: 'jordan@example.test', phone: '+1 904 555 0100',
    organization: 'Example Crew', eventDate: '2099-11-30', delivery: 'Shipping',
    location: 'Jacksonville, FL 32202', decoration: 'Printed', placements: ['Front', 'Back'],
    artworkStatus: 'Artwork ready', artworkUrl: 'https://example.test/artwork.pdf',
    notes: 'White print.\nPlease quote an alternate garment.', website: '',
    items: [
      { garment: 'T-shirt', color: 'Black', sizes: { S: 4, M: 6, L: 3, XL: 0 } },
      { garment: 'Hat', color: 'Navy', sizes: { 'One size': 8 } },
    ],
    ...overrides,
  };
}

function fixture(t, outcome = { error: null }) {
  const sharedPath = require.resolve('../netlify/functions/_shared/supabase');
  const handlerPath = require.resolve('../netlify/functions/bulk-order');
  const originalShared = require.cache[sharedPath];
  const originalHandler = require.cache[handlerPath];
  const writes = [];
  let clients = 0;
  require.cache[sharedPath] = { id: sharedPath, filename: sharedPath, loaded: true, exports: {
    json: (statusCode, payload) => ({ statusCode, body: JSON.stringify(payload) }),
    getSupabase: () => {
      clients++;
      if (outcome === null) return null;
      return { from: table => ({ insert: async row => {
        writes.push({ table, row });
        if (outcome instanceof Error) throw outcome;
        return typeof outcome === 'function' ? outcome() : outcome;
      } }) };
    },
  } };
  delete require.cache[handlerPath];
  const { handler } = require(handlerPath);
  t.after(() => {
    if (originalShared) require.cache[sharedPath] = originalShared; else delete require.cache[sharedPath];
    if (originalHandler) require.cache[handlerPath] = originalHandler; else delete require.cache[handlerPath];
  });
  return { handler, writes, clients: () => clients };
}

function event(payload = request(), overrides = {}) {
  return { httpMethod: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), ...overrides };
}

test('calculates every size and garment total on the server and ignores supplied totals', () => {
  const order = validateBulkOrder(request({ totalQuantity: 1 }));
  assert.equal(order.totalQuantity, 21);
  assert.deepEqual(order.items.map(item => item.quantity), [13, 8]);
  assert.deepEqual(order.items[0].sizes, { S: 4, M: 6, L: 3 });
  assert.equal(validateBulkOrder(request({ items: [{ garment: 'Polo', color: 'White', sizes: { M: 10000 } }] })).totalQuantity, 10000);
});

test('rejects incomplete requests, bad types, invalid choices, unsafe links, and malformed quantities', () => {
  const invalid = [
    null, [], 'text', request({ name: ' ' }), request({ name: 7 }), request({ email: 'not-an-email' }),
    request({ phone: {} }), request({ organization: 'x'.repeat(161) }), request({ notes: 'x'.repeat(5001) }),
    request({ name: 'Nul\u0000Name' }), request({ artworkUrl: 'javascript:alert(1)' }),
    request({ artworkUrl: 'https://user:password@example.test/file' }), request({ artworkUrl: '/relative/path' }),
    request({ delivery: 'Pigeon' }), request({ decoration: '' }), request({ artworkStatus: null }),
    request({ placements: [] }), request({ placements: ['Unknown'] }), request({ placements: 'Front' }),
    request({ items: [] }), request({ items: Array.from({ length: 21 }, () => request().items[0]) }),
    request({ items: [null] }), request({ items: [{ garment: 'T-shirt', color: '', sizes: { M: 1 } }] }),
    request({ items: [{ garment: 'Sneaker', color: 'Black', sizes: { M: 1 } }] }),
    request({ items: [{ garment: 'T-shirt', color: 'Black', sizes: {} }] }),
    request({ items: [{ garment: 'T-shirt', color: 'Black', sizes: [] }] }),
    request({ items: [{ garment: 'T-shirt', color: 'Black', sizes: { UNKNOWN: 1 } }] }),
    request({ items: [{ garment: 'T-shirt', color: 'Black', sizes: { M: 10000, L: 1 } }] }),
    request({ items: [{ garment: 'T-shirt', color: 'Black', sizes: { M: 10000 } }, request().items[1]] }),
    ...[-1, 1.5, '2', null, true, 10001].map(quantity => request({ items: [{ garment: 'T-shirt', color: 'Black', sizes: { M: quantity } }] })),
  ];
  for (const input of invalid) assert.throws(() => validateBulkOrder(input));
});

test('validates real calendar dates while accepting a visitor’s local today near UTC midnight', () => {
  const now = new Date('2026-11-16T01:00:00.000Z');
  assert.equal(validateBulkOrder(request({ eventDate: '2026-11-15' }), now).eventDate, '2026-11-15');
  assert.equal(validateBulkOrder(request({ eventDate: '' }), now).eventDate, '');
  for (const eventDate of ['2026-11-14', '2026-02-30', '2027-02-29', '2027-13-01', '12/12/2027']) {
    assert.throws(() => validateBulkOrder(request({ eventDate }), now));
  }
  assert.equal(validateBulkOrder(request({ eventDate: '2028-02-29' }), now).eventDate, '2028-02-29');
});

test('message preserves all quote details and makes unpaid request status explicit', () => {
  const message = formatBulkOrder(validateBulkOrder(request()), 'GMF-EXAMPLE');
  for (const text of ['GMF-EXAMPLE', 'not a paid or confirmed production order', 'Jordan Sample', 'jordan@example.test', '+1 904 555 0100', 'Example Crew', 'TOTAL QUANTITY: 21', 'T-shirt | Black | 13 pieces', 'S: 4, M: 6, L: 3', 'Hat | Navy | 8 pieces', 'One size: 8', 'Front, Back', 'Printed', 'Artwork ready', 'https://example.test/artwork.pdf', '2099-11-30', 'Shipping', 'Jacksonville, FL 32202', 'White print.\nPlease quote an alternate garment.']) {
    assert.ok(message.includes(text), `Missing ${text}`);
  }
});

test('success means the complete request was saved in the existing private contact inbox', async t => {
  let finish;
  const persistence = new Promise(resolve => { finish = resolve; });
  const f = fixture(t, () => persistence);
  let responded = false;
  const pending = f.handler(event()).then(value => { responded = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(responded, false);
  finish({ error: null });
  const response = await pending;
  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.success, true);
  assert.equal(payload.totalQuantity, 21);
  assert.match(payload.reference, /^GMF-[A-F0-9]{16}$/);
  assert.equal(f.writes.length, 1);
  const { table, row } = f.writes[0];
  assert.equal(table, 'contact_messages');
  assert.equal(row.slug, 'bulk-apparel-order');
  assert.equal(row.visitor_name, 'Jordan Sample');
  assert.equal(row.visitor_email, 'jordan@example.test');
  assert.equal(row.visitor_phone, '+1 904 555 0100');
  assert.ok(row.message.includes(payload.reference));
  assert.ok(row.message.includes('TOTAL QUANTITY: 21'));
});

test('malformed JSON, invalid request, honeypot, oversized body and non-JSON never reach persistence', async t => {
  const f = fixture(t);
  for (const [input, expected] of [
    [event({}, { body: '{' }), 400],
    [event(request({ email: '' })), 400],
    [event(request({ website: 'bot.example' })), 400],
    [event({}, { body: 'x'.repeat(90 * 1024) }), 413],
    [event({}, { body: 'é'.repeat(40 * 1024) }), 413],
    [event({}, { headers: { 'Content-Type': 'text/plain' } }), 415],
    [event({}, { httpMethod: 'GET' }), 405],
    [event({}, { httpMethod: 'OPTIONS' }), 204],
  ]) assert.equal((await f.handler(input)).statusCode, expected);
  assert.equal(f.clients(), 0);
  assert.equal(f.writes.length, 0);
});

test('base64 Netlify events work and excessive decoded body is rejected', async t => {
  const f = fixture(t);
  const body = Buffer.from(JSON.stringify(request())).toString('base64');
  assert.equal((await f.handler(event({}, { body, isBase64Encoded: true }))).statusCode, 200);
  const large = Buffer.from('x'.repeat(66 * 1024)).toString('base64');
  assert.equal((await f.handler(event({}, { body: large, isBase64Encoded: true }))).statusCode, 413);
  assert.equal(f.writes.length, 1);
});

test('configuration and database failures do not report success or expose internal details', async t => {
  for (const outcome of [null, { error: { message: 'private database details', code: 'secret' } }, new Error('private database details')]) {
    await t.test(String(outcome), async subtest => {
      const f = fixture(subtest, outcome);
      const response = await f.handler(event());
      assert.equal(response.statusCode, 503);
      const body = JSON.parse(response.body);
      assert.equal(body.success, undefined);
      assert.equal(body.reference, undefined);
      assert.ok(!response.body.includes('private database details'));
      assert.ok(!response.body.includes('secret'));
    });
  }
});
