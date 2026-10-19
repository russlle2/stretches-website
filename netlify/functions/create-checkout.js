const Stripe = require('stripe');
const { json } = require('./_shared/supabase');
const { validateCart, lineItems } = require('./_shared/checkout-catalog');
let verifiedAccount;
exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_ACCOUNT_ID) return json(503, { error: 'Checkout is temporarily unavailable.' });
  let body, cart;
  try {
    body = JSON.parse(event.body || '{}');
    cart = validateCart(body.items, require('./_shared/catalog.json'));
    if (body.customerEmail && (typeof body.customerEmail !== 'string' || body.customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customerEmail))) throw new Error('Enter a valid email address.');
  } catch (err) { return json(400, { error: err instanceof SyntaxError ? 'Invalid checkout request.' : err.message }); }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    if (!verifiedAccount) {
      const account = await stripe.accounts.retrieve();
      if (account.id !== process.env.STRIPE_ACCOUNT_ID || !account.charges_enabled) return json(503, { error: 'Checkout is temporarily unavailable.' });
      verifiedAccount = account.id;
    }
    const siteUrl = (process.env.SITE_URL || 'https://gmfproductions904.com').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', line_items: lineItems(cart, siteUrl),
      success_url: `${siteUrl}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cart.html`, customer_email: body.customerEmail || undefined,
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [
        { shipping_rate_data: { display_name: 'Standard shipping (3–7 business days)', type: 'fixed_amount', fixed_amount: { amount: 599, currency: 'usd' } } },
        { shipping_rate_data: { display_name: 'Priority shipping (1–3 business days)', type: 'fixed_amount', fixed_amount: { amount: 1499, currency: 'usd' } } },
      ],
      allow_promotion_codes: true,
      metadata: { source: 'gmf-productions-website', catalog_version: '2', stripe_account_id: verifiedAccount },
      payment_intent_data: { metadata: { source: 'gmf-productions-website', stripe_account_id: verifiedAccount } },
    });
    return json(200, { url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err.type || 'service_error', err.code || 'unknown');
    return json(503, { error: 'Checkout could not start. Please try again shortly.' });
  }
};
