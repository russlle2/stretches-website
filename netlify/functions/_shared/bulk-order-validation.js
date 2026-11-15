const GARMENTS = ['T-shirt', 'Long-sleeve tee', 'Hoodie', 'Sweatshirt', 'Polo', 'Hat', 'Other'];
const SIZES = ['YS', 'YM', 'YL', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'One size'];
const DELIVERIES = ['Shipping', 'Local pickup', 'Not sure yet'];
const DECORATIONS = ['Printed', 'Embroidered', 'Not sure yet'];
const PLACEMENTS = ['Front', 'Back', 'Sleeve', 'Other'];
const ARTWORK_STATUSES = ['Artwork ready', 'Need design help', 'Will send later'];
const MAX_ITEMS = 20;
const MAX_QUANTITY = 10000;

class ValidationError extends Error {}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, label, maxLength, required = false, multiline = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new ValidationError(`${label} must be text of ${maxLength} characters or fewer.`);
  }
  const result = multiline ? value.trim() : value.trim().replace(/\s+/g, ' ');
  if (required && !result) throw new ValidationError(`${label} is required.`);
  return result;
}

function choice(value, options, label) {
  if (!options.includes(value)) throw new ValidationError(`Choose a valid ${label}.`);
  return value;
}

function validateBulkOrder(input, now = new Date()) {
  if (!object(input)) throw new ValidationError('Submit a valid order request.');
  if (input.website != null && input.website !== '') throw new ValidationError('Unable to submit this request.');

  const order = {
    name: text(input.name, 'Name', 120, true),
    email: text(input.email, 'Email', 254, true),
    phone: text(input.phone, 'Phone', 40),
    organization: text(input.organization, 'Organization', 160),
    eventDate: text(input.eventDate, 'Requested date', 10),
    delivery: choice(input.delivery, DELIVERIES, 'delivery preference'),
    location: text(input.location, 'Delivery location', 200),
    decoration: choice(input.decoration, DECORATIONS, 'decoration method'),
    artworkStatus: choice(input.artworkStatus, ARTWORK_STATUSES, 'artwork status'),
    artworkUrl: text(input.artworkUrl, 'Artwork link', 2000),
    notes: text(input.notes, 'Project notes', 5000, false, true),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) throw new ValidationError('Enter a valid email address.');

  if (order.eventDate) {
    const parsed = new Date(`${order.eventDate}T00:00:00.000Z`);
    // The earliest current date worldwide avoids rejecting a visitor's local today.
    const earliestToday = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(order.eventDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== order.eventDate || order.eventDate < earliestToday) {
      throw new ValidationError('Choose a valid requested date that has not passed.');
    }
  }

  if (order.artworkUrl) {
    let url;
    try { url = new URL(order.artworkUrl); } catch { /* validated below */ }
    if (!url || !['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new ValidationError('Use a complete http or https artwork link without a username or password.');
    }
  }

  if (!Array.isArray(input.placements) || input.placements.length < 1 || input.placements.length > PLACEMENTS.length) {
    throw new ValidationError('Choose at least one decoration placement.');
  }
  order.placements = [...new Set(input.placements.map(value => choice(value, PLACEMENTS, 'decoration placement')))];

  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > MAX_ITEMS) {
    throw new ValidationError(`Include between 1 and ${MAX_ITEMS} garment lines.`);
  }
  let totalQuantity = 0;
  order.items = input.items.map((item, index) => {
    const line = index + 1;
    if (!object(item) || !object(item.sizes)) throw new ValidationError(`Add sizes and quantities for garment ${line}.`);
    const garment = choice(item.garment, GARMENTS, `garment type on line ${line}`);
    const color = text(item.color, `Color on line ${line}`, 80, true);
    const sizes = {};
    let quantity = 0;
    for (const [size, count] of Object.entries(item.sizes)) {
      if (!SIZES.includes(size) || !Number.isInteger(count) || count < 0 || count > MAX_QUANTITY) {
        throw new ValidationError(`Use supported sizes and whole-number quantities from 0 to ${MAX_QUANTITY} on garment ${line}.`);
      }
      if (count > 0) {
        sizes[size] = count;
        quantity += count;
      }
    }
    if (quantity < 1) throw new ValidationError(`Add at least one item to garment ${line}.`);
    totalQuantity += quantity;
    if (totalQuantity > MAX_QUANTITY) throw new ValidationError(`For more than ${MAX_QUANTITY.toLocaleString('en-US')} pieces, contact us directly.`);
    return { garment, color, sizes, quantity };
  });
  order.totalQuantity = totalQuantity;
  return order;
}

function formatBulkOrder(order, reference) {
  return [
    'BULK CUSTOM APPAREL — QUOTE REQUEST',
    `Reference: ${reference}`,
    'This is a quote request, not a paid or confirmed production order.',
    '',
    `Name: ${order.name}`,
    `Email: ${order.email}`,
    `Phone: ${order.phone || 'Not provided'}`,
    `Organization: ${order.organization || 'Not provided'}`,
    '',
    `TOTAL QUANTITY: ${order.totalQuantity}`,
    ...order.items.flatMap((item, index) => [
      `${index + 1}. ${item.garment} | ${item.color} | ${item.quantity} pieces`,
      `   Sizes: ${SIZES.filter(size => item.sizes[size] > 0).map(size => `${size}: ${item.sizes[size]}`).join(', ')}`,
    ]),
    '',
    `Decoration: ${order.decoration}`,
    `Placements: ${order.placements.join(', ')}`,
    `Artwork status: ${order.artworkStatus}`,
    `Artwork link: ${order.artworkUrl || 'Not provided'}`,
    '',
    `Requested date: ${order.eventDate || 'Flexible / not specified'}`,
    `Delivery preference: ${order.delivery}`,
    `Delivery location: ${order.location || 'Not provided'}`,
    '',
    'PROJECT NOTES',
    order.notes || 'None provided',
  ].join('\n');
}

module.exports = { validateBulkOrder, formatBulkOrder, ValidationError, MAX_ITEMS, MAX_QUANTITY };
