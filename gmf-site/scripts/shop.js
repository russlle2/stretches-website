// shop.js — handles rendering the product catalog on the shop page
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('product-grid');
  if (!grid || !window.PRODUCTS) return;
  const products = Object.values(window.PRODUCTS);
  products.forEach(prod => {
    const card = document.createElement('div');
    card.className = 'product-card';
    const link = document.createElement('a');
    // Link to static product page rather than dynamic slug page
    link.href = `${prod.slug}.html`;

    // image
    const img = document.createElement('img');
    img.src = prod.images[0];
    img.alt = prod.name;
    link.appendChild(img);

    card.appendChild(link);

    const info = document.createElement('div');
    info.className = 'info';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = prod.name;
    info.appendChild(title);
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = `$${prod.priceRange.min.toFixed(2)}`;
    info.appendChild(price);
    // sold-out badge if all variants sold out
    const allSoldOut = prod.variants.every(v => v.inventoryStatus === 'sold_out');
    if (allSoldOut) {
      const badge = document.createElement('span');
      badge.className = 'badge sold-out';
      badge.textContent = 'Sold Out';
      info.insertBefore(badge, title);
    }
    card.appendChild(info);
    grid.appendChild(card);
  });
});