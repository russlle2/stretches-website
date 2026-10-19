const { requireAdmin, failure } = require('./_shared/admin');
const { json } = require('./_shared/supabase');
function allowedPath(value) {
  return typeof value === 'string' && !value.split('/').some(x => x === '..' || x === '.' || !x) &&
    (/^gmf-site\/content\/.+\.json$/.test(value) || /^gmf-site\/assets\/uploads\/[\w./ -]+\.(png|jpg|jpeg|webp|gif|mp3|wav|pdf)$/i.test(value));
}
async function github(path, options = {}) {
  if (!process.env.GITHUB_TOKEN) throw Object.assign(new Error('Publishing is not configured.'), { status: 503 });
  const repo = process.env.GITHUB_REPO || 'russlle2/stretches-website';
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || 'Publishing failed'), { status: response.status });
  return data;
}
exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  try {
    await requireAdmin(event);
    const filePath = event.queryStringParameters?.path;
    if (!allowedPath(filePath) && !(event.httpMethod === 'GET' && filePath === 'gmf-site/content/pages/posts')) return json(403, { message: 'This path cannot be edited.' });
    const encoded = filePath.split('/').map(encodeURIComponent).join('/');
    const branch = process.env.GITHUB_BRANCH || 'master';
    if (event.httpMethod === 'GET') return json(200, await github(`/contents/${encoded}?ref=${encodeURIComponent(branch)}`));
    if (!['PUT', 'DELETE'].includes(event.httpMethod)) return json(405, { message: 'Method not allowed' });
    const body = JSON.parse(event.body || '{}');
    let current = null;
    try { current = await github(`/contents/${encoded}?ref=${encodeURIComponent(branch)}`); } catch (err) { if (err.status !== 404) throw err; }
    if ((current?.sha || null) !== (body.sha || null)) return json(409, { message: 'Another update was saved. Reload the latest version and merge your changes before saving.' });
    if (event.httpMethod === 'DELETE' && !current) return json(404, { message: 'File not found.' });
    if (event.httpMethod === 'PUT') {
      if (typeof body.content !== 'string' || body.content.length > 12000000) return json(400, { message: 'Invalid file content.' });
      if (filePath.endsWith('.json')) JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    }
    const payload = { message: String(body.message || `Update ${filePath}`).slice(0, 200), branch, ...(current ? { sha: current.sha } : {}), ...(event.httpMethod === 'PUT' ? { content: body.content } : {}) };
    return json(200, await github(`/contents/${encoded}`, { method: event.httpMethod, body: JSON.stringify(payload) }));
  } catch (err) {
    if ([409, 422].includes(err.status)) return json(409, { message: 'Another update was saved. Reload the latest version and merge your changes before saving.' });
    if (err instanceof SyntaxError) return json(400, { message: 'Invalid JSON content.' });
    return failure(err);
  }
};
exports.allowedPath = allowedPath;
