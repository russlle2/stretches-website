const { randomBytes } = require('node:crypto');
const { getSupabase, json } = require('./_shared/supabase');
const { validateBulkOrder, formatBulkOrder, ValidationError } = require('./_shared/bulk-order-validation');

const MAX_BODY_BYTES = 64 * 1024;

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') {
    return { ...json(204, {}), body: '' };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

  const contentType = Object.entries(event.headers || {}).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
  if (contentType && !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json(415, { error: 'Submit this request as JSON.' });
  }
  if (typeof event.body !== 'string' || event.body.length > Math.ceil(MAX_BODY_BYTES * 4 / 3) + 4) {
    return json(413, { error: 'This request is too large. Shorten your notes and try again.' });
  }
  const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return json(413, { error: 'This request is too large. Shorten your notes and try again.' });
  }

  let order;
  try {
    order = validateBulkOrder(JSON.parse(body));
  } catch (error) {
    return json(400, { error: error instanceof ValidationError ? error.message : 'Submit a valid order request.' });
  }

  try {
    const supabase = getSupabase();
    if (!supabase) return json(503, { error: 'Order requests are temporarily unavailable. Please contact support@gmfproductions904.com.' });

    const reference = `GMF-${randomBytes(8).toString('hex').toUpperCase()}`;
    const { error } = await supabase.from('contact_messages').insert({
      visitor_name: order.name,
      visitor_email: order.email,
      visitor_phone: order.phone || null,
      slug: 'bulk-apparel-order',
      message: formatBulkOrder(order, reference),
    });
    if (error) throw error;
    return json(200, { success: true, reference, totalQuantity: order.totalQuantity });
  } catch {
    console.error('Bulk apparel request persistence failed.');
    return json(503, { error: 'We could not save your request. Please try again or contact support@gmfproductions904.com.' });
  }
};
