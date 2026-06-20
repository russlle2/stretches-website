const Stripe = require('stripe');
const path = require('path');
const fs = require('fs');
const { json } = require('./_shared/supabase');

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Load the SKU -> Stripe price ID map bundled with the function. Falls back to
// the STRIPE_PRICE_MAP env var if the file is missing for any reason.
function loadPriceMap() {
  const candidates = [
    path.join(__dirname, '_shared', 'stripe-price-map.json'),
    path.join(__dirname, '..', '..', 'scripts', 'stripe-price-map.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (_e) { /* keep trying */ }
  }
  try {
    return JSON.parse(process.env.STRIPE_PRICE_MAP || '{}');
  } catch (_e) {
    return {};
  }
}
const PRICE_MAP = loadPriceMap();

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!stripe) {
    return json(503, { error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to Netlify env vars.' });
  }

  try {
    const { items, customerEmail } = JSON.parse(event.body || '{}');
    if (!Array.isArray(items) || !items.length) {
      return json(400, { error: 'Cart is empty' });
    }

    const priceMap = PRICE_MAP;
    const siteUrl = process.env.SITE_URL || process.env.URL || 'http://localhost:8888';

    // Each variant SKU looks like GMF-TEE-TIMEISMONEY-S; the price map is keyed
    // by the size-stripped base SKU, since pricing is identical across sizes.
    function baseSku(sku) {
      if (!sku) return '';
      // strip trailing -<size> where size is OS or letters/digits
      return sku.replace(/-(?:OS|XS|S|M|L|XL|2XL|3XL|4XL)$/i, '');
    }

    const lineItems = items.map((item) => {
      const lookupKey = baseSku(item.sku) || item.slug;
      const priceId = priceMap[lookupKey] || item.stripePriceId;
      if (priceId) {
        return { price: priceId, quantity: item.quantity || 1 };
      }
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            images: item.image ? [item.image] : [],
            metadata: { slug: item.slug || '', sku: item.sku || '' },
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity || 1,
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${siteUrl}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cart.html`,
      customer_email: customerEmail || undefined,
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: 'Standard shipping (3-7 business days)',
            type: 'fixed_amount',
            fixed_amount: { amount: 599, currency: 'usd' },
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            },
          },
        },
        {
          shipping_rate_data: {
            display_name: 'Priority (1-3 business days)',
            type: 'fixed_amount',
            fixed_amount: { amount: 1499, currency: 'usd' },
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 1 },
              maximum: { unit: 'business_day', value: 3 },
            },
          },
        },
      ],
      automatic_tax: { enabled: false },
      allow_promotion_codes: true,
      metadata: {
        source: 'gmf-stretch-website',
        skus: items.map((i) => i.sku || i.slug || '').join(','),
      },
    });

    return json(200, { url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return json(500, { error: err.message || 'Checkout failed' });
  }
};
