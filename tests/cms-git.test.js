const assert = require('node:assert/strict');
const test = require('node:test');

process.env.GITHUB_TOKEN = 'test-token';
process.env.GITHUB_REPO = 'owner/repo';
process.env.SITE_URL = 'https://example.test';
process.env.GITHUB_BRANCH = 'master';

const { handler } = require('../netlify/functions/cms-git');

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('updates an existing file when the client does not supply a SHA', async (t) => {
  const originalFetch = global.fetch;
  const githubRequests = [];
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url, options = {}) => {
    if (url === 'https://example.test/.netlify/identity/user') {
      return jsonResponse(200, { email: 'editor@example.test' });
    }

    githubRequests.push({ url, options });
    if ((options.method || 'GET') === 'GET') {
      return jsonResponse(200, { path: 'gmf-site/content/design-manifest.json', sha: 'current-sha' });
    }

    const payload = JSON.parse(options.body);
    if (!payload.sha) {
      return jsonResponse(422, { message: 'Invalid request. "sha" wasn\'t supplied.' });
    }
    return jsonResponse(200, {
      content: { path: 'gmf-site/content/design-manifest.json', sha: 'new-sha' },
    });
  };

  const result = await handler({
    httpMethod: 'PUT',
    headers: { authorization: 'Bearer identity-token' },
    queryStringParameters: { path: 'gmf-site/content/design-manifest.json' },
    body: JSON.stringify({
      message: 'Update product catalog',
      content: Buffer.from('{"designs":[]}').toString('base64'),
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(githubRequests.length, 2);
  assert.equal(JSON.parse(githubRequests[1].options.body).sha, 'current-sha');
});

test('refreshes the SHA and retries once when the file changes during save', async (t) => {
  const originalFetch = global.fetch;
  let getCount = 0;
  let putCount = 0;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url, options = {}) => {
    if (url === 'https://example.test/.netlify/identity/user') {
      return jsonResponse(200, { email: 'editor@example.test' });
    }

    if ((options.method || 'GET') === 'GET') {
      getCount += 1;
      return jsonResponse(200, {
        path: 'gmf-site/content/design-manifest.json',
        sha: getCount === 1 ? 'sha-before-race' : 'sha-after-race',
      });
    }

    putCount += 1;
    const payload = JSON.parse(options.body);
    if (putCount === 1) {
      assert.equal(payload.sha, 'sha-before-race');
      return jsonResponse(409, { message: 'sha does not match the current file' });
    }
    assert.equal(payload.sha, 'sha-after-race');
    return jsonResponse(200, {
      content: { path: 'gmf-site/content/design-manifest.json', sha: 'saved-sha' },
    });
  };

  const result = await handler({
    httpMethod: 'PUT',
    headers: { authorization: 'Bearer identity-token' },
    queryStringParameters: { path: 'gmf-site/content/design-manifest.json' },
    body: JSON.stringify({
      message: 'Update product catalog',
      content: Buffer.from('{"designs":[]}').toString('base64'),
      sha: 'stale-client-sha',
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(getCount, 2);
  assert.equal(putCount, 2);
});

test('returns a plain-language message if repeated revision conflicts cannot be resolved', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url, options = {}) => {
    if (url === 'https://example.test/.netlify/identity/user') {
      return jsonResponse(200, { email: 'editor@example.test' });
    }
    if ((options.method || 'GET') === 'GET') {
      return jsonResponse(200, {
        path: 'gmf-site/content/design-manifest.json',
        sha: 'current-sha',
      });
    }
    return jsonResponse(409, { message: 'sha does not match the current file' });
  };

  const result = await handler({
    httpMethod: 'PUT',
    headers: { authorization: 'Bearer identity-token' },
    queryStringParameters: { path: 'gmf-site/content/design-manifest.json' },
    body: JSON.stringify({
      message: 'Update product catalog',
      content: Buffer.from('{"designs":[]}').toString('base64'),
    }),
  });
  const body = JSON.parse(result.body);

  assert.equal(result.statusCode, 409);
  assert.equal(
    body.message,
    'The site changed while your update was saving. Please click Save & Publish again.'
  );
  assert.doesNotMatch(body.message, /sha/i);
});
