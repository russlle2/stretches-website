#!/usr/bin/env node
require('dotenv').config({ path: '.env' });
const fs = require('fs');
const { execSync } = require('child_process');

const siteUrl = 'https://gmfstretch-test.netlify.app';
const webhookSecret = process.argv[2] || process.env.STRIPE_WEBHOOK_SECRET;

const deployEnv = `STRIPE_SECRET_KEY=${process.env.STRIPE_SECRET_KEY}
STRIPE_PRICE_MAP=${process.env.STRIPE_PRICE_MAP}
STRIPE_WEBHOOK_SECRET=${webhookSecret}
SUPABASE_URL=https://psxmvaushwsboogfnyqi.supabase.co
SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY}
BOOKING_EMAIL=booking@gmfstretch.com
SITE_URL=${siteUrl}
NODE_VERSION=20
`;

fs.writeFileSync('.env.netlify', deployEnv);
execSync('npx netlify env:import .env.netlify -r', {
  stdio: 'inherit',
  env: { ...process.env, NETLIFY_AUTH_TOKEN: process.env.NETLIFY_AUTH_TOKEN },
});
fs.unlinkSync('.env.netlify');
console.log('Env updated. Redeploying...');
execSync('npx netlify deploy --prod --build', {
  stdio: 'inherit',
  env: { ...process.env, SITE_URL: siteUrl, STRIPE_WEBHOOK_SECRET: webhookSecret },
});
