document.addEventListener('DOMContentLoaded', () => {
  const host = document.getElementById('checkout-summary'), C = window.GMF_CATALOG;
  if (!host || !C) return;
  const E = C.escapeHtml;
  const { cart, notices } = C.readCart(localStorage);
  host.innerHTML = notices.map(n => `<p class="cart-notice" role="status">${E(n)}</p>`).join('');
  if (!cart.length) { host.innerHTML += '<p>Your cart is empty. <a href="shop.html">Return to shop</a>.</p>'; return; }
  const subtotal = cart.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
  host.innerHTML += cart.map(item => `<div class="checkout-line"><span>${E(item.name)} — ${E(item.color)}${item.artworkColorway ? ` / ${E(item.artworkColorway)}` : ''} / ${E(item.size)} × ${item.quantity}</span><strong>${C.money(item.unitAmount * item.quantity)}</strong></div>`).join('') + `<p><strong>Subtotal: ${C.money(subtotal)}</strong></p><p>Shipping is calculated at checkout.</p>`;
  const button = document.createElement('button'); button.className = 'btn btn-primary'; button.type = 'button';
  const enabled = window.SITE_CONFIG && window.SITE_CONFIG.checkoutEnabled;
  button.textContent = enabled ? 'Pay with Stripe' : 'Checkout temporarily unavailable'; button.disabled = !enabled;
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  button.addEventListener('click', async () => {
    button.disabled = true; status.textContent = 'Opening secure checkout…';
    try {
      // Identity and quantity only: the server determines authoritative prices.
      const current = C.readCart(localStorage);
      if (current.notices.length || !current.cart.length) throw new Error('Your cart changed. Return to your cart to review the available items.');
      const result = await window.GMF_API.createCheckout(current.cart.map(item => ({ sku: item.sku, quantity: item.quantity })));
      if (!result.url) throw new Error('Checkout could not be opened. Please try again.');
      window.location.href = result.url;
    } catch (error) { status.textContent = error.message || 'Checkout failed. Please try again.'; button.disabled = !enabled; }
  });
  host.append(button, status);
});
