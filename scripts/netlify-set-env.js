#!/usr/bin/env node
require('dotenv').config({ path: '.env' });

const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = '3dc1a9b2-b054-4801-a9c1-6b9ab6a5e35a';
const siteUrl = 'https://gmfproductions-test.netlify.app';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function setEnv(key, value) {
  const payload = {
    key,
    scopes: ['production', 'deploy-preview', 'branch-deploy'],
    values: [{ value, context: 'all' }],
  };
  try {
    await api('POST', `/sites/${siteId}/env`, payload);
  } catch (e) {
    if (String(e.message).includes('422')) {
      await api('PUT', `/sites/${siteId}/env/${encodeURIComponent(key)}`, payload);
    } else throw e;
  }
  console.log('set', key);
}

async function main() {
  const vars = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PRICE_MAP: process.env.STRIPE_PRICE_MAP,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    BOOKING_EMAIL: process.env.BOOKING_EMAIL || 'booking@gmfproductions.com',
    SITE_URL: siteUrl,
    NODE_VERSION: '20',
  };

  for (const [k, v] of Object.entries(vars)) {
    if (v) await setEnv(k, v);
  }

  const build = await api('POST', `/sites/${siteId}/builds`, { clear_cache: true });
  console.log('Build triggered:', build.id, siteUrl);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
