// stretch-cart.js — cart modal + Stripe checkout for homepage merch section
let cart = [];

const cartCountEl = () => document.getElementById('cart-count');
const cartModal = () => document.getElementById('cart-modal');
const cartItemsEl = () => document.getElementById('cart-items');
const cartTotalEl = () => document.getElementById('cart-total');

function addToCart(name, price, slug, image) {
  cart.push({ name, price, slug: slug || name.toLowerCase().replace(/\s+/g, '-'), image, quantity: 1 });
  updateCartUI();

  const btn = event?.target;
  if (btn && btn.tagName === 'BUTTON') {
    const originalText = btn.innerText;
    btn.innerText = 'ADDED!';
    btn.classList.replace('bg-white', 'bg-brand-green');
    setTimeout(() => {
      btn.innerText = originalText;
      btn.classList.replace('bg-brand-green', 'bg-white');
    }, 1500);
  }
}

function toggleCart() {
  const modal = cartModal();
  if (!modal) return;
  modal.classList.toggle('invisible');
  modal.classList.toggle('opacity-0');
  modal.classList.toggle('visible');
  modal.classList.toggle('opacity-100');
}

function updateCartUI() {
  const countEl = cartCountEl();
  const itemsEl = cartItemsEl();
  const totalEl = cartTotalEl();
  if (!countEl || !itemsEl || !totalEl) return;

  countEl.innerText = cart.length;

  if (!cart.length) {
    itemsEl.innerHTML = '<p class="text-gray-500 text-center mt-10">Your cart is empty.</p>';
    totalEl.innerText = '$0.00';
    return;
  }

  let total = 0;
  itemsEl.innerHTML = cart.map((item, index) => {
    total += item.price;
    return `
      <div class="flex justify-between items-center bg-black/50 p-4 rounded border border-white/5">
        <div>
          <p class="font-bold">${item.name}</p>
          <p class="text-sm text-gray-400">$${item.price.toFixed(2)}</p>
        </div>
        <button onclick="removeFromCart(${index})" class="text-red-500 text-sm font-bold hover:text-red-400">REMOVE</button>
      </div>
    `;
  }).join('');

  totalEl.innerText = `$${total.toFixed(2)}`;
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartUI();
}

async function checkout() {
  if (!cart.length) {
    alert('Add some GMF Merch to your cart first.');
    return;
  }

  const config = window.SITE_CONFIG || {};
  if (!config.checkoutEnabled) {
    alert('Secure checkout is being connected. Add STRIPE_SECRET_KEY in Netlify to go live.');
    return;
  }

  const btn = document.querySelector('#cart-modal button[onclick="checkout()"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'REDIRECTING...';
  }

  try {
    const email = prompt('Enter your email for order confirmation:');
    const result = await window.GMF_API.createCheckout(cart, email || undefined);
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    throw new Error('No checkout URL returned');
  } catch (err) {
    alert(err.message || 'Checkout failed. Please try again.');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'CHECKOUT SECURELY';
    }
  }
}

window.addToCart = addToCart;
window.toggleCart = toggleCart;
window.removeFromCart = removeFromCart;
window.checkout = checkout;

document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('bg-black/95');
      } else {
        navbar.classList.remove('bg-black/95');
      }
    });
  }
});
