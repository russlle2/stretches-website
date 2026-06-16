// api.js — client helpers for Netlify Functions
window.GMF_API = {
  base: '/.netlify/functions',

  async post(endpoint, data) {
    const res = await fetch(`${this.base}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  },

  async subscribeNewsletter(email) {
    return this.post('newsletter', { email });
  },

  async submitContact(payload) {
    return this.post('contact', payload);
  },

  async submitBooking(payload) {
    return this.post('booking', payload);
  },

  async createCheckout(items, customerEmail) {
    return this.post('create-checkout', { items, customerEmail });
  },

  async fetchMedia() {
    const res = await fetch(`${this.base}/youtube-feed`);
    if (!res.ok) throw new Error('Failed to load media');
    return res.json();
  },
};
