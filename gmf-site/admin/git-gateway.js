/**
 * CMS Git client — uses durable Netlify Function proxy (not flaky Git Gateway).
 * Falls back to Git Gateway only if the function is unavailable.
 */
(function (global) {
  const PROXY = '/.netlify/functions/cms-git';
  const GATEWAY = '/.netlify/git/github';

  function getToken() {
    const user = global.netlifyIdentity && global.netlifyIdentity.currentUser();
    if (!user) throw new Error('Not signed in — please Sign Out and Sign In again');
    const token = user.token && user.token.access_token;
    if (!token) throw new Error('Login expired — please Sign Out and Sign In again');
    return token;
  }

  async function refreshTokenIfNeeded() {
    const user = global.netlifyIdentity && global.netlifyIdentity.currentUser();
    if (!user || typeof user.jwt !== 'function') return getToken();
    try {
      // Force refresh so expired JWTs don't hit Git Gateway weirdness
      return await user.jwt(true);
    } catch (_) {
      return getToken();
    }
  }

  async function proxyApi(method, filePath, body) {
    const token = await refreshTokenIfNeeded();
    const url = PROXY + '?path=' + encodeURIComponent(filePath);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = { message: text };
    }
    if (!res.ok) {
      throw new Error((data && (data.message || data.msg)) || text || 'CMS error ' + res.status);
    }
    return data;
  }

  async function gatewayApi(path, options = {}) {
    const token = await refreshTokenIfNeeded();
    const res = await fetch(GATEWAY + path, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github.v3+json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try {
        const j = JSON.parse(text);
        msg = j.message || j.msg || text;
      } catch (_) {}
      throw new Error(msg || 'Git Gateway error ' + res.status);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function encodePath(filePath) {
    return filePath
      .split('/')
      .map(encodeURIComponent)
      .join('/');
  }

  function friendlyError(err) {
    const msg = String(err && err.message ? err.message : err);
    if (/operator microservice/i.test(msg)) {
      return new Error(
        'Editor connection glitch. Please Sign Out, clear site cookies for gmfproductions904.com, Sign In again, and retry. If it keeps happening, tell Chris.'
      );
    }
    if (/role doesn't allow/i.test(msg)) {
      return new Error('Your account needs editor access. Ask Chris to grant admin access in Netlify Identity.');
    }
    return err instanceof Error ? err : new Error(msg);
  }

  async function withFallback(filePath, proxyFn, gatewayFn) {
    try {
      return await proxyFn();
    } catch (proxyErr) {
      // If proxy isn't deployed yet or misconfigured, try gateway once
      const m = String(proxyErr.message || '');
      if (/GITHUB_TOKEN|not configured|404|Function not found/i.test(m)) {
        try {
          return await gatewayFn();
        } catch (gwErr) {
          throw friendlyError(gwErr);
        }
      }
      throw friendlyError(proxyErr);
    }
  }

  async function getFile(path) {
    return withFallback(
      path,
      async () => {
        const data = await proxyApi('GET', path);
        const content = decodeURIComponent(escape(atob(String(data.content || '').replace(/\n/g, ''))));
        return { content, sha: data.sha, path: data.path || path };
      },
      async () => {
        const data = await gatewayApi('/contents/' + encodePath(path));
        const content = decodeURIComponent(escape(atob(String(data.content || '').replace(/\n/g, ''))));
        return { content, sha: data.sha, path: data.path };
      }
    );
  }

  async function getJson(path) {
    const file = await getFile(path);
    return { data: JSON.parse(file.content), sha: file.sha, path: file.path };
  }

  async function putFile(path, content, message, sha) {
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const body = {
      message: message || 'Update ' + path,
      content: encoded,
      branch: 'master',
    };
    if (sha) body.sha = sha;
    return withFallback(
      path,
      () => proxyApi('PUT', path, body),
      () =>
        gatewayApi('/contents/' + encodePath(path), {
          method: 'PUT',
          body: JSON.stringify(body),
        })
    );
  }

  async function putJson(path, data, message, sha) {
    const content = JSON.stringify(data, null, 2) + '\n';
    return putFile(path, content, message, sha);
  }

  async function putBinary(path, arrayBuffer, message, sha) {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const encoded = btoa(binary);
    const body = {
      message: message || 'Upload ' + path,
      content: encoded,
      branch: 'master',
    };
    if (sha) body.sha = sha;
    return withFallback(
      path,
      () => proxyApi('PUT', path, body),
      () =>
        gatewayApi('/contents/' + encodePath(path), {
          method: 'PUT',
          body: JSON.stringify(body),
        })
    );
  }

  async function listDir(path) {
    try {
      return await withFallback(
        path,
        async () => {
          const data = await proxyApi('GET', path);
          return Array.isArray(data) ? data : [];
        },
        async () => {
          const data = await gatewayApi('/contents/' + encodePath(path));
          return Array.isArray(data) ? data : [];
        }
      );
    } catch (e) {
      if (/404|not found/i.test(String(e.message))) return [];
      throw friendlyError(e);
    }
  }

  async function deleteFile(path, sha, message) {
    const body = {
      message: message || 'Delete ' + path,
      sha,
      branch: 'master',
    };
    return withFallback(
      path,
      () => proxyApi('DELETE', path, body),
      () =>
        gatewayApi('/contents/' + encodePath(path), {
          method: 'DELETE',
          body: JSON.stringify(body),
        })
    );
  }

  global.GMF_GIT = {
    getFile,
    getJson,
    putFile,
    putJson,
    putBinary,
    listDir,
    deleteFile,
  };
})(window);
