const Stripe = require('stripe');
const { json } = require('./_shared/supabase');

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

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

    const priceMap = JSON.parse(process.env.STRIPE_PRICE_MAP || '{}');
    const siteUrl = process.env.SITE_URL || process.env.URL || 'http://localhost:8888';

    const lineItems = items.map((item) => {
      const priceId = priceMap[item.slug] || item.stripePriceId;
      if (priceId) {
        return { price: priceId, quantity: item.quantity || 1 };
      }
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            images: item.image ? [item.image] : [],
            metadata: { slug: item.slug || '' },
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
      metadata: {
        source: 'gmf-stretch-website',
      },
    });

    return json(200, { url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return json(500, { error: err.message || 'Checkout failed' });
  }
};
