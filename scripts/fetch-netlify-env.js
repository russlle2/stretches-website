const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = '9ca9b578-e26f-4a32-84f3-73ab6b6e9320';

async function main() {
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/env`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const envs = await res.json();
  const get = (key) => envs.find((e) => e.key === key)?.values?.[0]?.value || '';

  const out = {
    NETLIFY_AUTH_TOKEN: token,
    SUPABASE_URL: get('NEXT_PUBLIC_SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: get('SUPABASE_SERVICE_ROLE_KEY'),
    STRIPE_SECRET_KEY: get('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: get('STRIPE_WEBHOOK_SECRET'),
    BOOKING_EMAIL: 'booking@gmfproductions.com',
    YOUTUBE_CHANNEL_HANDLE: 'GMF_Str3tch',
  };

  console.log(JSON.stringify({
    hasSupabase: Boolean(out.SUPABASE_URL && out.SUPABASE_SERVICE_ROLE_KEY),
    stripePrefix: out.STRIPE_SECRET_KEY?.slice(0, 8),
    hasWebhook: Boolean(out.STRIPE_WEBHOOK_SECRET),
  }));

  const fs = require('fs');
  const lines = Object.entries(out)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync('.env', lines + '\n');
}

main().catch(console.error);
