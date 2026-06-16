const { getSupabase, json } = require('./_shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return json(503, { error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }

  try {
    const { email } = JSON.parse(event.body || '{}');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: 'Valid email required' });
    }

    const { error } = await supabase
      .from('newsletter_subscribers')
      .upsert({ email, source: 'website' }, { onConflict: 'email' });

    if (error) throw error;
    return json(200, { success: true });
  } catch (err) {
    console.error('Newsletter error:', err);
    return json(500, { error: err.message || 'Subscription failed' });
  }
};
