require('dotenv').config({ path: '.env' });
const { execSync } = require('child_process');
const fs = require('fs');

const newSiteId = '87306276-74e8-4e66-a18d-ebe43eeefee2';
const siteUrl = 'https://gmf-productions-site2.netlify.app';

const deployEnv = `STRIPE_SECRET_KEY=${process.env.STRIPE_SECRET_KEY}
STRIPE_PRICE_MAP=${process.env.STRIPE_PRICE_MAP}
STRIPE_WEBHOOK_SECRET=${process.env.STRIPE_WEBHOOK_SECRET}
SUPABASE_URL=https://psxmvaushwsboogfnyqi.supabase.co
SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY}
BOOKING_EMAIL=booking@gmfproductions.com
SITE_URL=${siteUrl}
NODE_VERSION=20
`;

fs.writeFileSync('.env.netlify', deployEnv);
const env = { ...process.env, NETLIFY_AUTH_TOKEN: process.env.NETLIFY_AUTH_TOKEN };

execSync('npx netlify env:import .env.netlify -r', { stdio: 'inherit', env });
fs.unlinkSync('.env.netlify');

// Update SITE_URL in env for webhook - may need new webhook for new URL later
console.log('Env imported to gmf-productions-site2');
console.log('Site URL:', siteUrl);
console.log('Admin: https://app.netlify.com/projects/gmf-productions-site2');
