/**
 * cms-git.js — durable CMS write proxy.
 * Verifies a Netlify Identity JWT, then reads/writes the GitHub repo
 * using GITHUB_TOKEN. Bypasses flaky Git Gateway ("operator microservice headers missing").
 */
const REPO = process.env.GITHUB_REPO || 'russlle2/stretches-website';
const TOKEN = process.env.GITHUB_TOKEN;
const SITE_URL = process.env.SITE_URL || 'https://gmfproductions904.com';
const BRANCH = process.env.GITHUB_BRANCH || 'master';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...cors },
    body: JSON.stringify(body),
  };
}

async function requireIdentityUser(event) {
  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) {
    throw Object.assign(new Error('Sign in required'), { status: 401 });
  }
  const res = await fetch(`${SITE_URL}/.netlify/identity/user`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(text || 'Invalid or expired login — sign out and sign back in'), {
      status: 401,
    });
  }
  return res.json();
}

async function github(path, options = {}) {
  if (!TOKEN) {
    throw Object.assign(new Error('GITHUB_TOKEN is not configured on the server'), { status: 500 });
  }
  const url = `https://api.github.com/repos/${REPO}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gmf-productions-cms',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = { message: text };
  }
  if (!res.ok) {
    const msg = (data && (data.message || data.msg)) || text || `GitHub error ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return data;
}

function encodePath(filePath) {
  return String(filePath || '')
    .replace(/^\/+/, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

async function getCurrentFileSha(encodedPath) {
  try {
    const current = await github(
      `/contents/${encodedPath}?ref=${encodeURIComponent(BRANCH)}`
    );
    return current && !Array.isArray(current) ? current.sha : null;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function putFileContent(encodedPath, payload) {
  const write = () =>
    github(`/contents/${encodedPath}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

  try {
    return await write();
  } catch (err) {
    const isRevisionConflict =
      (err.status === 409 || err.status === 422) &&
      /sha|conflict|does not match/i.test(err.message || '');
    if (!isRevisionConflict) throw err;

    const refreshedSha = await getCurrentFileSha(encodedPath);
    if (refreshedSha) payload.sha = refreshedSha;
    else delete payload.sha;
    return write();
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  try {
    await requireIdentityUser(event);

    const filePath = (event.queryStringParameters && event.queryStringParameters.path) || '';
    if (!filePath) return json(400, { message: 'Missing path' });
    // Only allow writes under gmf-site/
    if (!filePath.startsWith('gmf-site/')) {
      return json(403, { message: 'Path not allowed' });
    }

    const encoded = encodePath(filePath);

    if (event.httpMethod === 'GET') {
      const data = await github(`/contents/${encoded}?ref=${encodeURIComponent(BRANCH)}`);
      return json(200, data);
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const payload = {
        message: body.message || `Update ${filePath}`,
        content: body.content,
        branch: BRANCH,
      };
      // GitHub requires the current SHA when a path already exists. Resolve it
      // here so editors never need to understand or supply repository metadata.
      const currentSha = await getCurrentFileSha(encoded);
      if (currentSha) payload.sha = currentSha;
      const data = await putFileContent(encoded, payload);
      return json(200, data);
    }

    if (event.httpMethod === 'DELETE') {
      const body = JSON.parse(event.body || '{}');
      if (!body.sha) return json(400, { message: 'Missing sha for delete' });
      const data = await github(`/contents/${encoded}`, {
        method: 'DELETE',
        body: JSON.stringify({
          message: body.message || `Delete ${filePath}`,
          sha: body.sha,
          branch: BRANCH,
        }),
      });
      return json(200, data || { ok: true });
    }

    return json(405, { message: 'Method not allowed' });
  } catch (err) {
    if (
      (err.status === 409 || err.status === 422) &&
      /sha|conflict|does not match/i.test(err.message || '')
    ) {
      return json(409, {
        message:
          'The site changed while your update was saving. Please click Save & Publish again.',
      });
    }
    return json(err.status || 500, { message: err.message || 'Server error' });
  }
};
