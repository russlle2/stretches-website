// Homepage cart badge shares the shop's exact-SKU cart. Purchases start on a product page.
document.addEventListener('DOMContentLoaded', () => {
  function updateCount() {
    const badge = document.getElementById('cart-count');
    if (!badge || !window.GMF_CATALOG) return;
    try {
      const saved = JSON.parse(localStorage.getItem('gmf_cart') || '[]');
      // Read without consuming price-change/removal notices intended for the cart page.
      const result = window.GMF_CATALOG.reconcile(saved);
      badge.textContent = result.cart.reduce((count, item) => count + item.quantity, 0);
    } catch (_) { badge.textContent = '0'; }
  }
  updateCount();
  window.addEventListener('pageshow', updateCount);
  window.addEventListener('storage', event => { if (!event.key || event.key === 'gmf_cart') updateCount(); });
  const navbar = document.getElementById('navbar');
  if (navbar) window.addEventListener('scroll', () => navbar.classList.toggle('bg-black/95', window.scrollY > 50), { passive: true });
});
