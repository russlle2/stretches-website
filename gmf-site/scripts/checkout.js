// checkout.js — order summary + Stripe Checkout redirect
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('checkout-summary');
  if (!container) return;

  const cart = JSON.parse(localStorage.getItem('gmf_cart') || '[]');
  if (!cart.length) {
    container.innerHTML = '<p>Your cart is empty. <a href="shop.html">Return to shop</a>.</p>';
    return;
  }

  let subtotal = 0;
  const list = document.createElement('div');
  cart.forEach((item) => {
    subtotal += item.price * item.quantity;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.marginBottom = 'var(--space-3)';
    row.innerHTML = `<div>${item.name} (x${item.quantity})</div><div>$${(item.price * item.quantity).toFixed(2)}</div>`;
    list.appendChild(row);
  });
  container.appendChild(list);

  const totalsEl = document.createElement('div');
  totalsEl.style.marginTop = 'var(--space-4)';
  totalsEl.innerHTML = `<strong>Total: $${subtotal.toFixed(2)}</strong>`;
  container.appendChild(totalsEl);

  const config = window.SITE_CONFIG || {};
  const payBtn = document.createElement('button');
  payBtn.className = 'btn btn-primary';
  payBtn.style.marginTop = 'var(--space-5)';
  payBtn.textContent = config.checkoutEnabled ? 'Pay with Stripe' : 'Checkout (Stripe not configured)';
  payBtn.disabled = !config.checkoutEnabled;

  payBtn.addEventListener('click', async () => {
    payBtn.disabled = true;
    payBtn.textContent = 'Redirecting...';
    try {
      const email = prompt('Email for order confirmation:');
      const items = cart.map((item) => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        slug: item.slug,
        image: item.image,
      }));
      const result = await window.GMF_API.createCheckout(items, email || undefined);
      if (result.url) window.location.href = result.url;
    } catch (err) {
      alert(err.message || 'Checkout failed');
      payBtn.disabled = false;
      payBtn.textContent = 'Pay with Stripe';
    }
  });

  container.appendChild(payBtn);
});
