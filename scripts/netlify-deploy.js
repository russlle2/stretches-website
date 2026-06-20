#!/usr/bin/env node
require('dotenv').config({ path: '.env' });

const token = process.env.NETLIFY_AUTH_TOKEN;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function setSiteEnv(siteId, key, value) {
  try {
    await api('POST', `/sites/${siteId}/env`, {
      key, scopes: ['production', 'deploy-preview'],
      values: [{ value, context: 'all' }],
    });
  } catch (e) {
    await api('PUT', `/sites/${siteId}/env/${key}`, {
      key, scopes: ['production', 'deploy-preview'],
      values: [{ value, context: 'all' }],
    });
  }
  console.log('  env', key);
}

async function main() {
  const siteName = 'gmfproductions-test';
  const sites = await api('GET', '/sites');
  let site = sites.find((s) => s.name === siteName);

  if (!site) {
    console.log('Creating site', siteName);
    site = await api('POST', '/sites', { name: siteName });
  }

  const siteId = site.id;
  let siteUrl = site.ssl_url || site.url;
  console.log('Site:', siteId, siteUrl);

  // Link GitHub repo
  try {
    await api('PUT', `/sites/${siteId}`, {
      build_settings: {
        provider: 'github',
        repo_url: 'https://github.com/russlle2/stretches-website',
        repo_branch: 'master',
        cmd: 'npm run build',
        dir: 'gmf-site',
        functions_dir: 'netlify/functions',
        installation_id: 108525504,
      },
    });
    console.log('Linked GitHub repo');
  } catch (e) {
    console.warn('Repo link:', e.message);
  }

  const envKeys = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PRICE_MAP: process.env.STRIPE_PRICE_MAP,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    BOOKING_EMAIL: process.env.BOOKING_EMAIL || 'booking@gmfproductions.com',
    SITE_URL: siteUrl,
    NODE_VERSION: '20',
  };

  console.log('Setting env...');
  for (const [k, v] of Object.entries(envKeys)) {
    if (v) await setSiteEnv(siteId, k, v);
  }

  console.log('Building...');
  const build = await api('POST', `/sites/${siteId}/builds`, { clear_cache: true });
  console.log('Build ID:', build.id);
  console.log('URL:', siteUrl);
}

main().catch((e) => { console.error(e); process.exit(1); });
