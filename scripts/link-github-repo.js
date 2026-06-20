require('dotenv').config({ path: '.env' });

const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = '3dc1a9b2-b054-4801-a9c1-6b9ab6a5e35a';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  const sites = await api('GET', '/sites?per_page=100');
  const installationId = sites.find((s) => s.build_settings?.installation_id)?.build_settings?.installation_id;
  console.log('installation_id:', installationId);

  const payload = {
    repo: {
      provider: 'github',
      repo: 'stretches-website',
      owner: 'russlle2',
      branch: 'master',
      cmd: 'npm run build',
      dir: 'gmf-site',
      functions_dir: 'netlify/functions',
      installation_id: installationId,
    },
  };

  // Try linking repo on existing site
  let result;
  try {
    result = await api('PUT', `/sites/${siteId}`, payload);
    console.log('updateSite repo:', result.build_settings?.repo_url);
  } catch (e) {
    console.log('updateSite failed:', e.message);
    // Create new site in team
    result = await api('POST', '/accounts/christopherlake96/sites', {
      name: 'gmf-stretch',
      ...payload,
    });
    console.log('Created new site:', result.name, result.ssl_url || result.url);
    console.log('Site ID:', result.id);
    console.log('Repo:', result.build_settings?.repo_url);
  }

  if (result.build_settings?.repo_url) {
    const build = await api('POST', `/sites/${result.id}/builds`, { clear_cache: true });
    console.log('Build:', build.id);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
