#!/usr/bin/env node
require('dotenv').config({ path: '.env' });
const fs = require('fs');
const { execSync } = require('child_process');

const siteUrl = 'https://gmfstretch-test.netlify.app';
const deployEnv = `# Netlify deploy env — imported once, not committed
STRIPE_SECRET_KEY=${process.env.STRIPE_SECRET_KEY}
STRIPE_PRICE_MAP=${process.env.STRIPE_PRICE_MAP}
SUPABASE_URL=${process.env.SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY}
BOOKING_EMAIL=booking@gmfstretch.com
SITE_URL=${siteUrl}
NODE_VERSION=20
`;

fs.writeFileSync('.env.netlify', deployEnv);
const env = { ...process.env, NETLIFY_AUTH_TOKEN: process.env.NETLIFY_AUTH_TOKEN };

console.log('Importing env vars to Netlify...');
execSync('npx netlify env:import .env.netlify -r', { stdio: 'inherit', env });

console.log('Production deploy...');
execSync('npx netlify deploy --prod --build', {
  stdio: 'inherit',
  env: { ...env, ...process.env, SITE_URL: siteUrl },
});

fs.unlinkSync('.env.netlify');
console.log('Done:', siteUrl);
