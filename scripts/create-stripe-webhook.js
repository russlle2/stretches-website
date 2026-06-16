require('dotenv').config({ path: '.env' });
const Stripe = require('stripe');

async function main() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const endpoint = await stripe.webhookEndpoints.create({
    url: 'https://gmfstretch-test.netlify.app/.netlify/functions/stripe-webhook',
    enabled_events: ['checkout.session.completed'],
    description: 'GMF Stretch merch orders',
  });
  console.log('WEBHOOK_SECRET=' + endpoint.secret);
}

main().catch((e) => console.error(e.message));
