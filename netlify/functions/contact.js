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
    return json(503, { error: 'Supabase is not configured.' });
  }

  try {
    const { name, email, subject, message } = JSON.parse(event.body || '{}');
    if (!name || !email || !message) {
      return json(400, { error: 'Name, email, and message are required' });
    }

    const { error } = await supabase.from('contact_messages').insert({
      name,
      email,
      subject: subject || null,
      message,
    });

    if (error) throw error;
    return json(200, { success: true });
  } catch (err) {
    console.error('Contact error:', err);
    return json(500, { error: err.message || 'Submission failed' });
  }
};
