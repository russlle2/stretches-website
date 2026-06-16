// Generic script for static product pages
// Relies on a global window.PRODUCT_DATA object defined in the page
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('product-detail');
  if (!container || !window.PRODUCT_DATA) return;
  const product = window.PRODUCT_DATA;
  // Setup initial selection
  let selectedColor = product.variants[0].color;
  let selectedSize = product.variants[0].size;
  function getVariant() {
    return product.variants.find(v => v.color === selectedColor && v.size === selectedSize);
  }
  function updatePrice() {
    const priceEl = document.getElementById('product-price');
    if (!priceEl) return;
    const variant = getVariant();
    priceEl.textContent = `$${variant.price.toFixed(2)}`;
    const addBtn = document.getElementById('add-to-cart-btn');
    if (variant.inventoryStatus === 'sold_out') {
      addBtn.textContent = 'Sold Out';
      addBtn.disabled = true;
      addBtn.classList.add('disabled-button');
    } else {
      addBtn.textContent = 'Add to Cart';
      addBtn.disabled = false;
      addBtn.classList.remove('disabled-button');
    }
  }
  function renderOptions() {
    // Colors
    const colorContainer = document.getElementById('color-options');
    const colors = [...new Set(product.variants.map(v => v.color))];
    colorContainer.innerHTML = '';
    colors.forEach(color => {
      const btn = document.createElement('button');
      btn.className = 'variant-option';
      btn.textContent = color;
      btn.dataset.value = color;
      if (color === selectedColor) btn.classList.add('selected');
      btn.addEventListener('click', () => {
        selectedColor = color;
        colorContainer.querySelectorAll('.variant-option').forEach(b => b.classList.toggle('selected', b.dataset.value === color));
        updatePrice();
      });
      colorContainer.appendChild(btn);
    });
    // Sizes
    const sizeContainer = document.getElementById('size-options');
    const sizes = [...new Set(product.variants.map(v => v.size))];
    sizeContainer.innerHTML = '';
    sizes.forEach(size => {
      const btn = document.createElement('button');
      btn.className = 'variant-option';
      btn.textContent = size;
      btn.dataset.value = size;
      if (size === selectedSize) btn.classList.add('selected');
      btn.addEventListener('click', () => {
        selectedSize = size;
        sizeContainer.querySelectorAll('.variant-option').forEach(b => b.classList.toggle('selected', b.dataset.value === size));
        updatePrice();
      });
      sizeContainer.appendChild(btn);
    });
  }
  // Initialize price and buttons
  updatePrice();
  renderOptions();
  // Add to cart functionality
  const addBtn = document.getElementById('add-to-cart-btn');
  addBtn.addEventListener('click', () => {
    const variant = getVariant();
    if (!variant || variant.inventoryStatus === 'sold_out') return;
    const cart = JSON.parse(localStorage.getItem('gmf_cart') || '[]');
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
    addBtn.textContent = 'Added';
    setTimeout(() => updatePrice(), 1500);
  });
});