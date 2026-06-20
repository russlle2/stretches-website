// shop.js — render the GMF Productions catalog with category filters
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('product-grid');
  const filterBar = document.getElementById('category-filters');
  if (!grid || !window.PRODUCTS) return;

  const products = Object.values(window.PRODUCTS);
  const CATS = [
    { id: 'all', label: 'All' },
    { id: 'tees', label: 'Tees · $25' },
    { id: 'shorts', label: 'Shorts · $35' },
    { id: 'hats', label: 'Hats · $19.99' },
  ];

  let activeCat = 'all';

  function render() {
    grid.innerHTML = '';
    const list = activeCat === 'all'
      ? products
      : products.filter((p) => p.category === activeCat);
    list.forEach((prod) => {
      const card = document.createElement('div');
      card.className = 'product-card';
      const link = document.createElement('a');
      link.href = `product.html?slug=${encodeURIComponent(prod.slug)}`;

      const img = document.createElement('img');
      img.src = prod.images[0];
      img.alt = prod.name;
      img.loading = 'lazy';
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

      const allSoldOut = prod.variants.every((v) => v.inventoryStatus === 'sold_out');
      if (allSoldOut) {
        const badge = document.createElement('span');
        badge.className = 'badge sold-out';
        badge.textContent = 'Sold Out';
        info.insertBefore(badge, title);
      }
      card.appendChild(info);
      grid.appendChild(card);
    });
    if (!list.length) {
      grid.innerHTML = '<p>No products in this category yet.</p>';
    }
  }

  if (filterBar) {
    CATS.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.dataset.cat = c.id;
      btn.textContent = c.label;
      if (c.id === 'all') btn.classList.add('active');
      btn.addEventListener('click', () => {
        activeCat = c.id;
        filterBar.querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b.dataset.cat === activeCat));
        render();
      });
      filterBar.appendChild(btn);
    });
  }

  render();
});
