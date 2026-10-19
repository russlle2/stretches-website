const { json } = require('./supabase');
async function requireAdmin(event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization || '';
  if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('Sign in required'), { status: 401 });
  const site = process.env.SITE_URL || 'https://gmfproductions904.com';
  const response = await fetch(`${site.replace(/\/$/, '')}/.netlify/identity/user`, { headers: { Authorization: authorization } });
  if (!response.ok) throw Object.assign(new Error('Your login expired. Please sign in again.'), { status: 401 });
  const user = await response.json();
  const allowed = (process.env.GMF_ADMIN_EMAILS || 'gmfstr3tch904@gmail.com,gmfproductions904@gmail.com').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!(user.app_metadata?.roles || []).includes('admin') && !allowed.includes(String(user.email || '').toLowerCase())) throw Object.assign(new Error('Administrator access required'), { status: 403 });
  return user;
}
function failure(error) {
  const status = error.status || 500;
  if (status >= 500) console.error('Admin operation failed:', error.code || error.name || 'error');
  const message = status >= 500 ? 'The service is unavailable. Please try again.' : error.message;
  return json(status, { error: message, message });
}
module.exports = { requireAdmin, failure };
