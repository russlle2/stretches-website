document.addEventListener('DOMContentLoaded', () => {
  const host = document.getElementById('product-detail'), C = window.GMF_CATALOG;
  if (!host || !C) return;
  const E = C.escapeHtml, params = new URLSearchParams(window.location.search);
  const product = C.products[params.get('slug')];
  if (!product) { host.innerHTML = '<p>This product is no longer available. <a href="shop.html">Browse the shop</a>.</p>'; return; }
  const initial = product.variants.find(v => v.sku === params.get('sku')) || product.variants.find(C.canBuy) || product.variants[0];
  let color = C.colorKey(initial), size = initial.size;
  host.innerHTML = `<div class="product-images"><img id="selected-product-image" alt="${E(product.name)}"><p id="preview-label"></p></div><div class="product-info"><h1>${E(product.name)}</h1><p id="product-price" aria-live="polite"></p><p>${E(product.description)}</p><h2 class="option-heading">Color / artwork</h2><div id="color-options" class="catalog-colors"></div><h2 class="option-heading">Size</h2><div id="size-options" class="catalog-sizes"></div><p id="selected-option"></p><button type="button" id="add-to-cart-btn" class="btn btn-primary">Add to Cart</button><p id="product-feedback" role="status"></p><a href="cart.html">View cart</a><h2>Details</h2>${product.material ? `<p>Material: ${E(product.material)}</p>` : ''}${product.fit ? `<p>Fit: ${E(product.fit)}</p>` : ''}${product.gsm ? `<p>Fabric weight: ${E(product.gsm)} GSM</p>` : ''}${product.care.length ? `<ul>${product.care.map(c => `<li>${E(c)}</li>`).join('')}</ul>` : ''}${product.sizeGuide.fitNote ? `<p>${E(product.sizeGuide.fitNote)}</p>` : ''}<p><a href="size-guide.html">Size guide</a></p></div>`;
  C.colors(product).forEach(option => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'color-swatch'; button.textContent = option.label; button.dataset.key = option.key;
    if (option.hex) button.style.setProperty('--swatch-color', option.hex);
    button.addEventListener('click', () => {
      color = option.key;
      if (!C.select(product, color, size)) size = product.variants.find(v => C.colorKey(v) === color).size;
      update();
    });
    host.querySelector('#color-options').appendChild(button);
  });
  [...new Set(product.variants.map(v => v.size))].forEach(value => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'variant-option'; button.textContent = value; button.dataset.size = value;
    button.addEventListener('click', () => { size = value; update(); });
    host.querySelector('#size-options').appendChild(button);
  });
  function update() {
    const variant = C.select(product, color, size);
    const visual = variant || product.variants.find(v => C.colorKey(v) === color);
    host.querySelector('#selected-product-image').src = visual.image;
    host.querySelector('#preview-label').textContent = visual.generatedPreview ? 'Generated color preview. Print placement and color may vary slightly.' : '';
    host.querySelector('#product-price').textContent = variant && variant.unitAmount ? C.money(variant.unitAmount) : 'Price unavailable';
    host.querySelector('#selected-option').textContent = `${C.colorLabel(visual)} / ${size}`;
    const add = host.querySelector('#add-to-cart-btn');
    add.disabled = !C.canBuy(variant); add.textContent = C.canBuy(variant) ? 'Add to Cart' : 'Unavailable';
    host.querySelectorAll('[data-key]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.key === color)));
    host.querySelectorAll('[data-size]').forEach(b => {
      const choice = C.select(product, color, b.dataset.size);
      b.setAttribute('aria-pressed', String(b.dataset.size === size)); b.disabled = !choice; b.classList.toggle('option-unavailable', !C.canBuy(choice));
    });
    if (variant) { const url = new URL(window.location.href); url.searchParams.set('sku', variant.sku); window.history.replaceState(null, '', url); }
  }
  host.querySelector('#add-to-cart-btn').addEventListener('click', () => {
    try { const result = C.add(localStorage, C.select(product, color, size).sku); host.querySelector('#product-feedback').textContent = ['Added to your cart.', ...result.notices].join(' '); }
    catch (error) { host.querySelector('#product-feedback').textContent = error.message; }
  });
  update();
  const related = document.getElementById('related-grid');
  if (related) related.innerHTML = Object.values(C.products).filter(p => p.slug !== product.slug).slice(0, 3).map(p => `<article class="product-card"><a href="product.html?slug=${encodeURIComponent(p.slug)}"><img loading="lazy" src="${E(p.images[0])}" alt="${E(p.name)}"><div class="info"><h3>${E(p.name)}</h3><p>${p.priceRange.min == null ? 'Unavailable' : `${p.priceRange.min !== p.priceRange.max ? 'From ' : ''}${C.money(Math.round(p.priceRange.min * 100))}`}</p></div></a></article>`).join('');
});
