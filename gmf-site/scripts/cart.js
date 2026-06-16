// cart.js — renders cart items and handles quantity adjustments and navigation to checkout
document.addEventListener('DOMContentLoaded', () => {
  const cartContainer = document.getElementById('cart-container');
  const emptyState = document.getElementById('cart-empty');
  function renderCart() {
    const cart = JSON.parse(localStorage.getItem('gmf_cart') || '[]');
    if (!cart.length) {
      cartContainer.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }
    cartContainer.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    // Clear container
    cartContainer.innerHTML = '';
    let total = 0;
    cart.forEach((item, index) => {
      total += item.price * item.quantity;
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <img src="${item.image}" alt="${item.name}" />
        <div class="cart-item-info">
          <h4>${item.name}</h4>
          <p>Color: ${item.color} | Size: ${item.size}</p>
          <p>Price: $${item.price.toFixed(2)} x ${item.quantity}</p>
          <button class="btn btn-secondary" data-index="${index}" style="margin-top: var(--space-2);">Remove</button>
        </div>
      `;
      cartContainer.appendChild(row);
    });
    // Cart summary
    const summary = document.createElement('div');
    summary.className = 'cart-summary';
    summary.innerHTML = `
      <div>
        <strong>Total:</strong> $${total.toFixed(2)}
      </div>
      <a href="checkout.html" class="btn btn-primary">Proceed to Checkout</a>
    `;
    cartContainer.appendChild(summary);
    // Attach remove handlers
    cartContainer.querySelectorAll('button[data-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        cart.splice(idx, 1);
        localStorage.setItem('gmf_cart', JSON.stringify(cart));
        renderCart();
      });
    });
  }
  renderCart();
});