// product.js — handles rendering individual product page and variant/cart interactions
document.addEventListener('DOMContentLoaded', () => {
  const detailContainer = document.getElementById('product-detail');
  if (!detailContainer || !window.PRODUCTS) return;
  // Parse slug from URL; fallback for file:// where window.location.search may be empty
  let slug = null;
  try {
    const queryString = window.location.search && window.location.search.length > 1
      ? window.location.search.substring(1)
      : (window.location.href.split('?')[1] || '');
    const params = new URLSearchParams(queryString);
    slug = params.get('slug');
  } catch (e) {
    // ignore parse errors and leave slug as null
  }
  let productSlug = slug;
  // If slug missing or does not match, fallback to first available product key
  if (!productSlug || !window.PRODUCTS[productSlug]) {
    const keys = Object.keys(window.PRODUCTS);
    if (keys.length > 0) {
      productSlug = keys[0];
    } else {
      detailContainer.innerHTML = '<p>Product not found.</p>';
      return;
    }
  }
  const product = window.PRODUCTS[productSlug];

  // Render product detail
  function renderProduct() {
    // Determine unique colors and sizes
    const colors = [...new Set(product.variants.map(v => v.color))];
    const sizes = [...new Set(product.variants.map(v => v.size))];
    // Selected variant state
    let selectedColor = colors[0];
    let selectedSize = sizes[0];
    // Find variant based on current selection
    function getSelectedVariant() {
      return product.variants.find(v => v.color === selectedColor && v.size === selectedSize);
    }
    function updatePriceAndButton() {
      const variant = getSelectedVariant();
      if (!variant) return;
      const priceEl = detailContainer.querySelector('#product-price');
      if (priceEl) priceEl.textContent = `$${variant.price.toFixed(2)}`;
      const addBtn = detailContainer.querySelector('#add-to-cart-btn');
      if (variant.inventoryStatus === 'sold_out') {
        addBtn.textContent = 'Sold Out';
        addBtn.classList.add('disabled-button');
        addBtn.disabled = true;
      } else {
        addBtn.textContent = 'Add to Cart';
        addBtn.classList.remove('disabled-button');
        addBtn.disabled = false;
      }
    }
    function renderVariantOptions() {
      // Color options
      const colorContainer = detailContainer.querySelector('#color-options');
      colors.forEach(color => {
        const btn = document.createElement('button');
        btn.className = 'variant-option';
        btn.textContent = color;
        btn.dataset.value = color;
        if (color === selectedColor) btn.classList.add('selected');
        btn.addEventListener('click', () => {
          selectedColor = color;
          // update selected class
          colorContainer.querySelectorAll('.variant-option').forEach(b => b.classList.toggle('selected', b.dataset.value === color));
          updatePriceAndButton();
        });
        colorContainer.appendChild(btn);
      });
      // Size options
      const sizeContainer = detailContainer.querySelector('#size-options');
      sizes.forEach(size => {
        const btn = document.createElement('button');
        btn.className = 'variant-option';
        btn.textContent = size;
        btn.dataset.value = size;
        if (size === selectedSize) btn.classList.add('selected');
        btn.addEventListener('click', () => {
          selectedSize = size;
          sizeContainer.querySelectorAll('.variant-option').forEach(b => b.classList.toggle('selected', b.dataset.value === size));
          updatePriceAndButton();
        });
        sizeContainer.appendChild(btn);
      });
    }
    // Build HTML structure
    detailContainer.innerHTML = `
      <div class="product-images">
        ${product.images.map(img => `<img src="${img}" alt="${product.name} image">`).join('')}
      </div>
      <div class="product-info">
        <h1>${product.name}</h1>
        <span id="product-price">$${product.priceRange.min.toFixed(2)}</span>
        <p>${product.description}</p>
        <div class="variant-selectors">
          <div class="variant-group">
            <strong>Color:</strong>
            <div id="color-options" class="variant-group"></div>
          </div>
          <div class="variant-group">
            <strong>Size:</strong>
            <div id="size-options" class="variant-group"></div>
          </div>
        </div>
        <button id="add-to-cart-btn" class="btn btn-primary" style="width:max-content; margin-top: var(--space-4);">Add to Cart</button>
        <ul style="list-style:none; padding:0; margin-top: var(--space-5);">
          ${product.trustBadges.map(b => `<li>• ${b}</li>`).join('')}
        </ul>
        <h3>Details</h3>
        <p><strong>Material:</strong> ${product.material}</p>
        <p><strong>Fit:</strong> ${product.fit}</p>
        <p><strong>GSM:</strong> ${product.gsm}</p>
        <p><strong>Care:</strong></p>
        <ul>
          ${product.care.map(c => `<li>${c}</li>`).join('')}
        </ul>
        <p><strong>Fit Note:</strong> ${product.sizeGuide.fitNote} <a href="size-guide.html">View Size Guide</a></p>
      </div>
    `;

    // DEBUG: apply background color to verify script runs; remove for production
    detailContainer.style.backgroundColor = '#550';
    renderVariantOptions();
    updatePriceAndButton();
    // Add to cart handler
    const addBtn = detailContainer.querySelector('#add-to-cart-btn');
    addBtn.addEventListener('click', () => {
      const variant = getSelectedVariant();
      if (!variant || variant.inventoryStatus === 'sold_out') return;
      const cart = JSON.parse(localStorage.getItem('gmf_cart') || '[]');
      // check if item already exists (by sku)
      const existing = cart.find(item => item.sku === variant.sku);
      if (existing) {
        existing.quantity += 1;
      } else {
        cart.push({
          slug: product.slug,
          sku: variant.sku,
          name: product.name,
          color: variant.color,
          size: variant.size,
          price: variant.price,
          image: variant.featuredImage,
          quantity: 1
        });
      }
      localStorage.setItem('gmf_cart', JSON.stringify(cart));
      // Provide feedback to user
      addBtn.textContent = 'Added';
      setTimeout(() => {
        updatePriceAndButton();
      }, 1500);
    });
  }
  renderProduct();
  // Render related products (simple: other products not this slug)
  const relatedGrid = document.getElementById('related-grid');
  if (relatedGrid) {
    const allProducts = Object.values(window.PRODUCTS);
    const related = allProducts.filter(p => p.slug !== product.slug);
    // If there are no other products, skip; else display up to 3
    related.slice(0, 3).forEach(prod => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <a href="product.html?slug=${prod.slug}" style="text-decoration:none; color:inherit;">
          <img src="${prod.images[0]}" alt="${prod.name}" />
          <div class="info">
            <span class="title">${prod.name}</span>
            <span class="price">$${prod.priceRange.min.toFixed(2)}</span>
          </div>
        </a>
      `;
      relatedGrid.appendChild(card);
    });
  }
});