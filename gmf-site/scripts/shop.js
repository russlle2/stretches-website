document.addEventListener('DOMContentLoaded', () => {
  const C = window.GMF_CATALOG;
  const grid = document.getElementById('product-grid');
  const filtersHost = document.getElementById('category-filters');
  if (!grid || !C) return;
  const E = C.escapeHtml, products = Object.values(C.products);
  const filters = { category: '', color: '', size: '' };
  const labels = { tees: 'Tees', shorts: 'Shorts', hats: 'Hats', hoodies: 'Hoodies', crewnecks: 'Crewnecks' };
  const categories = [...new Set(products.map(p => p.category))];
  const colors = [...new Map(products.flatMap(p => p.variants.map(v => [v.colorCode, v.color]))).entries()];
  const sizes = [...new Set(products.flatMap(p => p.variants.map(v => v.size)))];
  if (filtersHost) {
    filtersHost.innerHTML = `<label>Category<select data-filter="category"><option value="">All products</option>${categories.map(c => `<option value="${E(c)}">${E(labels[c] || c)}</option>`).join('')}</select></label><label>Garment color<select data-filter="color"><option value="">All colors</option>${colors.map(([code, label]) => `<option value="${E(code)}">${E(label)}</option>`).join('')}</select></label><label>Size<select data-filter="size"><option value="">All sizes</option>${sizes.map(s => `<option>${E(s)}</option>`).join('')}</select></label>`;
    filtersHost.querySelectorAll('select').forEach(el => el.addEventListener('change', () => { filters[el.dataset.filter] = el.value; render(); }));
  }
  function card(product) {
    const el = document.createElement('article');
    el.className = 'product-card';
    const initial = product.variants.find(v => C.canBuy(v) && (!filters.color || v.colorCode === filters.color) && (!filters.size || v.size === filters.size)) || product.variants[0];
    let selectedColor = C.colorKey(initial), selectedSize = initial.size;
    el.innerHTML = `<a class="product-image-link"><img loading="lazy" alt="${E(product.name)}"></a><div class="info"><h2 class="title">${E(product.name)}</h2><p class="price" aria-live="polite"></p><p class="preview-note"></p><div class="catalog-colors" aria-label="Color for ${E(product.name)}"></div><div class="catalog-sizes" aria-label="Size for ${E(product.name)}"></div><p class="selection-label"></p><div class="catalog-actions"><button type="button" class="btn btn-primary add-item">Add to Cart</button><a class="product-details-link">View details</a></div><p class="catalog-feedback" role="status"></p></div>`;
    const colorHost = el.querySelector('.catalog-colors'), sizeHost = el.querySelector('.catalog-sizes');
    C.colors(product).forEach(color => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'color-swatch'; button.title = color.label;
      button.textContent = color.label; button.dataset.key = color.key;
      if (color.hex) button.style.setProperty('--swatch-color', color.hex);
      button.addEventListener('click', () => {
        selectedColor = color.key;
        if (!C.select(product, selectedColor, selectedSize)) selectedSize = product.variants.find(v => C.colorKey(v) === selectedColor).size;
        update();
      });
      colorHost.appendChild(button);
    });
    [...new Set(product.variants.map(v => v.size))].forEach(size => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'variant-option'; button.textContent = size; button.dataset.size = size;
      button.addEventListener('click', () => { selectedSize = size; update(); });
      sizeHost.appendChild(button);
    });
    function update() {
      const variant = C.select(product, selectedColor, selectedSize);
      const visual = variant || product.variants.find(v => C.colorKey(v) === selectedColor);
      el.querySelector('img').src = visual.image;
      el.querySelector('.price').textContent = variant && variant.unitAmount ? C.money(variant.unitAmount) : 'Price unavailable';
      el.querySelector('.preview-note').textContent = visual.generatedPreview ? 'Color preview' : '';
      el.querySelector('.selection-label').textContent = `${C.colorLabel(visual)} / ${selectedSize}${C.canBuy(variant) ? '' : ' — Unavailable'}`;
      el.querySelector('.add-item').disabled = !C.canBuy(variant);
      el.querySelectorAll('[data-key]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.key === selectedColor)));
      el.querySelectorAll('[data-size]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.size === selectedSize));
        button.disabled = !C.select(product, selectedColor, button.dataset.size);
        button.classList.toggle('option-unavailable', !C.canBuy(C.select(product, selectedColor, button.dataset.size)));
      });
      const href = `product.html?slug=${encodeURIComponent(product.slug)}${variant ? `&sku=${encodeURIComponent(variant.sku)}` : ''}`;
      el.querySelector('.product-image-link').href = href;
      el.querySelector('.product-details-link').href = href;
    }
    el.querySelector('.add-item').addEventListener('click', () => {
      try {
        const result = C.add(localStorage, C.select(product, selectedColor, selectedSize).sku);
        el.querySelector('.catalog-feedback').textContent = ['Added to your cart.', ...result.notices].join(' ');
      } catch (error) { el.querySelector('.catalog-feedback').textContent = error.message; }
    });
    update(); return el;
  }
  function render() {
    grid.replaceChildren();
    const visible = products.filter(product => C.matches(product, filters));
    visible.forEach(product => grid.appendChild(card(product)));
    if (!visible.length) grid.innerHTML = '<p>No available products match these options. Try another color or size.</p>';
  }
  render();
});
