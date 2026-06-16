const Stripe = require('stripe');
const { getSupabase, json } = require('./_shared/supabase');

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return json(503, { error: 'Stripe webhook not configured' });
  }

  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return json(400, { error: `Webhook signature failed: ${err.message}` });
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const supabase = getSupabase();

    if (supabase) {
      await supabase.from('orders').upsert({
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent,
        customer_email: session.customer_details?.email || session.customer_email,
        amount_total: session.amount_total,
        currency: session.currency,
        line_items: session.line_items,
        status: 'paid',
      }, { onConflict: 'stripe_session_id' });
    }
  }

  return json(200, { received: true });
};
