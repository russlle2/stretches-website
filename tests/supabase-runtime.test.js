const test = require('node:test');
const assert = require('node:assert/strict');
const { getSupabase } = require('../netlify/functions/_shared/supabase');

test('the deployed runtime can initialize the real Supabase client without a WebSocket polyfill', async t => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'https://runtime-fixture.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'runtime-fixture-not-a-real-key';
  t.after(() => {
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  });
  assert.equal(typeof globalThis.WebSocket, 'function', 'Run this project on Node 22 or newer.');
  const client = getSupabase();
  assert.equal(typeof client.storage.from('gmf-originals').createSignedUploadUrl, 'function');
  assert.equal(typeof client.from('gmf_assets').select, 'function');
  // Creating the client must succeed even though this test opens no network connection.
  await client.removeAllChannels();
  await client.auth.stopAutoRefresh();
});
