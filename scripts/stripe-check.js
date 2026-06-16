require('dotenv').config({ path: '.env' });
const Stripe = require('stripe');

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('No STRIPE_SECRET_KEY');
    return;
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  // Publishable key isn't returned by API; derive account id for dashboard link
  const account = await stripe.accounts.retrieve();
  console.log('account', account.id);
}

main().catch((e) => console.error(e.message));
