#!/usr/bin/env node
/**
 * Creates Netlify site, sets env vars, and triggers deploy for stretches-website.
 * Requires NETLIFY_AUTH_TOKEN in .env or environment.
 */
require('dotenv').config({ path: '.env' });

const token = process.env.NETLIFY_AUTH_TOKEN;
if (!token) {
  console.error('Missing NETLIFY_AUTH_TOKEN');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return data;
}

async function setEnvVar(siteId, key, value, scopes = ['production', 'deploy-preview']) {
  try {
    await api('POST', `/accounts/6974219b1ab3798c7aed8c87/env/${key}`, {
      key,
      scopes,
      values: [{ value, context: 'all' }],
    });
    console.log(`  set ${key}`);
  } catch (e) {
    if (e.message.includes('422') || e.message.includes('409')) {
      await api('PATCH', `/accounts/6974219b1ab3798c7aed8c87/env/${key}`, {
        key,
        scopes,
        values: [{ value, context: 'all' }],
      });
      console.log(`  updated ${key}`);
    } else throw e;
  }
}

async function setSiteEnv(siteId, key, value) {
  try {
    await api('POST', `/sites/${siteId}/env`, {
      key,
      scopes: ['production', 'deploy-preview'],
      values: [{ value, context: 'all' }],
    });
    console.log(`  site env ${key}`);
  } catch (e) {
    if (String(e.message).includes('422')) {
      await api('PUT', `/sites/${siteId}/env/${key}`, {
        key,
        scopes: ['production', 'deploy-preview'],
        values: [{ value, context: 'all' }],
      });
      console.log(`  updated site env ${key}`);
    } else throw e;
  }
}

async function main() {
  const siteName = 'gmf-stretch-test';
  let site;

  const sites = await api('GET', '/sites');
  site = sites.find((s) => s.name === siteName);

  if (!site) {
    console.log('Creating site...');
    site = await api('POST', '/sites', {
      name: siteName,
      repo: {
        provider: 'github',
        repo: 'stretches-website',
        owner: 'russlle2',
        branch: 'master',
        cmd: 'npm run build',
        dir: 'gmf-site',
        functions_dir: 'netlify/functions',
        installation_id: 108525504,
      },
    });
  } else {
    console.log('Site exists:', site.url);
  }

  const siteId = site.id || site.site_id;
  const siteUrl = site.ssl_url || site.url || `https://${siteName}.netlify.app`;
  console.log('Site ID:', siteId);
  console.log('Site URL:', siteUrl);

  const envKeys = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    BOOKING_EMAIL: process.env.BOOKING_EMAIL || 'booking@gmfstretch.com',
    SITE_URL: siteUrl,
    NODE_VERSION: '20',
  };

  if (process.env.STRIPE_PRICE_MAP) envKeys.STRIPE_PRICE_MAP = process.env.STRIPE_PRICE_MAP;
  if (process.env.STRIPE_WEBHOOK_SECRET) envKeys.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  console.log('Setting environment variables...');
  for (const [key, value] of Object.entries(envKeys)) {
    if (value) await setSiteEnv(siteId, key, value);
  }

  console.log('Triggering build...');
  const build = await api('POST', `/sites/${siteId}/builds`, {
    clear_cache: true,
  });
  console.log('Build triggered:', build.id || build.deploy_id);
  console.log('DONE', siteUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
