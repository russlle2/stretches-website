#!/usr/bin/env node
/**
 * Copies the freshly-generated stripe-price-map.json into the Netlify
 * Functions _shared directory so the bundled Lambda always has the latest map.
 */
const fs   = require('fs');
const path = require('path');

const src  = path.join(__dirname, 'stripe-price-map.json');
const dest = path.join(__dirname, '..', 'netlify', 'functions', '_shared', 'stripe-price-map.json');

if (!fs.existsSync(src)) {
  console.error('[refresh-price-map] stripe-price-map.json not found at', src);
  console.error('Run stripe-sync-products.js first.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('[refresh-price-map] Copied price map to', dest);
