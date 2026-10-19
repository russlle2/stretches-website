document.addEventListener('DOMContentLoaded', () => {
  const host = document.getElementById('cart-container'), empty = document.getElementById('cart-empty'), C = window.GMF_CATALOG;
  if (!host || !C) return;
  const E = C.escapeHtml, notices = [];
  function render() {
    const result = C.readCart(localStorage);
    notices.push(...result.notices);
    const cart = result.cart;
    host.style.display = 'block';
    if (empty) empty.style.display = cart.length ? 'none' : 'block';
    host.innerHTML = [...new Set(notices)].map(n => `<p class="cart-notice" role="status">${E(n)}</p>`).join('');
    if (!cart.length) return;
    const total = cart.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
    cart.forEach((item, index) => {
      const row = document.createElement('div'); row.className = 'cart-item';
      row.innerHTML = `<img src="${E(item.image)}" alt="${E(item.name)}"><div class="cart-item-info"><h2>${E(item.name)}</h2><p>${E(item.color)}${item.artworkColorway ? ` / ${E(item.artworkColorway)}` : ''} · ${E(item.size)}</p><p>${C.money(item.unitAmount)} each</p><label>Quantity <input type="number" min="1" max="20" step="1" value="${item.quantity}" aria-label="Quantity for ${E(item.name)}"></label><button type="button" class="btn btn-secondary">Remove</button></div>`;
      row.querySelector('button').addEventListener('click', () => { cart.splice(index, 1); localStorage.setItem('gmf_cart', JSON.stringify(cart)); render(); });
      row.querySelector('input').addEventListener('change', event => {
        const quantity = Number(event.target.value);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) { event.target.value = item.quantity; return; }
        item.quantity = quantity; localStorage.setItem('gmf_cart', JSON.stringify(cart)); render();
      });
      host.appendChild(row);
    });
    const summary = document.createElement('div'); summary.className = 'cart-summary';
    summary.innerHTML = `<strong>Subtotal: ${C.money(total)}</strong><a href="checkout.html" class="btn btn-primary">Proceed to Checkout</a>`;
    host.appendChild(summary);
  }
  render();
});
