const fs = require('fs');
const path = require('path');
const theme = require('../gmf-site/scripts/theme-utils');

const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
const checkoutEnabled = Boolean(process.env.STRIPE_SECRET_KEY);

const config = {
  stripePublishableKey: publishableKey,
  checkoutEnabled,
  siteUrl: process.env.SITE_URL || '',
  bookingEmail: process.env.BOOKING_EMAIL || 'booking@gmfproductions.com',
};

const outPath = path.join(__dirname, '../gmf-site/scripts/site-config.js');
const content = `// Auto-generated at build time — do not edit manually
window.SITE_CONFIG = ${JSON.stringify(config, null, 2)};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content);
console.log('Wrote site-config.js (checkout enabled:', checkoutEnabled, ')');

const themePath = path.join(__dirname, '../gmf-site/content/theme.json');
const themeInput = fs.existsSync(themePath) ? JSON.parse(fs.readFileSync(themePath, 'utf8')) : {};
fs.writeFileSync(path.join(__dirname, '../gmf-site/styles/theme.css'), theme.css(themeInput));
console.log('Wrote theme.css');
